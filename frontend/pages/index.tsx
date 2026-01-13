import { useEffect, useState } from "react";
import Editor from "@monaco-editor/react";

const API_BASE = "http://localhost:8000";

export default function Home() {
  const [code, setCode] = useState("");

  // 처음 페이지 로드 시 backend에서 코드 가져오기
  useEffect(() => {
    fetch(`${API_BASE}/project`)
      .then((res) => res.json())
      .then((data) => setCode(data.content))
      .catch((err) => console.error("Failed to load project:", err));
  }, []);

  // 코드 저장
  const saveCode = async () => {
    await fetch(`${API_BASE}/project`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: code }),
    });
    alert("Saved!");
  };

  return (
    <div style={{ padding: 20 }}>
      <h2>Freeweb Agent MVP</h2>

      <Editor
        height="400px"
        language="python"
        value={code}
        onChange={(value) => setCode(value || "")}
      />

      <button onClick={saveCode} style={{ marginTop: 10 }}>
        Save
      </button>
    </div>
  );
}
