import React, { useEffect } from "react";
import { useMemo, useState } from "react";
import { ChangeBlock } from "../utils/types";

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

interface Props {
  open: boolean;
  mode: "preview" | "manual_review";

  blocks?: ChangeBlock[];
  targetPath?: string;
  reason?: string;
  explanation?: string;
  applying?: boolean;

  onApply: () => void;
  onApplyAndRun: () => void;
  onCancel: () => void;

  onJumpToBlockLine: (blockId: number, lineIndex: number) => void;
  onHoverBlockLine?: (blockId: number, lineIndex: number | null) => void;
};

type PreviewRow = {
  blockId: number;
  lineIndex: number;
  type: "add" | "del" | "context";
  text: string,
}

function buildPreviewRows(blocks?: ChangeBlock[]): PreviewRow[] {
  if (!blocks) return [];

  const rows: PreviewRow[] = [];
  blocks.forEach((block, blockId) => {
    block.lines.forEach((line, lineIndex) => {
      rows.push({
        blockId,
        lineIndex,
        type: line.type,
        text: line.content,
      });
    });
  });

  return rows;
}


export default function FixPreviewModal({
  open,
  mode,
  blocks,
  targetPath,
  reason,
  explanation,
  applying,
  onApply,
  onApplyAndRun,
  onCancel,
  onJumpToBlockLine,
  onHoverBlockLine,
 }: Props) {

  const [showAll, setShowAll] = useState(false);
  const [showReason, setShowReason] = useState(false);

  useEffect(() => {
    if (!open) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onCancel();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open, onCancel]);

  const rows = useMemo(() => buildPreviewRows(blocks), [[blocks]]);

  if (!open) return null;

  return (
    <div style={overlayStyle} onClick={onCancel}>
      <div style={modalStyle} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <h3>
          {mode === "preview" ? "🤖 Agent Fix Preview" : "🔍 Manual Review"}
        </h3>

        {targetPath && (
          <div className="path" style={{ fontSize: 12, marginBottom: 6 }}>Target: {targetPath}</div>
        )}

        {reason && (
          <div className="reason">Reason: {reason}</div>
        )}
        {explanation && (
            <div style={{ 
                background: "#f9fafb", 
                border: "1px solid #e5e7eb", 
                padding: 8, 
                fontSize: 13, borderRadius: 4, marginBottom: 8,
              }}
            >
                <div className="explanation" style={{ fontWeight: 600, marginBottom: 4 }}>
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
        

        <div className="preview" 
          style={{ 
            background: "#f9fafb", 
            border: "1px solid #e5e7eb", 
            padding: 8, 
            fontSize: 13, borderRadius: 4, marginBottom: 8,
          }}>
          {rows.length === 0 && (
            <div className="empty">No preview available</div>
          )}

          {rows.map((r, i) => (
            <div
              key={i}
              className={`row ${r.type}`}
              style={{cursor: "pointer"}}
              onClick={() => onJumpToBlockLine(r.blockId, r.lineIndex)}
              onMouseEnter={() => onHoverBlockLine?.(r.blockId, r.lineIndex)}
              onMouseLeave={() => onHoverBlockLine?.(r.blockId, null)}
            >
              <span className="prefix">
                {r.type === "add" ? "+" : r.type === "del" ? "-" : " "}
              </span>
              <span className="text">{r.text}</span>
            </div>
          ))}
        </div>

        <div className="actions" style={{
            padding: "12px 16px",
            borderTop: "1px solid #ddd",
            display: "flex",
            justifyContent: "flex-end",
            gap: 8,
          }}
        >
          <button onClick={onCancel} disabled={applying}>
            Cancel
          </button>
          {mode === "preview" && (
            <>
              <button onClick={onApply} disabled={applying} style={{
                background: "#2563eb",
                color: "#fff",
                border: "none",
                padding: "6px 12px",
                borderRadius: 4,
                cursor: "pointer",
              }}>
                Apply
              </button>
              <button onClick={onApplyAndRun} disabled={applying} style={{
                background: "#2563eb",
                color: "#fff",
                border: "none",
                padding: "6px 12px",
                borderRadius: 4,
              }}>
                Apply & Run
              </button>
            </>  
          )} 
        </div>
      </div>
    </div>
  );
}
