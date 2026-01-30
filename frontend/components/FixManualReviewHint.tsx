import { ChangeBlock } from "../utils/types";

interface Props {
  blocks?: ChangeBlock[];
  failureType?: string;
  explanation?: string;
}

export default function FixManualReviewHint({
  blocks,
  failureType,
  explanation,
}: Props) {
  if (!blocks || blocks.length === 0) {
    return (
      <div className="fix-hint">
        자동 수정이 어려워 수동 검토가 필요합니다.
      </div>
    );
  }

  return (
    <div className="fix-hint">
      <div className="title">⚠️ 자동 수정 실패</div>

      {failureType && (
        <div className="reason">
          원인: <b>{failureType}</b>
        </div>
      )}

      {explanation && (
        <div className="explanation">
          {explanation}
        </div>
      )}

      <div className="blocks">
        <div className="subtitle">문제가 발생한 위치</div>

        {blocks.map((b, i) => (
          <div key={i} className="block">
            <div className="path">{b.filePath}</div>
            <div className="range">
              수정 범위: old {b.oldStart}~{b.oldStart + b.oldLength - 1},
              new {b.newStart}~{b.newStart + b.newLength - 1}
            </div>
          </div>
        ))}
      </div>

      <div className="hint">
        💡 아래 중 하나를 시도해 보세요:
        <ul>
          <li>에디터에서 직접 수정</li>
          <li>Fix Preview에서 일부만 적용</li>
          <li>코드 구조를 단순화한 뒤 다시 Run</li>
        </ul>
      </div>
    </div>
  );
}
