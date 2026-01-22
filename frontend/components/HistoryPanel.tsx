import React from "react";
import type { RunHistoryItem } from "../hooks/useHistory";


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

type Props = {
  history: RunHistoryItem[];
  onSelect: (item: RunHistoryItem) => void;
}

export default function HistoryPanel({ history, onSelect }: Props) {
  return (
    <div
      style={{
        maxHeight: 240,
        overflowY: "auto",
        border: "1px solid #ddd",
        borderRadius: 10,
        marginTop: 8,
      }}
    >
      {history.length === 0 && (
        <div style={{ padding: 12, fontSize: 12, color: "#888" }}>
          No runs yet
        </div>
      )}

      {history.map((item) => (
        <div
          key={item.id}
          onClick={() => onSelect(item)}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "8px 10px",
            borderBottom: "1px solid #eee",
            cursor: "pointer",
          }}
        >
          {/* Status badge */}
          <span
            style={badgeStyle(item.status)}
            title={`${item.reason ?? ""} (exit=${item.exit_code ?? "n/a"})`}
          >
            {statusLabel(item.status)}
          </span>

          {/* Preview */}
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

          {/* Duration */}
          {typeof item.duration_ms === "number" && (
            <div style={{ fontSize: 11, color: "#888", whiteSpace: "nowrap" }}>
              {Math.round(item.duration_ms / 1000)}s
            </div>
          )}
        </div>
      ))}
    </div>
  );
}