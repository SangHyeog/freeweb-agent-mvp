import { useEffect, useRef } from "react";

import { FixStatus, OutputFixInfo, ChangeBlock } from "../utils/types";
import FixManualReviewHint from "./FixManualReviewHint";
import GenPanel from "./GenPanel";
                 


type Props = {
    output: string;
    autoScroll: boolean;
    setAutoScroll: (v: boolean) => void;
    setOutput: (v: string) => void;

    canFix: boolean;    
    fixStatus: FixStatus;
    onFixWithAgent: () => void;
    onApplyAndRerun: () => void;
    fixInfo?: OutputFixInfo | null;
    previewBlocks?: ChangeBlock[] | null;

    genOpen: boolean;
    genPrompt: string;
    onOpenGen: () => void;
    onChangeGenPrompt: (v: string) => void;
    onCancelGen: () => void;
    onPreviewGen: () => void;
};


export default function OutputPanel (props: Props) {
  const {output, 
    autoScroll, setAutoScroll, setOutput, canFix, fixStatus, 
    onFixWithAgent, onApplyAndRerun, 
    fixInfo, previewBlocks,
    genOpen, genPrompt, onOpenGen, onChangeGenPrompt, onCancelGen, onPreviewGen
  } = props;
  const ref = useRef<HTMLPreElement | null>(null);

  useEffect(() => {
      if (!autoScroll || !ref.current) return;

      ref.current.scrollTop = ref.current.scrollHeight;
  }, [output, autoScroll]);

  return (
    <>
      <div style={{ height: "100%", display: "flex", flexDirection: "column", minHeight: 0 }}>
        {/* ===== 1️⃣ 상단 버튼 바 ===== */}
        <div style={{ padding: "8px 12px", borderTop: "1px solid #ddd", display: "flex", gap: 8, flexShrink: 0, alignItems: "center", }}>
          <button onClick={() => {
            setOutput("");
            if (ref.current) ref.current.scrollTop = 0;
          }}>
            Clear
          </button>

          <button onClick={() => { navigator.clipboard.writeText(output) }}>
            Copy
          </button>

          {/* Fix with Agent */}
          {canFix && onFixWithAgent && fixStatus === "idle" && (
            <button onClick={onFixWithAgent} style={{ background: "#2563eb", color: "#fff", border: "none", padding: "4px 10px", borderRadius: 4, }} >
              🤖 Fix with Agent
            </button>
          )}

          {/* ✨ Generate */}
          {canFix && fixStatus === "idle" && (
            <button onClick={onOpenGen} style={{ background: "#7c3aed", color: "#fff", border: "none", padding: "4px 10px", borderRadius: 4, }} >
              ✨ Generate
            </button>
          )}

          {fixStatus === "applying" && <span>🤖 Applying fix…</span>}

          {fixStatus === "applied" && (
            <button onClick={onApplyAndRerun} style={{ background: "#16a34a", color: "#fff", border: "none", padding: "4px 10px", borderRadius: 4, }} >
              ▶ Apply & Re-run
            </button>
          )}

          {fixStatus === "manual_review" && (
            <FixManualReviewHint  blocks={previewBlocks ?? []} failureType={fixInfo?.failure_type} explanation={fixInfo?.explanation} />
          )}

          <label style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 6 }}>
            <input type="checkbox" checked={autoScroll} onChange={(e) => setAutoScroll(e.target.checked)} />
            Auto-scroll
          </label>
        </div>

        {/* ===== 2️⃣ 👇 여기!!! GenPanel ===== */}
        {genOpen && fixStatus === "idle" && (
          <GenPanel
            open={genOpen}
            prompt={genPrompt}
            onChangePrompt={onChangeGenPrompt}
            onCancel={onCancelGen}
            onPreview={onPreviewGen}
          />
        )}

        {/* ===== 3️⃣ 로그 영역 ===== */}
        <pre ref={ref} style={{ flex: 1, minHeight: 0, overflow: "auto", margin: 0, padding: 12, whiteSpace: "pre-wrap", }} >
          {output}
        </pre>
      </div>
    </>
  );
}