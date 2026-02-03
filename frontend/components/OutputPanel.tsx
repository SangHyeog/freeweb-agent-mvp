import { BlockList } from "net";
import { useEffect, useRef } from "react";

import { FixStatus, OutputFixInfo, ChangeBlock } from "../utils/types";
import FixManualReviewHint from "./FixManualReviewHint";
                 


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
    onJumpToError?: () => void;
    onOpenEditorHelp?: () => void;
};


export default function OutputPanel (props: Props) {
    const {output, 
      autoScroll, setAutoScroll, setOutput, canFix, fixStatus, 
      onFixWithAgent, onApplyAndRerun, 
      fixInfo, previewBlocks,
      onJumpToError, onOpenEditorHelp 
    } = props;
    const ref = useRef<HTMLPreElement | null>(null);

    useEffect(() => {
        if (!autoScroll || !ref.current) return;

        ref.current.scrollTop = ref.current.scrollHeight;
    }, [output, autoScroll]);

    return (
        <>
          <div style={{ height: "100%", display: "flex", flexDirection: "column", minHeight: 0 }}>
            <div style={{ padding: "8px 12px", borderTop: "1px solid #ddd", display: "flex", gap: 8, flexShrink: 0, alignItems: "center"}}>
              <button onClick={() => { setOutput("");
                if (ref.current) ref.current.scrollTop = 0;
              }}>
                Clear
              </button>
              <button onClick={() => { navigator.clipboard.writeText(output) }}>
                Copy
              </button>
              {/* 🤖 Fix with Agent */}
              {fixInfo?.estimated && (
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span
                    style={{
                      background: "#fde68a",
                      color: "#92400e",
                      fontSize: 11,
                      padding: "2px 6px",
                      borderRadius: 4,
                      fontWeight: 600,
                    }}
                  >
                    위치 추정
                  </span>
                  <span style={{ color: "#f59e0b", fontSize: 12 }}>
                    📍 자동 수정이 어려워 위치를 추정해 표시했습니다
                  </span>
                </div>
              )}

              {canFix && onFixWithAgent && fixStatus === "idle" && (
                <button
                  onClick={onFixWithAgent}
                  style={{
                    background: "#2563eb",
                    color: "#fff",
                    border: "none",
                    padding: "4px 10px",
                    borderRadius: 4,
                  }}
                >
                  🤖 Fix with Agent
                </button>
              )}

              {fixStatus === "applying" && <span>🤖 Applying fix…</span>}

              {fixStatus === "applied" && (
                <button onClick={onApplyAndRerun}
                  style={{
                    background: "#16a34a",
                    color: "#fff",
                    border: "none",
                    padding: "4px 10px",
                    borderRadius: 4,
                  }}
                >
                  ▶ Apply & Re-run
                </button>
              )}
              {fixStatus === "manual_review" && (
                <FixManualReviewHint 
                  blocks={previewBlocks ?? []}
                  failureType={fixInfo?.failure_type}
                  explanation={fixInfo?.explanation}
                />
              )}
              <label style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 6 }}>
                <input type="checkbox" checked={autoScroll} onChange={(e) => setAutoScroll(e.target.checked)} /> 
                Auto-scroll
              </label>
            </div>
            <pre ref={ref} style={{ flex: 1, minHeight: 0, overflow: "auto", margin: 0, padding: 12, whiteSpace: "pre-wrap", }}>
              {output}
            </pre>
          </div>
        </>
    );
}