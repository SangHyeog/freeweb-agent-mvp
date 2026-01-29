// frontend/utils/diff.ts

import { read, readlink } from "fs";

/**
 * Extract added line numbers from unified diff
 * Returns 1-based line numbers
 */
export function extractChangedLines(diff: string, code: string): number[] {
    const result: number[] = [];
    const diffLines = diff.split("\n");

    let newLine = 0;

    const hunkRegx = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/;

    for (const line of diffLines) {
        //  hunk header
        const m = line.match(hunkRegx);
        if (m) {
            newLine = parseInt(m[1], 10);
            continue;
        }

        // added line (new file 기준)
        if (line.startsWith("+") && !line.startsWith("+++")) {
            result.push(newLine);
            newLine += 1
            continue;
        }

        // context line (공통)
        if (line.startsWith(" ")) {
            newLine += 1;
        }
        //  removed line (-)는 new file에 없으므로 증가 안함.
    }
    return result;
}
