import { useEffect, useState } from "react";
import Editor from "@monaco-editor/react";

const API_BASE = "http://localhost:8000";

export default function Home() {
  const [code, setCode] = useState("");
  const [output, setOutput] = useState("");

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

  // 실행
  const runCode = async () => {
    /*
    setOutput("Running...\n");
    const res = await fetch(`${API_BASE}/run`, {
      method: "POST",
    });
    const data = await res.json();
    setOutput(data.output);
    */
    setOutput("")
    const ws = new WebSocket("ws://localhost:8000/ws/run");

    ws.onmessage = (event) => {
      setOutput((prev) => prev + event.data);      
    };

    ws.onerror = () => {
      setOutput((prev) => prev + "\n[Process finished]\n");
    };
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

      <div style={{ marginTop: 10 }}>
        <button onClick={saveCode}>Save</button>
        <button onClick={runCode} style={{ marginLeft: 10 }}>Run</button>
      </div>

      <pre
        style={{
          marginTop: 20,
          background: "#111",
          color: "#0f0",
          padding: 10,
          minHeight: 100,
        }}
      >
        {output}
      </pre>
    </div>
  );
}
