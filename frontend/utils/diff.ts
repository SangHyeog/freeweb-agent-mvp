import { ChangeBlock, PreviewRow } from "./types";

/**
 * ChangeBlock[] -> PreviewRow[]
 * preview는 실제 파일 라인번호를 모른다 (가상 좌표계)
 */
export function blocksToPreviewRows(blocks: ChangeBlock[]): PreviewRow[] {
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

/**
 * preview 클릭 시 jump 대상 라인 계산
 * - add -> newLine
 * - del -> oldLine
 * - context -> newLine ?? oldLine
 */
export function getJumpTarget(blocks: ChangeBlock[], blockId: number, lineIndex: number): number | null {
    const block = blocks[blockId];
    if (!block) return null;

    const line = block.lines[lineIndex];
    if (!line) return null;

    return line.newLine ?? line.oldLine ?? null;
}

/**
 * apply 후 highlight 대상 라인 계산 (newLine 기준)
 */
export function collectHighlightLines(blocks: ChangeBlock[]): number[] {
    const lines: number[] = [];

    blocks.forEach((block) => {
        block.lines.forEach((line) => {
            if (line.type === "add" && typeof line.newLine === "number") {
                lines.push(line.newLine);
            }
        });
    });

    return lines;
}
