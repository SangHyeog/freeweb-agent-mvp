import { useEffect, useRef } from "react";

type FixStatus = "idle" | "previewing" | "applying" | "applied" | "not_fixed" | "llm_unavailable";
                 

type Props = {
    output: string;
    autoScroll: boolean;
    setAutoScroll: (v: boolean) => void;
    setOutput: (v: string) => void;

    canFix: boolean;    
    fixStatus: FixStatus;
    onFixWithAgent: () => void;
    onApplyAndRerun: () => void;
};


export default function OutputPanel ({ output, autoScroll, setAutoScroll, setOutput, canFix, fixStatus, onFixWithAgent, onApplyAndRerun }: Props) {
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

              {fixStatus === "previewing" && (
                <span>🤖 Preparing preview…</span>
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

              {fixStatus === "not_fixed" && (
                <span style={{ color: "orange" }}>
                  ⚠️ Could not fix automatically
                </span>
              )}

              {fixStatus === "llm_unavailable" && (
                <span style={{ color: "orange" }}>
                  🤖 Agent unavailable
                </span>
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