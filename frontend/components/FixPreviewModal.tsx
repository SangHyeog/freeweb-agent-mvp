import React, { useEffect } from "react";
import { useMemo, useState } from "react";
import { ChangeBlock, SuspectCandidate } from "../utils/types";

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

  onJumpToBlockLine: (filePath: string, blockId: number, lineIndex: number) => void;
  onHoverBlockLine?: (filePath: string, blockId: number, lineIndex: number | null) => void;

  suspectCandidates?: SuspectCandidate[];
  selectedFile?: string;
  onSelectTargetFile?: (path: string) => void;
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

function groupBlockByFile(blocks?: ChangeBlock[]){
  if (!blocks)
    return [];

  const map = new Map<string, ChangeBlock[]>();

  for (const block of blocks) {
    if (!map.has(block.filePath)) {
      map.set(block.filePath, []);
    }
    map.get(block.filePath)!.push(block);
  }

  return Array.from(map.entries());
}

function hasApplicableChanges(blocks?: ChangeBlock[]) {
  if (!blocks || blocks.length === 0)
    return false;

  return blocks.some((b) => b.filePath !== "unknown" && b.lines?.some(line => line.type === "add" || line.type === "del"));
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
  suspectCandidates,
  selectedFile,
  onSelectTargetFile,
 }: Props) {

  const [showAll, setShowAll] = useState(false);
  const [showReason, setShowReason] = useState(false);

  const canApply = hasApplicableChanges(blocks);

  useEffect(() => {
    if (!open)
      return;

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
  const fileGroups = useMemo(() => groupBlockByFile(blocks), [blocks]);

  if (!open) 
    return null;

  return (
    <div style={overlayStyle} onClick={onCancel}>
      <div style={modalStyle} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <h3>
          {mode === "preview" ? "🤖 Agent Fix Preview" : "🔍 Manual Review"}
        </h3>

        {suspectCandidates && suspectCandidates.length >= 1 && (
          <div style={{ padding: "8px 12px", borderBottom: "1px solid #eee", background: "#fafafa,"}}>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6,}}>
              이 에러와 관련된 파일 후보
            </div>

            {suspectCandidates.map((file) => (
              <label key={file.path} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, cursor: "pointer", opacity: selectedFile === file.path ? 1 : 0.8, }} >
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <input type="radio" checked={file.path === selectedFile} onChange={() => onSelectTargetFile?.(file.path)} />
                  <code>{file.path}</code>
                  <span style={{ fontSize: 11, color: "#2563eb", fontWeight: 600, }}>
                    {file.score}%
                  </span>
                </div>
                <ul style={{ marginLeft: 22, fontSize: 12, color: "#555" }}>
                  {file.reasons.map((r, i) => (
                    <li key={i}>{r}</li>
                  ))}
                </ul>
              </label>
            ))}
          </div>
        )}

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
          {fileGroups.length === 0 && (
            <div className="empty">No preview available</div>
          )}

          {fileGroups.map(([filePath, fileBlocks], fileIndex) => (
            <div key={filePath} style = {{ marginBottom: 12 }}>
              {/* 파일 헤더 */ }
              <div
                style={{
                  fontWeight: 700,
                  fontSize: 13,
                  padding: " 4px 8px",
                  background: "#eef2ff",
                  borderRadius: 4,
                  marginBottom: 4,
                }}
              >
                {filePath}
              </div>
              {/* 해당 파일의 diff lines */}
              {fileBlocks.map((block, blockId) =>
                block.lines.map((line, lineIndex) => (
                  <div 
                    key={`${fileIndex}-${blockId}-${lineIndex}`}
                    className={`row ${line.type}`}
                    onClick={() =>
                      onJumpToBlockLine(filePath, blockId, lineIndex)
                    }
                    onMouseEnter={() => onHoverBlockLine?.(filePath, blockId, lineIndex)}
                    onMouseLeave={() => onHoverBlockLine?.(filePath, blockId, null)}
                    style={{ cursor: "pointer", paddingLeft: 12 }}
                  >
                    <span className="prefix">
                      {line.type === "add" ? "+" : line.type === "del" ? "-" : " "}
                    </span>
                    <span className="text">{line.content}</span>
                  </div>
                ))
              )}
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
          {canApply && mode === "preview" && (
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
