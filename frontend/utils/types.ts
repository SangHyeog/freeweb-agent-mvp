export type FixStatus = "idle" | "preview_ready" | "manual_review" | "applying" | "applied" | "failed";

export type OutputFixInfo = {
  failure_type?: string;
  estimated?: boolean;
  explanation?: string;
};

export type ChangeLineType = "context" | "add" | "del";

//  ChangeBlock 중심 구조
export type ChangeLine = {
  type: ChangeLineType;
  content: string;
  oldLine?: number; // del / context
  newLine?: number; // add / context
};

export type ChangeBlock = {
  filePath: string;
  fileExists?: boolean;
  oldStart: number;
  oldLength: number;
  newStart: number;
  newLength: number;
  lines: ChangeLine[];
};

/* Preview UI 용 가상 행 */
export interface PreviewRow{
  blockId: number;
  lineIndex: number;
  type: ChangeLineType;
  text: string,
}
