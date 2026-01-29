import { useEffect, useRef, useState } from "react";
import Editor from "@monaco-editor/react";

import OutputPanel from "../components/OutputPanel";
import Tabs from "../components/Tabs";
import FileTree from "../components/FileTree";
import QuickOpen from "../components/QuickOpen";
import HistoryPanel from "../components/HistoryPanel";
import FixPreviewModal from "../components/FixPreviewModal";

import { useProjects } from "../hooks/useProjects";
import { useFiles, guessLanguage } from "../hooks/useFiles";
import { useRun } from "../hooks/useRun";
import { useHistory } from "../hooks/useHistory";
import { useRunSpec } from "../hooks/useRunSpec";
import { useRunPresets } from "../hooks/useRunPresets";

import { extractChangedLines } from "../utils/diff";
import type { editor as MonacoEditorType } from "monaco-editor";
import { difference } from "next/dist/build/utils";



export default function Home() {
  const API_BASE = "http://localhost:8000";

  // hooks
  const projects = useProjects(API_BASE);
  const projectId = projects.current;

  const files = useFiles(API_BASE, projectId);
  const run = useRun(API_BASE, projectId);
  const hist = useHistory(API_BASE, projectId);
  const runSpec = useRunSpec(API_BASE, projectId);
  const presets = useRunPresets(API_BASE, projectId);
  
  //  run_id
  const [currentRunId, setCurrentRunId] = useState<string | null>(null);

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

  //  agent fix
  const [fixPreviewOpen, setFixPreviewOpen] = useState(false);
  const [fixDiff, setFixDiff] = useState<string | null>(null);
  const [fixTarget, setFixTarget] = useState<string | undefined>();
  const [fixReason, setFixReason] = useState<string | undefined>();
  const [fixExplanation, setFixExplanation] = useState<string | undefined>();
  const [fixStatus, setFixStatus] = useState<"idle" | "previewing" | "applying" | "applied" | "not_fixed" | "llm_unavailable">("idle");

  const hasError = /ReferenceError|TypeError|SyntaxError|Error:|Traceback|ERR/i.test(output);

  // Editor
  const editorRef = useRef<MonacoEditorType.IStandaloneCodeEditor | null>(null);
  const monacoRef = useRef<any>(null);
  const decorationsRef = useRef<string[]>([]);
  const [pendingDiff, setPendingDiff] = useState<string | null>();

  

  const highlightOverlayStyle: React.CSSProperties = {
    position: "absolute",
    inset: 0,
    pointerEvents: "none",
    fontFamily: "monospace",
    fontSize: 14,
    whiteSpace: "pre",
    lineHeight: "1.5em",
  };

  const editorStyle: React.CSSProperties = {
    position: "absolute",
    inset: 0,
    fontFamily: "monospace",
    fontSize: 14,
    background: "transparent",
    lineHeight: "1.5em",
  };


  // init
  useEffect(() => {
    (async () => {
      //await files.refreshFiles();
      //await files.openFile("main.py");
      await hist.refreshHistory();
      await runSpec.refresh();
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

  //  highlight
  useEffect(() => {
    if (!pendingDiff) return;
    if (!editorRef.current || !monacoRef) return;

    const model = editorRef.current.getModel();
    if (!model) return;

    highlightChangedLines(pendingDiff);
    setPendingDiff(null);

  }, [files.code])

  //  prject change
  useEffect(() =>{
    clearFixHighlights();
  }, [projectId]);
  
  const onRun = () => {
    //  fix 상태 초기화
    setFixStatus("idle");
    setFixDiff(null);
    setFixPreviewOpen(false);

    //  runid초기화
    setCurrentRunId(null);
    setOutput("");

    run.run(
      (chunk) => {
        const m = String(chunk).match(/\[RUN_ID\]\s*([a-zA-Z0-9_-]+)/);
        if (m?.[1])
          setCurrentRunId(m[1]);
        setOutput((prev) => prev + chunk);
      },
      () => hist.refreshHistory(),
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

  async function previewFix() {
    if (!currentRunId) return;

    try {
      const res = await fetch(`${API_BASE}/agent/fix/preview`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          project_id: projectId,
          run_id: currentRunId,
          entry: "main.js",
          lang: "node",
        }),
      });

      const data = await res.json().catch(() => null);

      if (!res.ok) {
        // 서버가 quota/llm_error 같은 걸 detail에 넣는 경우가 많아서 분기
        setFixStatus("llm_unavailable");
        return;
      }

      const patch = data.patches?.[0];
      const diff = patch?.diff_preview;

      //  diff 미리보기 상태 셋팅
      setFixDiff(diff);
      setFixTarget(patch?.target);
      setFixReason(data.reason || data.meta?.failure_type);
      setFixExplanation(data.meta?.explanation);

      // 모달 열기
      setFixPreviewOpen(true);

      // 준비 완료 -> idle로 복귀(모달에서 apply/cancel)
      setFixStatus("idle");
    } catch (e) {
      setFixStatus("llm_unavailable");
    }
  } 

  async function applyFix() {
    if (!fixDiff || !currentRunId) return;

    setFixStatus("applying");

    console.log("SENDING DIFF:\n", fixDiff);

    try {
      const res = await fetch(`${API_BASE}/agent/fix/apply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          project_id: projectId,
          run_id: currentRunId,
          diff: fixDiff,
        }),
      });
      
      if (!res.ok){
        setFixStatus("not_fixed");
        return;
      }

      //  수정된 파일 다시 로드
      const newContent = await files.reloadFile("main.js");

      setPendingDiff(fixDiff);

      /*// 하이라이트표시
      const lines = extractChangedLines(fixDiff, files.code);
      highlightChangedLines(lines, fixDiff);

      if (lines.length > 0 && editorRef.current) {
        editorRef.current.revealLineInCenter(lines[0]);
      }*/

      //  상태 갱신
      setFixDiff(null);
      setFixStatus("applied");
      //  모달 닫기
      setFixPreviewOpen(false);
    } catch {
      setFixStatus("not_fixed");
    }
  }

  async function applyAndRun() {
    if (!fixDiff || !currentRunId) return;

    setFixStatus("applying");

    try {
      const res = await fetch(`${API_BASE}/agent/fix/apply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          project_id: projectId,
          run_id: currentRunId,
          diff: fixDiff,
        }),
      });

      if (!res.ok) {
        setFixStatus("not_fixed");
        return;
      }

      // ✅ Fix 적용 완료
      setFixPreviewOpen(false);
      setFixDiff(null);
      setFixStatus("idle");

      // ✅ 바로 Run 재실행
      onRun();   // ← 기존 Run 버튼과 동일한 함수
    } catch {
      setFixStatus("not_fixed");
    }
  }

  const onApplyAndRerun = () => {
    // Fix 상태 초기화
    setFixStatus("idle");

    // output 초기화 (선택)
    setOutput("");

    // 다시 run 실행
    onRun();
  };

  function highlightChangedLines(diff: string){
    const monaco = monacoRef.current
    if (!editorRef.current || !monaco) return;

    const model = editorRef.current.getModel();
    if (!model) return;

    //  diff에서 +라인 내용 추출
    const addedContents = extractAddedContents(diff);
    const decorations = [];

    for (const content of addedContents) {
      const line = findLineByContent(model, content);
      if (!line) continue;

      decorations.push({
        range: new monaco.Range(line, 1, line, model.getLineMaxColumn(line)),
        options: {
          isWholeLine: true,
          className: "agent-fix-line",
        },
      });
    }

    decorationsRef.current = model.deltaDecorations(
      decorationsRef.current,
      decorations
    );

    // 5초 후 자동 제거
    /*setTimeout(() => {
      clearFixHighlights();
    }, 5000);*/
  }

  function extractAddedContents(diff: string): string[] {
    return diff
      .split("\n")
      .filter(l => l.startsWith("+") && !l.startsWith("+++"))
      .map(l => l.slice(1).trim())
      .filter(Boolean);
  }

  function findLineByContent(model: MonacoEditorType.ITextModel, content: string): number | null {
    const lineCount = model.getLinesContent();

    for (let i = 1; i <= lineCount.length; i++) {
      const line = model.getLineContent(i).trim();
      if (line === content)  {
        return i;
      }
    }
    return null
  }


  function clearFixHighlights(){
    const editor = editorRef.current;
    if (!editor) return;

    const model = editor.getModel();
    if (!model) return;

    decorationsRef.current = model.deltaDecorations(
      decorationsRef.current,
      []
    );
  }
  
  return (
    <div style={{ height: "100%", display: "flex", fontFamily: "sans-serif" }}>
      {/* Left */}
      <div style={{ width: 350, borderRight: "1px solid #ddd", padding: 12 }}>
        <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
          <select value={projects.current} 
            onChange={async (e) => {
              const pid = e.target.value;
              projects.setCurrent(pid);

              setOutput("");
            }} 
            disabled={run.isRunning} style={{flex:1}}
          >
            {projects.projects.map((p) => (<option key={p} value={p}> {p} </option>))}
          </select>
          <button 
            onClick={async () => {
              const pid = prompt("New project id (e.g. hello-node):");
              if (!pid) return;

              const res = await fetch(`${API_BASE}/projects`, {
                method: "POST",
                headers: { "Content-Type": "application/json"},
                body: JSON.stringify({ project_id: pid }),
              });
              if (!res.ok) {
                alert("Failed to create project");
                return;
              }
              await projects.refresh();
              projects.setCurrent(pid);
            }}
            disabled={run.isRunning}
          >
            New Project
          </button>
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
          <HistoryPanel
            key={projectId}
            history={hist.history}
            onSelect={async (item) => {
              const header = 
                `[ID] ${item.id}\n` +
                `[STATUS] ${item.status}` +
                `[DURATION] ${item.duration_ms?? "n/a"}ms\n` +
                `[EXIT] ${item.exit_code?? "n/a"}\n` +
                `[REASON] ${item.reason?? ""}\n\n`;

              const out = await hist.loadHistoryOutput(item.id);
              setOutput(header + (out || ""));
            }}
          />
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
          onClose={(path) =>{
              clearFixHighlights();
              files.closeTab(path);
          }}
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
            onMount={(editor, monaco) => {
              editorRef.current = editor;
              monacoRef.current = monaco;
            }}
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
          <OutputPanel 
            output={output} 
            autoScroll={autoScroll} 
            setAutoScroll={setAutoScroll} 
            setOutput={setOutput} 
            
            canFix={!run.isRunning && !!currentRunId && hasError}
            fixStatus={fixStatus}
            onFixWithAgent={previewFix}
            onApplyAndRerun={onApplyAndRerun}
          />
        </div>
      </div>
      <FixPreviewModal
        open={fixPreviewOpen}
        diff={fixDiff}
        targetPath={fixTarget}
        reason={fixReason}
        explanation={fixExplanation}
        onApply={applyFix}
        onApplyAndRun={applyAndRun}
        onCancel={() => {
          setFixPreviewOpen(false);
          setFixDiff(null);
          setFixStatus("idle");
        }}
        applying={fixStatus === "applying"}
      />
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
