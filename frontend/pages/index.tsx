import toast from "react-hot-toast";
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

import { FixStatus, RunStatus, OutputFixInfo, ChangeBlock, SuspectCandidate } from "../utils/types";
import type { editor as MonacoEditorType } from "monaco-editor";

import { useAgentGen } from "../hooks/useAgentGen";


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

  const {previewGen, applyGen} = useAgentGen(API_BASE);

  //  tab
  const agentEnabled = canUseAgent();

  //  run_id
  const [currentRunId, setCurrentRunId] = useState<string | null>(null);
  const [lastRunContext, setLastRunContext] = useState<{ entry: string; lang: string; } | null>(null);

  // quick open
  const [quickOpen, setQuickOpen] = useState(false);
  const [query, setQuery] = useState("");

  // output panel
  const [output, setOutput] = useState("");
  const [autoScroll, setAutoScroll] = useState(true);
  const [outputFixInfo, setOutputFixInfo] = useState<OutputFixInfo | null>(null);

  // editor state
  const [editorHeight, setEditorHeight] = useState<number>(300);    // px
  const containerRef = useRef<HTMLDivElement | null>(null);
  const isDraggingRef = useRef(false);
  const dragStartYRef = useRef<number>(0);
  const dragStartHeightRef = useRef<number>(0);

  //  Suspect State
  const [suspectCandidates, setSuspectCandidates] = useState<SuspectCandidate[] | null>(null);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);

  //  agent preview (fix + gen 공통)
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewDiff, setPreviewDiff] = useState<string | null>(null);
  const [previewBlocks, setPreviewBlocks] = useState<ChangeBlock[] | null>(null);
  const [previewTarget, setPreviewTarget] = useState<string | undefined>();
  const [previewReason, setPreviewReason] = useState<string | undefined>();
  const [previewExplanation, setPreviewExplanation] = useState<string | undefined>();
  const [previewStatus, setPreviewStatus] = useState<FixStatus>("idle");

  //  agent gen
  const [genOpen, setGenOpen] = useState(false);
  const [genPrompt, setGenPrompt] = useState("");

  //  run Status
  const [runStatus, setRunStatus] = useState<RunStatus>("idle");
  const [autoFixTriggered, setAutoFixTriggerd] = useState(false);
  

  const [lastErrorLine, setLastErrorLine] = useState<number | null>(null);
  const hasError = /ReferenceError|TypeError|SyntaxError|Error:|Traceback|ERR/i.test(output);

  // Editor
  const editorRef = useRef<MonacoEditorType.IStandaloneCodeEditor | null>(null);
  const monacoRef = useRef<any>(null);
  const decorationsRef = useRef<string[]>([]);
  const hoverDecorationsRef = useRef<string[]>([]);

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
    if (!previewBlocks) return;
    if (!editorRef.current || !monacoRef) return;

    const model = editorRef.current.getModel();
    if (!model) return;

    const currentPath = files.selectedPath;
    const lines: number[] = [];

    //  diff 기반 라인 추출
    for (const b of previewBlocks) {
      if (b.filePath !== currentPath)
        continue;
      for (const line of b.lines) {
        const n = line.newLine ?? line.oldLine;
        if (n)
          lines.push(n);
      }
    }

    if (lines.length) {
      highlightChangedLines(Array.from(new Set(lines)));
      editorRef.current.revealLineInCenter(lines[0]);
    }
  }, [files.selectedPath, files.code])

  //  prject change
  useEffect(() =>{
    clearFixHighlights();
  }, [projectId]);

  //  run 종료 시 저장
  useEffect(() => {
    const line = extractErrorLine(output);
    if (line)
      setLastErrorLine(line);
  }, [output]);

  function resolveEntry(): string | null {
    if (runSpec.spec?.entry){
      return runSpec.spec?.entry;
    }

    if (files.selectedPath) {
      return files.selectedPath;
    }

    const hasFile = (name: string) =>
      files.items.some((it) => it.type === "file" && it.path === name);

    if (hasFile("main.js"))
      return "main.js";

    if (hasFile("index.js"))
      return "index.js";

    return null;
  }

  const onRun = async (): Promise<boolean> => {
    const entry = resolveEntry();
    const lang = runSpec.spec?.lang ?? "node";

    if (!entry) {
      alert("Cannot determine entry file");
      return false;
    }

    setLastRunContext({entry, lang});

    //  fix 상태 초기화
    setPreviewStatus("idle");
    setPreviewDiff(null);
    setPreviewOpen(false);

    //  runid초기화
    setCurrentRunId(null);
    setOutput("");

    return new Promise<boolean>((resolve) => {
      let hadError = false;
      
      run.run(
        (chunk) => {
          const text = String(chunk);

          //  RUN_ID 추출
          const m = text.match(/\[RUN_ID\]\s*([a-zA-Z0-9_-]+)/);
          if (m?.[1])
            setCurrentRunId(m[1]);

          //  에러 감지(보수적으로)
          if (text.includes("[ERROR]") || text.includes("Error") || text.includes("Exception")) {
            hadError = true;
          }

          setOutput((prev) => prev + text);
        },

        //  run 종료 콜백
        () => {
          hist.refreshHistory();
          resolve(!hadError);
        }
      );
    });
  };

  const onStop = async () => {
    await run.stop();
  };

  const onSave = async () => {
    await files.saveCurrent();
    await files.refreshFiles();     //  UI 상태 갱신
    runSpec.refresh();              //  실행 규칙 재 감지
  };

  function canUseAgent(): boolean {
    //  탭이 없으면 entry 추론 금지
    if (!files.tabs || files.tabs.length === 0) 
      return false;

    return true;
  }

  async function previewFix() {
    if (!currentRunId || !lastRunContext) {
      alert("Run spec is not ready yet. Try again in a moment.");
      return;
    }

    try {
      const res = await fetch(`${API_BASE}/agent/fix/preview`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          project_id: projectId,
          run_id: currentRunId,
          entry: lastRunContext.entry,
          lang: lastRunContext.lang,
          opened_files: files.tabs.map(t => t.path),
        }),
      });

      if (!res.ok) {
        setPreviewStatus("failed");
        return;
      }

      const data = await res.json();
      console.log("PREVIEW RESPONSE:", data);

      const blocks = data.meta?.blocks;
      if (!res.ok || !data.ok || !blocks || blocks.length === 0) {
        setPreviewStatus("manual_review");
        return;
      }

      const diff = data.patches?.[0].diff_preview;

      //  diff 미리보기 상태 셋팅
      //setPreviewBlocks(data.meta?.blocks ?? null);
      //setPreviewDiff(data.patches?.[0]?.diff_preview ?? null);
      setPreviewBlocks(blocks);
      setPreviewDiff(diff);

      setSuspectCandidates(data.meta?.suspect_candidates ?? null);
      setSelectedFile(data.meta?.selected_file ?? null);
      
      //setPreviewTarget(runSpec.spec?.entry);
      setPreviewTarget(data.meta?.selected_file ?? lastRunContext.entry);
      setPreviewReason(data.reason);
      setPreviewExplanation(data.meta?.explanation);

      //  Output셋팅
      setOutputFixInfo({
        failure_type: data.meta?.failure_type,
        estimated: data.meta?.estimated ?? false,
        explanation: data.meta?.explanation,
      });

      // 모달 열기
      setPreviewOpen(true);

      // 준비 완료 -> idle로 복귀(모달에서 apply/cancel)
      //setPreviewStatus(data.patches?.[0]?.diff_preview ? "preview_ready" : "manual_review");
      setPreviewStatus(data.diff ? "preview_ready" : "manual_review");
    } catch (e) {
      setPreviewStatus("failed");
    }
  } 

  async function applyFix() {
    if (!previewDiff || !currentRunId) return;

    setPreviewStatus("applying");

    console.log("SENDING DIFF:\n", previewDiff);

    try {
      const res = await fetch(`${API_BASE}/agent/fix/apply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          project_id: projectId,
          run_id: currentRunId,
          diff: previewDiff,
        }),
      });
      
      if (!res.ok){
        setPreviewStatus("failed");
        return;
      }

      const data = await res.json();
      setPreviewBlocks(data.meta?.blocks ?? null);

      //  상태 갱신
      setPreviewDiff(null);
      setPreviewStatus("applied");
      await files.refreshFiles();
      runSpec.refresh(); 

      //  모달 닫기
      setPreviewOpen(false);
    } catch {
      setPreviewStatus("failed");
    }
  }

  async function applyAndRun() {
    if (!previewDiff || !currentRunId) 
      return;

    setPreviewStatus("applying");

    try {
      //  Fix 적용
      const res = await fetch(`${API_BASE}/agent/fix/apply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          project_id: projectId,
          run_id: currentRunId,
          diff: previewDiff,
        }),
      });

      if (!res.ok) {
        setPreviewStatus("failed");
        return;
      }

      //  Fix 적용 완료 -> preview 종료
      setPreviewOpen(false);
      setPreviewDiff(null);
      setPreviewStatus("idle");

      //  Run 실행(결과를 기다림)
      setRunStatus("running");

      //  onRun은 반드시 boolean or result를 return 해야 함.
      const runOK = await onRun();

      if (runOK){
        setRunStatus("ok");
      } else {
        //  run 실패 -> Fix 다시 유도
        setRunStatus("error");
        //  fixStatus는 idle이므로 Fix with Agent 버튼 다시 보임

        //  Auto Fix
        if (!autoFixTriggered) {
          triggerAutoFixPreview();
        }
      }
    } catch (e) {
      setPreviewStatus("failed");
      setRunStatus("error");
    }
  }

  const onApplyAndRerun = () => {
    // Fix 상태 초기화
    setPreviewStatus("idle");

    // output 초기화 (선택)
    setOutput("");

    // 다시 run 실행
    onRun();
  };

  function highlightChangedLines(lines: number[]) {
    if (!editorRef.current || !monacoRef.current) return;

    const model = editorRef.current.getModel();
    if (!model) return;

    const decorations = lines.map((line) => ({
      range: new monacoRef.current.Range(line, 1, line, model.getLineMaxColumn(line)),
      options: {
        isWholeLine: true,
        className: "agent-fix-line",
      },
    }));

    decorationsRef.current = model.deltaDecorations(
      decorationsRef.current,
      decorations
    );

    // 5초 후 자동 제거
    /*setTimeout(() => {
      clearFixHighlights();
    }, 5000);*/
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

  async function jumpToBlockLine(filePath: string, _blockId: number, lineIndex: number) {
    const blocks = previewBlocks;
    if (!blocks)
      return;

    const block = blocks.find((b) => b.filePath === filePath);
    if (!block)
      return;

    //  아직 생성되지 않은 파일
    if (block.fileExists === false) {
      toast(`"${filePath}" will be created when you apply this fix.`, { icon: "ℹ️" });
      return;
    }

    //  다른 파일이면 먼저 열기
    if (files.selectedPath !== filePath) {
      await files.openFile(filePath);
    }

    const line = findBlockLine(filePath, lineIndex);
    if (!line || !editorRef.current) 
      return;

    editorRef.current.revealLineInCenter(line);
    editorRef.current.setPosition({ lineNumber: line, column: 1, });
    editorRef.current.focus();
  }

  function findLineByContent(model: MonacoEditorType.ITextModel, content: string, around?: number): number | null {
    const total = model.getLineCount();
    let best: number | null = null;
    let bestDist = Infinity;

    for (let i = 1; i <= total; i++) {
      const line = model.getLineContent(i).trim();
      if (line === content.trim()) {
        if (around == null) return i;

        const dist = Math.abs(i - around);
        if (dist < bestDist) {
          best = i;
          bestDist = dist;
        }
      }
    }
    return best
  }

  function findBlockLine(filePath: string, lineIndex: number): number | null {
    if (!editorRef.current)
      return null;

    const model = editorRef.current.getModel();
    if (!model || !previewBlocks)
      return null;

    const block = previewBlocks.find(b => b.filePath === filePath);
    if (!block)
      return null;

    const line = block.lines[lineIndex];
    if (!line)
      return null;

    return (
      findLineByContent(model, line.content, block.newStart) ?? block.newStart
    );
  }

  function jumpToError() {
    if (!editorRef.current || !lastErrorLine) return;

    editorRef.current.revealLineInCenter(lastErrorLine);
    editorRef.current.setPosition({
      lineNumber: lastErrorLine,
      column: 1,
    });
  }

  function extractErrorLine(output: string): number | null {
    // 예: /app/main.js:3
    const m = output.match(/\/app\/.+?:(\d+)/);
    return m ? parseInt(m[1], 10) : null;
  }

  function openEditorHelp() {
    if (!editorRef.current) return;

    const model = editorRef.current.getModel();
    if (!model) return;

    const hint = `// TODO: 변수 선언 또는 값 확인 필요\n`;

    model.applyEdits([
      {
        range: {
          startLineNumber: 1,
          startColumn: 1,
          endLineNumber: 1,
          endColumn: 1,
        },
        text: hint,
      },
    ]);

    editorRef.current.focus();
  }

  function previewHoverLine(filePath: string, _blockId: number, lineIndex: number | null) {
    const blocks = previewBlocks;
    if (!blocks)
      return;

    const block = blocks.find((b) => b.filePath === filePath);
    if (!block)
      return;

    //  아직 생성되지 않은 파일
    if (block.fileExists === false) {
      toast(`"${filePath}" will be created when you apply this fix.`, { icon: "ℹ️" });
      return;
    }

    if (!editorRef.current || !monacoRef.current) 
      return;

    const model = editorRef.current.getModel();
    if (!model) 
      return;

    // hover 해제
    if (lineIndex == null) {
      hoverDecorationsRef.current = model.deltaDecorations(hoverDecorationsRef.current, []);
      return;
    }

    const line = findBlockLine(filePath, lineIndex);
    if (!line) 
      return;

    hoverDecorationsRef.current = model.deltaDecorations(
      hoverDecorationsRef.current,
      [{
        range: new monacoRef.current.Range(line, 1, line, model.getLineMaxColumn(line)),
        options: {
          isWholeLine: true,
          className: "agent-fix-hover-line",
        },
      }]
    );
  }

  function onOpenGenPanel() {
    setGenOpen(true);
  }

  function onCancelGen() {
    setGenPrompt("");
    setGenOpen(false);
  }

  async function onGeneratePreview() {
    if (!genPrompt.trim())
      return;

    //  FixPreviewModal로 진입
    setPreviewStatus("preview_ready");
    setGenOpen(false);

    const {ok, data} = await previewGen({
      project_id: projectId,
      prompt: genPrompt,
    });

    if (!ok || !data.ok || !data.blocks) {
      setPreviewStatus("manual_review");
      return;
    }

    setPreviewBlocks(data.blocks);
    setPreviewDiff(data.diff);
    setPreviewOpen(true);
  }

  async function handleGenPreview(prompt: string) {
    setPreviewStatus("preview_ready");

    const spec = runSpec.spec;
    if (!spec)
      return;

    const {ok, data} = await previewGen({
      project_id: projectId,
      run_id: currentRunId,
      prompt,
      entry: spec.entry,
      lang: spec.lang,
    });

    if (!ok) {
      setPreviewStatus("failed");
      return;
    }

    setPreviewBlocks(data.meta?.blocks ?? null);
    setPreviewDiff(data.patches?.[0]?.diff_preview ?? null);
    setPreviewTarget(spec.entry);
    setPreviewReason(data.reason);
    setPreviewExplanation(data.meta?.explanation);

    setPreviewOpen(true);
    //  diff 없으면 manual_review
    setPreviewStatus(data.patches?.[0]?.diff_preview ? "preview_ready" : "manual_review");
  }

  async function applyGenFix() {
    if (!previewDiff || !currentRunId) return;

    console.log("SENDING DIFF:\n", previewDiff);

    setPreviewStatus("applying");

    const { ok, data } = await applyGen({
      project_id: projectId,
      run_id: currentRunId,
      diff: previewDiff,
    });

    if (!ok) {
      setPreviewStatus("failed");
      return;
    }
      
    //  상태 갱신
    setPreviewDiff(null);
    setPreviewStatus("applied");

    setPreviewBlocks(data.meta?.blocks ?? null);

    //  모달 닫기
    setPreviewOpen(false);    
  }
  
  async function triggerAutoFixPreview() {
    if (!currentRunId) return;
    if (autoFixTriggered) return;

    setAutoFixTriggerd(true);

    setPreviewStatus("preview_ready");

    try {
      const res = await fetch(`${API_BASE}/agent/fix/preview`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          project_id: projectId,
          run_id: currentRunId,
          entry: lastRunContext?.entry,
          lang: lastRunContext?.lang,
          opened_files: files.tabs.map(t => t.path),
        }),
      });

      const data = await res.json();

      if (!res.ok || !data.ok || !data.blocks) {
        setPreviewStatus("manual_review");
        return;
      }

      setPreviewBlocks(data.blocks);
      setPreviewDiff(data.patches?.[0]?.diff_preview ?? null);
      setPreviewOpen(true);
    }
    catch {
      setPreviewStatus("manual_review");
    }
  }

  async function onSelectTargetFile(file: string) {
    if (!currentRunId || !lastRunContext)
      return;

    setSelectedFile(file);
    setPreviewStatus("applying");   // 로딩 표시용

    const res = await fetch(`${API_BASE}/agent/fix/preview`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        project_id: projectId,
        run_id: currentRunId,
        entry: lastRunContext.entry,
        lang: lastRunContext.lang,
        opened_files: files.tabs.map(t => t.path),
        selected_file: file,
        force_target: true,
      }),
    });

    const data = await res.json();
    if (!res.ok || !data.ok || !data.meta?.blocks) {
      setPreviewStatus("manual_review");
      return;
    }
      

    setPreviewBlocks(data.meta.blocks);
    setPreviewDiff(data.patches?.[0]?.diff_preview ?? null);
    setPreviewTarget(file);
    setPreviewReason(data.reason);
    setPreviewExplanation(data.meta.explanation);

    setPreviewStatus("preview_ready");
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
            
            agentEnabled={agentEnabled}
            canFix={!run.isRunning && !!currentRunId && hasError}
            fixStatus={previewStatus}
            runStatus={runStatus}
            onFixWithAgent={previewFix}
            onApplyAndRerun={onApplyAndRerun}
            fixInfo={outputFixInfo}
            previewBlocks={previewBlocks}

            genOpen={genOpen}
            genPrompt={genPrompt}
            onOpenGen={onOpenGenPanel}
            onChangeGenPrompt={setGenPrompt}
            onCancelGen={onCancelGen}
            onPreviewGen={onGeneratePreview}
          />
        </div>
      </div>
      <FixPreviewModal
        open={previewOpen}
        mode={previewStatus === "manual_review" ? "manual_review" : "preview"}
        blocks={previewBlocks ?? undefined}
        targetPath={previewTarget}
        reason={previewReason}
        explanation={previewExplanation}
        applying={previewStatus === "applying"}

        onApply={applyFix}
        onApplyAndRun={applyAndRun}
        onCancel={() => {
          setPreviewOpen(false);
          previewHoverLine("", 0, null);   //  닫힐 때 hover 제거
          setPreviewStatus("idle");
        }}
        onJumpToBlockLine={jumpToBlockLine}
        onHoverBlockLine={previewHoverLine}
        suspectCandidates={suspectCandidates ?? undefined}
        selectedFile={selectedFile ?? undefined}
        onSelectTargetFile={onSelectTargetFile}
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
