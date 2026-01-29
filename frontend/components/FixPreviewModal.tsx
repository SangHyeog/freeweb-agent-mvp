import React from "react";
import { useState } from "react";


type Props = {
  open: boolean;
  diff: string | null;
  targetPath?: string;
  reason?: string;
  explanation?: string;

  onApply: () => void;
  onApplyAndRun: () => void;
  onCancel: () => void;

  applying?: boolean;
};

const overlayStyle: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(0,0,0,0.4)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  zIndex: 50,
};

const modalStyle: React.CSSProperties = {
  background: "#fff",
  width: "80%",
  maxWidth: 900,
  maxHeight: "80%",
  padding: 16,
  borderRadius: 6,
  display: "flex",
  flexDirection: "column",
  gap: 8,
};

const diffBoxStyle: React.CSSProperties = {
  flex: 1,
  overflow: "auto",
  border: "1px solid #ddd",
  background: "#fafafa",
};

function DiffLine({ line }: { line: string }) {
  let style: React.CSSProperties = {
    whiteSpace: "pre-wrap",
    fontFamily: "monospace",
    fontSize: 13,
    padding: "0 6px",
  };

  if (line.startsWith("+") && !line.startsWith("+++")) {
    style.background = "#dcfce7"; // green-100
    style.color = "#166534";      // green-800
  } else if (line.startsWith("-") && !line.startsWith("---")) {
    style.background = "#fee2e2"; // red-100
    style.color = "#7f1d1d";      // red-800
  } else if (line.startsWith("@@")) {
    style.background = "#f3f4f6"; // gray-100
    style.color = "#374151";
    style.fontStyle = "italic";
  }

  return <div style={style}>{line}</div>;
}


export default function FixPreviewModal({
  open,
  diff,
  targetPath,
  reason,
  explanation,
  onApply,
  onApplyAndRun,
  onCancel,
  applying
}: Props) {
  if (!open || !diff) return null;

  const [showAll, setShowAll] = useState(false);
  const [showReason, setShowReason] = useState(false);

  const lines = diff.split("\n");

  return (
    <div style={overlayStyle}>
      <div style={modalStyle}>
        {/* Header */}
        <h3>🤖 Agent Fix Preview </h3>

        {targetPath && (
            <div style={{ fontSize: 12, marginBottom: 6 }}>
                Target: <b>{targetPath}</b>
            </div>
        )}
        
        {explanation && (
            <div style={{ 
                background: "#f9fafb", 
                border: "1px solid #e5e7eb", 
                padding: 8, 
                fontSize: 13, borderRadius: 4, marginBottom: 8,}}
            >
                <div style={{ fontWeight: 600, marginBottom: 4 }}>
                    🤖 Why this fix?
                </div>
                <div>
                    {showReason ? explanation : explanation.split(".")[0] + "."}
                </div>
                
                {explanation.includes(".") && (
                    <button onClick={() => setShowReason((v) => !v)}
                        style={{
                            fontSize: 12,
                            marginTop: 4,
                            color: "#2563eb",
                            background: "none",
                            border: "none",
                            cursor: "pointer",
                        }}
                    >
                        {showReason ? "Hide details" : "Show details"}
                    </button>
                )}
            </div>
        )}
        <button onClick={() => setShowAll((v) => !v)}
            style={{ fontSize: 12, padding: "2px 8px", borderRadius: 4 }}
        >
            {showAll ? "Hide context": "Show full diff"}
        </button>

        {/* Diff */}
        <pre style={diffBoxStyle}>
            {lines
                .filter((line) => {
                    if (showAll) return true;
                    return (
                        line.startsWith("+") ||
                        line.startsWith("-") ||
                        line.startsWith("@@")
                    );
                })
                .map((line, idx) => (
                    <DiffLine key={idx} line={line} />
                ))
            }
        </pre>

        {/* Actions */}
        <div
          style={{
            padding: "12px 16px",
            borderTop: "1px solid #ddd",
            display: "flex",
            justifyContent: "flex-end",
            gap: 8,
          }}
        >
          <button onClick={onCancel} disabled={applying}>Cancel</button>
          <button
            onClick={onApply}
            disabled={!diff || applying}
            style={{
              background: "#2563eb",
              color: "#fff",
              border: "none",
              padding: "6px 12px",
              borderRadius: 4,
              cursor: diff ? "pointer" : "not-allowed",
            }}
          >
            Apply Fix
          </button>
          <button
            onClick={onApplyAndRun}
            disabled={!diff || applying}
            style={{
            background: "#2563eb",
            color: "#fff",
            border: "none",
            padding: "6px 12px",
            borderRadius: 4,
            }}
        >
            Apply & Re-run
        </button>
        </div>
      </div>
    </div>
  );
}
