import { useEffect, useRef, useState } from "react";
import Editor from "@monaco-editor/react";

import OutputPanel from "../components/OutputPanel";
import Tabs from "../components/Tabs";
import FileTree from "../components/FileTree";
import QuickOpen from "../components/QuickOpen";

import { useFiles, guessLanguage } from "../hooks/useFiles";
import { useRun } from "../hooks/useRun";
import { useHistory } from "../hooks/useHistory";
import { useRunSpec } from "../hooks/useRunSpec";
import { useRunPresets } from "../hooks/useRunPresets";


export default function Home() {
  const API_BASE = "http://localhost:8000";

  // hooks
  const files = useFiles(API_BASE);
  const run = useRun(API_BASE);
  const hist = useHistory(API_BASE);
  const runSpec = useRunSpec(API_BASE);
  const presets = useRunPresets(API_BASE);

  // quick open
  const [quickOpen, setQuickOpen] = useState(false);
  const [query, setQuery] = useState("");

  // output panel
  const [output, setOutput] = useState("");
  const [autoScroll, setAutoScroll] = useState(true);

  // editor state
  const [editorHeight, setEditorHeight] = useState<number>(300);    // px
  const containerRef = useRef<HTMLDivElement | null>(null);
  const isDraggingRef = useRef(false);
  const dragStartYRef = useRef<number>(0);
  const dragStartHeightRef = useRef<number>(0);


  // init
  useEffect(() => {
    (async () => {
      await files.refreshFiles();
      await files.openFile("main.py");
      //await hist.refreshHistory();
    })();
  }, []);

  // ctrl+p
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key.toLowerCase() === "p") {
        e.preventDefault();
        setQuickOpen(true);
        setQuery("");
      }
      if (e.key === "Escape") setQuickOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  // mousemove / mouseup event
  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
        if (!isDraggingRef.current || !containerRef.current) 
            return;

        const rect = containerRef.current.getBoundingClientRect();
        const delta = e.clientY - dragStartYRef.current;
        const next = dragStartHeightRef.current + delta;

        const min = 120;
        const max = rect.height - 120;

        setEditorHeight(Math.min(Math.max(next, min), max));
    };

    const onMouseUp = () => {
        if (!isDraggingRef.current)
            return;

        isDraggingRef.current = false;
        document.body.style.cursor = "";
    };

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);

    return () => {
        window.removeEventListener("mousemove", onMouseMove);
        window.removeEventListener("mouseup", onMouseUp);
    };
  }, []);

  const onRun = () => {
    setOutput("");
    run.run(
      (chunk) => setOutput((prev) => prev + chunk),
      () => hist.refreshHistory()
    );
  };

  const onStop = async () => {
    await run.stop();
  };

  const onSave = async () => {
    await files.saveCurrent();
    await files.refreshFiles();     //  UI 상태 갱신
    runSpec.refresh();              //  실행 규칙 재 감지
  };

  function badgeStyle(s: string): React.CSSProperties {
    // 색 지정은 원하면 나중에 바꿔도 됨 (우선은 구분만 되게)
    let bg = "#eee";
    let border = "#ccc";
    let color = "#333";

    if (s === "success") { bg = "#e7f7ee"; border = "#bde5c8"; color = "#1f7a3a"; }
    else if (s === "error") { bg = "#ffecec"; border = "#f5b5b5"; color = "#a40000"; }
    else if (s === "timeout") { bg = "#fff4e5"; border = "#ffd199"; color = "#9a5b00"; }
    else if (s === "oom") { bg = "#ffecec"; border = "#f5b5b5"; color = "#7a0000"; }
    else if (s === "stopped") { bg = "#fff8db"; border = "#f1e0a0"; color = "#7a5a00"; }
    else if (s === "disconnected") { bg = "#eef2ff"; border = "#c7d2fe"; color = "#3730a3"; }
    else if (s === "running") { bg = "#e0f2fe"; border = "#bae6fd"; color = "#075985"; }

    return {
        padding: "2px 8px",
        borderRadius: 999,
        fontSize: 12,
        background: bg,
        border: `1px solid ${border}`,
        color,
        lineHeight: "18px",
        whiteSpace: "nowrap",
    };
  }

  function statusLabel(s: string) {
    if (s === "success") return "OK";
    if (s === "error") return "ERR";
    if (s === "timeout") return "TIMEOUT";
    if (s === "oom") return "OOM";
    if (s === "stopped") return "STOP";
    if (s === "disconnected") return "DISC";
    if (s === "running") return "RUN";

    return s.toUpperCase();
  }

  return (
    <div style={{ height: "100%", display: "flex", fontFamily: "sans-serif" }}>
      {/* Left */}
      <div style={{ width: 300, borderRight: "1px solid #ddd", padding: 12 }}>
        <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
          <button
            onClick={async () => {
              const p = prompt("New file path (e.g. lib/helper.py):");
              if (!p) return;
              await files.createFile(p);
              runSpec.refresh();
            }}
            disabled={run.isRunning}
          >
            New
          </button>
          <button onClick={files.refreshFiles} disabled={run.isRunning}>
            Refresh
          </button>
          <button onClick={hist.refreshHistory} disabled={run.isRunning}>
            History
          </button>
        </div>

        <div style={{ fontWeight: 800, marginBottom: 8 }}>Files</div>
        <FileTree
          tree={files.tree}
          expanded={files.expanded}
          setExpanded={files.setExpanded as any}
          selectedPath={files.selectedPath}
          onOpenFile={files.openFile}
          onRenameFile={async (path) => {
            const next = prompt("Rename to:", path);
            if (!next || next === path) return;
            await files.renameFile(path, next);
            runSpec.refresh();
          }}
          disabled={run.isRunning}
          onDeleteFile={async (path) => {
            const ok = confirm(`Delete file?\n\n${path}`);
            if (!ok)
                return;
            await files.deleteFile(path);
            await files.refreshFiles();
            runSpec.refresh();
          }}
        />

        <div style={{ marginTop: 14, fontWeight: 800 }}>Run History</div>
        <div style={{ maxHeight: 240, overflowY: "auto", border: "1px solid #ddd", borderRadius: 10, marginTop: 8 }}>
          {hist.history.map((item) => (
            <div
              key={item.id}
              onClick={async () => {
              // 기존에 history 클릭하면 output 로드하는 로직 유지
              // 예: setOutput(item.output);
              const header =
                `[ID] ${item.id}\n` +
                `[STATUS] ${item.status}\n` +
                `[DURATION] ${item.duration_ms?? "n/a"}ms\n` +
                `[EXIT] ${item.exit_code?? "n/a"}\n` +
                `[REASON] ${item.reason?? ""}\n\n`;

              const out = await hist.loadHistoryOutput(item.id);
              setOutput(header + (out || ""));
              }}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "8px 10px",
                borderBottom: "1px solid #eee",
                cursor: "pointer",
              }}
            >
            {/* ✅ 1) 상태 뱃지 */}
              <span
                style={badgeStyle(item.status)}
                title={`${item.reason ?? ""} (exit=${item.exit_code ?? "n/a"})`}
              >
                {statusLabel(item.status)}
              </span>

            {/* ✅ 2) preview (넘치면 ... 처리) */}
              <div
                style={{
                    flex: 1,
                    minWidth: 0,
                    fontSize: 12,
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                }}
                    title={item.preview || ""}
              >
                {item.preview || "(no output)"}
              </div>

            {/* ✅ 3) (선택) duration 표시 */}
            {typeof item.duration_ms === "number" && (
                <div style={{ fontSize: 11, color: "#888", whiteSpace: "nowrap" }}>
                    {Math.round(item.duration_ms / 1000)}s
                </div>
            )}
            </div>
          ))}
        </div>
      </div>

      {/* Right */}
      <div ref={containerRef} style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        <Tabs
          tabs={files.tabs}
          selectedPath={files.selectedPath}
          onSelect={(path) => {
            const tab = files.tabs.find((t) => t.path === path);
            if (!tab) return;
            files.setSelectedPath(path);
            files.setCode(tab.content);
          }}
          onClose={(path) => files.closeTab(path)}
          disabled={run.isRunning}
        />

        <div style={{ padding: 12, borderBottom: "1px solid #ddd", display: "flex", gap: 8 }}>
          <div style={{ fontWeight: 800 }}>{files.selectedPath}</div>
          <div style={{ /*marginLeft: "auto",*/ display: "flex", alignItems: "center", gap: 8 }}>
            <button onClick={onSave} disabled={run.isRunning}>
              Save
            </button>
            <button onClick={onRun} disabled={run.isRunning}>
              Run
            </button>
            <button onClick={onStop} disabled={!run.isRunning}>
              Stop
            </button>

            {runSpec.loading && (
              <span style={{ fontSize: 12, opacity: 0.7 }}>Detecting...</span>
            )}

            {runSpec.spec && (
              <span style={{ fontSize: 12, padding: "2px 8px", borderRadius: 12, background: "#eef", border: "1px solid #ccd",}}
                title={`Entry: ${runSpec.spec.entry}\nImage: ${runSpec.spec.image}`}
              >
                Detected: {runSpec.spec.lang}
                {runSpec.spec.source === "run.json" && " (custom)"}
              </span>
            )}

            {runSpec.error && (
              <span style={{ fontSize: 12, color: "red" }}>
                Run spec error: {runSpec.error}
              </span>
            )}

            {presets.current && presets.choices && (
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <label style={{ fontSize: 12 }}>
                        Timeout
                        <select
                            value={presets.current.timeout_s}
                            onChange={async (e) => {
                                const next = { ...presets.current!, timeout_s: Number(e.target.value) };
                                await presets.update(next);
                                runSpec.refresh(); // ✅ spec 갱신
                            }}
                            disabled={run.isRunning}
                        >
                            {presets.choices.timeout_s.map((v) => (
                                <option key={v} value={v}>{v}s</option>
                            ))}
                        </select>
                    </label>

                    <label style={{ fontSize: 12 }}>
                        Memory
                        <select
                            value={presets.current.memory_mb}
                            onChange={async (e) => {
                                const next = { ...presets.current!, memory_mb: Number(e.target.value) };
                                await presets.update(next);
                                runSpec.refresh();
                            }}
                            disabled={run.isRunning}
                        >
                            {presets.choices.memory_mb.map((v) => (
                                <option key={v} value={v}>{v}MB</option>
                            ))}
                        </select>
                    </label>

                    <label style={{ fontSize: 12 }}>
                    Lang
                    <select
                        value={presets.current.lang}
                        onChange={async (e) => {
                            const next = { ...presets.current!, lang: e.target.value };
                            await presets.update(next);
                            runSpec.refresh();
                        }}
                        disabled={run.isRunning}
                    >
                        {presets.choices.lang.map((v) => (
                            <option key={v} value={v}>{v}</option>
                        ))}
                    </select>
                    </label>
                </div>
                )}
          </div>
        </div>

        <div style={{ height: editorHeight, minHeight: 120, overflow: "hidden", }}>
          <Editor
            height="100%"
            language={guessLanguage(files.selectedPath)}
            value={files.code}
            onChange={(v) => files.updateCode(v || "")}
          />
        </div>

        <div
            style={{
              height: 6,
              cursor: "row-resize",
              background: "#e0e0e0",
              flexShrink: 0,
            }}
            onMouseEnter={(e) => {
                e.currentTarget.style.background = "#c0c0c0";
            }}
            onMouseLeave={(e) => {
                e.currentTarget.style.background = "#e0e0e0";
            }}
            onMouseDown={(e) => {
              e.preventDefault();

              isDraggingRef.current = true;
              dragStartYRef.current = e.clientY;
              dragStartHeightRef.current = editorHeight;

              document.body.style.cursor = "row-resize";
            }}
            onDoubleClick={() => {
              // 50:50 리셋
              if (!containerRef.current) return;
              const total = containerRef.current.clientHeight;
              setEditorHeight(Math.floor(total / 2));
            }}
        />

        <div style={{ flex: 1, minHeight: 0 }}>
          <OutputPanel output={output} autoScroll={autoScroll} setAutoScroll={setAutoScroll} setOutput={setOutput} />
        </div>
      </div>

      <QuickOpen
        open={quickOpen}
        items={files.items}
        query={query}
        setQuery={setQuery}
        onPick={async (path) => {
          await files.openFile(path);
          setQuickOpen(false);
        }}
        onClose={() => setQuickOpen(false)}
      />
    </div>
  );
}
