import { useEffect, useRef, useState } from "react";
import Editor from "@monaco-editor/react";

const API_BASE = "http://localhost:8000";

export default function Home() {
  const [code, setCode] = useState("");
  const [output, setOutput] = useState("");
  const [isRunning, setIsRunning] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);

  // 처음 페이지 로드 시 backend에서 코드 가져오기
  useEffect(() => {
    fetch(`${API_BASE}/projects`)
      .then((res) => res.json())
      .then((data) => setCode(data.content))
      .catch((err) => console.error("Failed to load project:", err));
  }, []);

  // 코드 저장
  const saveCode = async () => {
    await fetch(`${API_BASE}/projects`, {
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
    /*
    setOutput("")
    const ws = new WebSocket("ws://localhost:8000/ws/run");

    ws.onmessage = (event) => {
      setOutput((prev) => prev + event.data);      
    };

    ws.onerror = () => {
      setOutput((prev) => prev + "\n[Process finished]\n");
    };*/
    if (isRunning) return;

    setOutput("");
    setIsRunning(true);

    const ws = new WebSocket("ws://localhost:8000/ws/run");
    wsRef.current = ws;

    ws.onmessage = (event) => {
      setOutput((prev) => prev + event.data);
    };

    ws.onerror = () => {
      setOutput((prev) => prev + "\n[WebSocket Error]\n");
      setIsRunning(false);
      wsRef.current = null;
    };

    ws.onclose = () => {
      setOutput((prev) => prev + "\n[WebSocket Closed]\n");
      setIsRunning(false);
      wsRef.current = null;
    };
  };

  const stopCode = async () => {
    //  서버에 Stop 요청
    await fetch(`${API_BASE}/stop`, {
      method: "POST",
    });

    //  클라이언트 ws도 닫아주면 UX가 깔끔.
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    setIsRunning(false);
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
        <button onClick={saveCode} disabled={isRunning}>Save</button>
        <button onClick={runCode} disabled={isRunning} style={{ marginLeft: 10 }}>Run</button>
        <button onClick={stopCode} disabled={!isRunning} style={{ marginLeft: 10 }}>Stop</button>
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
