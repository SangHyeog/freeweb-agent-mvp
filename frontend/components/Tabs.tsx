import { Tab } from "@/hooks/useFiles";

type Props = {
    tabs: Tab[];
    selectedPath: string;
    onSelect: (path: string) => void;
    onClose: (path: string) => void;
    disabled?: boolean;
};


export default function Tabs({ tabs, selectedPath, onSelect, onClose, disabled }: Props) {
    return (
        <div style={{ display: "flex", gap: 6, padding: "8px 12px", borderBottom: "1px solid #ddd", overflowX: "auto" }}>
          {tabs.map((t) => {
            const active = t.path === selectedPath;
            return (
              <div 
                key={t.path}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "6px 10px",
                  borderRadius: 10,
                  cursor: "pointer",
                  background: active ? "#eef" : "#f6f6f6",
                  border: "1px solid #ddd",
                  whiteSpace: "nowrap",
                }}
                title={t.path}
                onClick={() => onSelect(t.path)}
              >
                <span>
                  {t.path} {t.isDirty ? "●" : ""}
                </span>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onClose(t.path);
                  }}
                  disabled={disabled}
                >
                  x
                </button>
              </div>
            );
          })}
        </div>
    );
}