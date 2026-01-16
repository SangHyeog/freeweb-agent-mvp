import { useMemo } from "react";
import { FileItem } from "../hooks/useFiles";

type Props = {
  open: boolean;
  items: FileItem[];
  query: string;
  setQuery: (v: string) => void;
  onPick: (path: string) => void;
  onClose: () => void;
};

export default function QuickOpen({ open, items, query, setQuery, onPick, onClose }: Props) {
  const allFiles = useMemo(() => items.filter((x) => x.type === "file").map((x) => x.path), [items]);
  const filtered = useMemo(
    () => allFiles.filter((p) => p.toLowerCase().includes(query.toLowerCase())).slice(0, 30),
    [allFiles, query]
  );

  if (!open) return null;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.3)",
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "center",
        paddingTop: 80,
      }}
      onClick={onClose}
    >
      <div style={{ width: 650, background: "white", borderRadius: 12, padding: 12 }} onClick={(e) => e.stopPropagation()}>
        <div style={{ fontWeight: 700, marginBottom: 8 }}>Quick Open (Ctrl+P)</div>
        <input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Type to search..."
          style={{ width: "100%", padding: 10, border: "1px solid #ddd", borderRadius: 8 }}
        />
        <div style={{ marginTop: 10, maxHeight: 360, overflowY: "auto" }}>
          {filtered.map((p) => (
            <div
              key={p}
              style={{ padding: 10, cursor: "pointer", borderBottom: "1px solid #eee" }}
              onClick={() => onPick(p)}
            >
              {p}
            </div>
          ))}
          {filtered.length === 0 && <div style={{ padding: 10, opacity: 0.7 }}>No matches</div>}
        </div>
      </div>
    </div>
  );
}
