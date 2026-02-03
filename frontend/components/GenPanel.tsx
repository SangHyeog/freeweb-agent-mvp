import { useState } from "react";

interface Props {
  onPreview: (prompt: string) => void;
}

export default function GenPanel({
    onPreview,
}: Props) {
    const [prompt, setPrompt] = useState("");

    return (
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <input
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder='e.g.: "util.js에 getValue() 함수 만들어줘."'
                style={{ flex: 1, padding: 6 }}
            />
            <button onClick={() => onPreview(prompt)} disabled={!prompt.trim()}>
                Gen Preview
            </button>
        </div>
    );
}