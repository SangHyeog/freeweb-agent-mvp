import { PreviewRow } from "../utils/types";

interface Props {
  rows: PreviewRow[];
  onClickRow: (row: PreviewRow) => void;
}

export default function FixPreview({ rows, onClickRow }: Props) {
  return (
    <div className="fix-preview">
      {rows.map((r, i) => (
        <div
          key={i}
          className={`row ${r.type}`}
          onClick={() => onClickRow(r)}
        >
          <span className="prefix">
            {r.type === "add" ? "+" : r.type === "del" ? "-" : " "}
          </span>
          <span className="text">{r.text}</span>
        </div>
      ))}
    </div>
  );
}
