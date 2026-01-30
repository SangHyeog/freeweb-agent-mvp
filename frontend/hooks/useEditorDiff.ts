import * as monaco from "monaco-editor";
import { ChangeBlock } from "../utils/types";
import { getJumpTarget, collectHighlightLines } from "../utils/diff";

export function useEditorDiff(editor: monaco.editor.IStandaloneCodeEditor | null) {
    let decorationIds: string[] = [];

    function jumpTo(blocks: ChangeBlock[], blockId: number, lineIndex: number) {
        if (!editor) return;

        const line = getJumpTarget(blocks, blockId, lineIndex);
        if (!line) return;

        editor.revealLineInCenter(line);
        editor.setPosition({ lineNumber: line, column: 1 });
        editor.focus();
    }

    function highlight(blocks: ChangeBlock[]) {
        if (!editor) return;

        const lines = collectHighlightLines(blocks);

        decorationIds = editor.deltaDecorations(
            decorationIds,
            lines.map((ln) => ({
                range: new monaco.Range(ln, 1, ln, 1),
                options: {
                    isWholeLine: true,
                    className: "diff-added-line",
                },
            }))
        );
    }

    function clearHighlight() {
        if (!editor) return;
        decorationIds = editor.deltaDecorations(decorationIds, []);
    }

    return { jumpTo, highlight, clearHighlight };
}
