interface Props {
    open: boolean;
    prompt: string;
    onChangePrompt: (v: string) => void;
    onCancel: () => void;
    onPreview: () => void;
}

export default function GenPanel({
    open,
    prompt,
    onChangePrompt,
    onCancel,
    onPreview,
}: Props) {
    if (!open)
        return;

    return (
        <div className="gen-panel" style={{ borderTop: "1px solid #e5e7eb", padding: "12px", background: "#fafafa"}}>
            <div className="gen-title" style={{ fontWeight: 600, marginBottom: 8 }}>
                ✨ Generate with Agent
            </div>

            <div style={{ position: "relative", width: "100%", maxWidth: "100%", }}>
                <textarea 
                    value={prompt}
                    onChange={(e) => onChangePrompt(e.target.value)}
                    placeholder="Description what yoy want to generate.."
                    style={{
                        display: "block",
                        width: "100%",
                        minHeight: 140,
                        resize: "vertical",
                        padding: "12px 14px 52px 14px",      //  하단 버튼 공간 확보
                        boxSizing: "border-box",
                        fontFamily: "inherit",
                        fontSize: 13,
                        lineHeight: 1.5,
                        borderRadius: 6,
                        border: "1px solid #d1d5db",
                    }}
                />
                <div style={{ position: "absolute", right: 12, bottom: 12, display: "flex", gap: 8, pointerEvents: "auto"}}>
                    <button onClick={onCancel} style={{ background: "#fff", border: "1px solid #d1d5db", padding: "4px 10px", borderRadius: 4, fontSize: 12, }}>
                        Cancel
                    </button>

                    <button disabled={!prompt.trim()} onClick={onPreview} style={{ background: "#7c3aed", color: "#fff", border: "none", padding:"4px 12px", borderRadius: 4, fontSize: 12, opacity: prompt.trim() ? 1 : 0.5, cursor: prompt.trim() ? "pointer" : "default"}} >
                        Preview
                    </button>
                </div>
            </div>
        </div>
    );
}