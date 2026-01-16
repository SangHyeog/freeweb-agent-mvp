import { useEffect, useState } from "react";
import Editor from "@monaco-editor/react";

import OutputPanel from "../components/OutputPanel";
import Tabs from "../components/Tabs";
import FileTree from "../components/FileTree";
import QuickOpen from "../components/QuickOpen";

import { useFiles, guessLanguage } from "../hooks/useFiles";
import { useRun } from "../hooks/useRun";
import { useHistory } from "../hooks/useHistory";

const API_BASE = "http://localhost:8000";

export default function Home() {
  // hooks
  const files = useFiles(API_BASE);
  const run = useRun(API_BASE);
  const hist = useHistory(API_BASE);

  // quick open
  const [quickOpen, setQuickOpen] = useState(false);
  const [query, setQuery] = useState("");

  // output panel
  const [output, setOutput] = useState("");
  const [autoScroll, setAutoScroll] = useState(true);

  // init
  useEffect(() => {
    (async () => {
      await files.refreshFiles();
      await files.openFile("main.py");
      await hist.refreshHistory();
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
    await files.refreshFiles();
  };

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
          }}
          disabled={run.isRunning}
        />

        <div style={{ marginTop: 14, fontWeight: 800 }}>Run History</div>
        <div style={{ maxHeight: 240, overflowY: "auto", border: "1px solid #ddd", borderRadius: 10, marginTop: 8 }}>
          {hist.history.map((h) => (
            <div
              key={h.id}
              style={{
                padding: 10,
                cursor: "pointer",
                borderBottom: "1px solid #eee",
                background: hist.selectedRunId === h.id ? "#eef" : "transparent",
              }}
              onClick={async () => {
                const out = await hist.loadHistoryOutput(h.id);
                setOutput(out);
                // history 클릭은 새 컨텍스트: 맨 위로 보는 UX가 자연스러움
                // OutputPanel 내부에서 Clear/History 처리까지 하고 싶으면 prop으로 훅 더 파면 됨
              }}
            >
              <div style={{ fontSize: 12, fontWeight: 800 }}>
                {h.status.toUpperCase()} • {h.id}
              </div>
              <div style={{ fontSize: 12, opacity: 0.8, whiteSpace: "pre-wrap" }}>{h.preview}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Right */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
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
          <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
            <button onClick={onSave} disabled={run.isRunning}>
              Save
            </button>
            <button onClick={onRun} disabled={run.isRunning}>
              Run
            </button>
            <button onClick={onStop} disabled={!run.isRunning}>
              Stop
            </button>
          </div>
        </div>

        <div style={{ flex: 1, minHeight: 0 }}>
          <Editor
            height="100%"
            language={guessLanguage(files.selectedPath)}
            value={files.code}
            onChange={(v) => files.updateCode(v || "")}
          />
        </div>

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
