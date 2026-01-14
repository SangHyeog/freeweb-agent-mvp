import { useEffect, useRef, useState } from "react";
import Editor from "@monaco-editor/react";

const API_BASE = "http://localhost:8000";

type FileItem = { path: string, type: "file" | "dir" };

function guessLanguage(path: string) {
    if (path.endsWith(".py")) return "python";
    if (path.endsWith(".ts") || path.endsWith(".tsx")) return "typescript";
    if (path.endsWith(".js") || path.endsWith(".jsx")) return "javascript";
    if (path.endsWith(".json")) return "json";
    if (path.endsWith(".md")) return "markdown";

    return "plaintext";
}


export default function Home() {
    const [items, setItems] = useState<FileItem[]>([]);
    const [selectedPath, setSelectedPath] = useState<string>("main.py");
    const [code, setCode] = useState("");
    const [output, setOutput] = useState("");
    const [isRunning, setIsRunning] = useState(false);
    const wsRef = useRef<WebSocket | null>(null);

    const refreshFiles = async () => {
        const res = await fetch(`${API_BASE}/files`);
        const data = await res.json();
        setItems(data.items || []);
    };

    const openFile = async (path: string) => {
        const res = await fetch(`${API_BASE}/files/read?path=${encodeURIComponent(path)}`);
        if (!res.ok) {
            alert(`Failed to open: ${path}`);
            return;
        }
        const data = await res.json();
        setSelectedPath(path);
        setCode(data.content || "");
    };

    const saveFile = async () => {
        await fetch(`${API_BASE}/files/write`, {
            method: "POST",
            headers: { "Content-Type": "application/json"},
            body: JSON.stringify({ path: selectedPath, content: code }),
        });
        alert("Saved!");
        await refreshFiles();
    };

    const createFile = async () => {
        const path = prompt("New file path (e.g. lib/helper.py)");
        if (!path) return;

        const res = await fetch(`${API_BASE}/files/create`, {
            method: "POST",
            headers: { "Content-Type": "application/json"},
            body: JSON.stringify({ path }),
        });
        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            alert(err.detail || "Create failed");
            return;
        }
        await refreshFiles();
        await openFile(path);
    };

    const deleteFile = async (path: string) => {
        if (!confirm(`Delete ${path}?`)) return;
        const res = await fetch(`${API_BASE}/files/delete`, {
            method: "PSOT",
            headers: { "Content-Type": "application/json"},
            body: JSON.stringify({ path }),
        });
        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            alert(err.detail || "Delete failed");
            return;
        }
        await refreshFiles();
        //  삭제한 파일이 열려있었으면 main.py로 fallback
        if (selectedPath === path) {
            await openFile("main.py");
        }
    };

    const runCode = () => {
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
        await fetch(`${API_BASE}/stop`, { method: "POST" });

        //  클라이언트 WS는 닫아 UX를 빠르게
        if (wsRef.current) {
            wsRef.current.close();
            wsRef.current = null;
        }
        setIsRunning(false);
    };

    useEffect(() => {
        //  최초 로딩: 파일 목록 + main.py 오픈
        (async () => {
            await refreshFiles();
            await openFile("main.py");
        })();
    }, []);

    const filesOnly = items.filter((x) => x.type === "file");

    return (
        <div style={{ height: "100vh", display: "flex", fontFamily: "sans-serif" }}>
            {/* Left: File Explorer */}
            <div style={{ width: 280, borderRight: "1px solid #ddd", padding: 12 }}>
                <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
                    <button onClick={createFile} disabled={isRunning}>New</button>
                    <button onClick={refreshFiles} disabled={isRunning}>Refresh</button>
                </div>

                <div style={{ fontWeight: 700, marginBottom: 8 }}>Files</div>

                <div style={{ overflowY: "auto", maxHeight: "calc(100vh - 80px)" }}>
                    {filesOnly.map((f) => (
                        <div
                            key={f.path}
                            onClick={() => openFile(f.path)}
                            style={{
                                padding: "6px 8px",
                                cursor: "pointer",
                                background: f.path === selectedPath ? "#eef" : "transparent",
                                borderRadius: 6,
                                display: "flex",
                                justifyContent: "space-between",
                                alignItems: "center",
                            }}
                            title={f.path}
                            >
                            <span style={{ fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                {f.path}
                            </span>
                            {f.path !== "main.py" && (
                                <button onClick={(e) => { e.stopPropagation(); deleteFile(f.path); }} disabled={isRunning} > x </button>
                            )}
                        </div>
                    ))}
                </div>
            </div>

            {/* Right: Editor + Controls */}
            <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
                <div style={{ padding: 12, borderBottom: "1px solid #ddd", display: "flex", alignItems: "center", gap: 10 }}>
                    <div style={{ fontWeight: 700 }}>{selectedPath}</div>
                    <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
                        <button onClick={saveFile} disabled={isRunning}>Save</button>
                        <button onClick={runCode} disabled={isRunning} style={{ marginLeft: 6 }}>Run</button>
                        <button onClick={stopCode} disabled={!isRunning}>Stop</button>
                    </div>
                </div>

                <div style={{ flex: 1 }}>
                <Editor
                    height="60vh"
                    language={guessLanguage(selectedPath)}
                    value={code}
                    onChange={(value) => setCode(value || "")}
                />
                </div>

                <pre style={{ flex: 1, margin: 0, padding: 12, borderTop: "1px solid #ddd", overflow: "auto" }}>
                {output}
                </pre>
            </div>
        </div>
    );
}