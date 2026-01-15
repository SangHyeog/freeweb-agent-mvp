import { useEffect, useRef, useState } from "react";
import Editor from "@monaco-editor/react";

const API_BASE = "http://localhost:8000";

type FileItem = { path: string, type: "file" | "dir" };
type TreeNode =  
    | { type: "dir"; name: string; path: string; children: TreeNode[] } 
    | { type: "file"; name: string; path: string };

type Tab = { path: string, content: string; isDirty: boolean };
type RunHistoryItem = {
    id: string;
    started_at: number;
    ended_at: number | null;
    status: string,
    preview: string,
};


function guessLanguage(path: string) {
    if (path.endsWith(".py")) return "python";
    if (path.endsWith(".ts") || path.endsWith(".tsx")) return "typescript";
    if (path.endsWith(".js") || path.endsWith(".jsx")) return "javascript";
    if (path.endsWith(".json")) return "json";
    if (path.endsWith(".md")) return "markdown";

    return "plaintext";
}

function buildTree(items: FileItem[]): TreeNode {
    const root: { type: "dir"; name: string; path: string; children: TreeNode[] } = {
        type: "dir",
        name: "",
        path: "",
        children: [],
    };

    const ensureDir = (parent: any, name: string, fullpath: string) => {
        let node = parent.children.find((c: any) => c.type === "dir" && c.name === name);
        if (!node) {
            node = { type: "dir", name, path: fullpath, children: [] };
            parent.children.push(node);
        }
        return node;
    }

    for (const it of items) {
        const parts = it.path.split("/").filter(Boolean);
        let cur: any = root;
        for (let i = 0; i < parts.length; i++) {
            const isLast = i === parts.length - 1;
            const part = parts[i];
            const fullPath = parts.slice(0, i + 1).join("/");

            if (isLast && it.type === "file") {
                cur.children.push({ type: "file", name: part, path: fullPath });
            } else {
                cur = ensureDir(cur, part, fullPath);
            }
        }
    }

    const sortNode = (node: any) => {
        node.children.sort((a: any, b: any) => {
            if (a.type !== b.type) return a.type === "dir" ? -1 : 1;
            return a.name.localeCompare(b.name);
        });
        node.children.forEach((c: any) => c.type === "dir" && sortNode(c));
    };
    sortNode(root);

    return root;
}


export default function Home() {
    const [items, setItems] = useState<FileItem[]>([]);
    const [selectedPath, setSelectedPath] = useState<string>("main.py");
    const [code, setCode] = useState("");
    const [output, setOutput] = useState("");
    const [isRunning, setIsRunning] = useState(false);
    const wsRef = useRef<WebSocket | null>(null);
    const [expanded, setExpanded] = useState<Record<string, boolean>>({ "": true });
    const [tabs, setTabs] = useState<Tab[]>([]);
    const [history, setHistory] = useState<RunHistoryItem[]>([]);
    const [selectedRunId, setSelectedRunId] = useState<string | null>(null);

    //  history
    const refreshHistory = async () => {
        const res = await fetch(`${API_BASE}/history?limit=30`);
        const data = await res.json();
        setHistory(data.items || []);
    };

    //  Tree
    const tree = buildTree(items);

    const renderNode = (node: TreeNode, depth: number = 0) => {
        const pad = 8 + depth * 12;

        if (node.type === "dir") {
            const isOpen = expanded[node.path] ?? false;
            return (
                <div key={node.path}>
                    {node.path !== "" && (
                        <div
                            style={{ padding: "4px 6px", marginLeft: pad, cursor: "pointer", fontWeight: 700 }}
                            onClick={() => setExpanded((p) => ({...p, [node.path]: !isOpen }))}
                        >
                            {isOpen ? "▾" : "▸"} {node.name}
                        </div>
                    )}
                    {(node.path === "" || isOpen) && node.children.map((c) => renderNode(c, node.path === "" ? depth: depth + 1))} 
                </div>
            );
        }

        //  file
        const isActive = node.path === selectedPath;
        return (
            <div
                key = {node.path}
                onClick={() => openFile(node.path)}
                style={{
                    padding: "4px 6px",
                    marginLeft: pad,
                    cursor: "pointer",
                    background: isActive ? "#eef" : "transparent",
                    borderRadius: 6,
                }}
                title={node.path}
            >
                {node.name}
            </div>
        );
    };

    //  File
    const refreshFiles = async () => {
        const res = await fetch(`${API_BASE}/files`);
        const data = await res.json();
        setItems(data.items || []);
    };

    const openFile = async (path: string) => {
        //  이미 탭이 있으면 전환만
        const existing = tabs.find((t) => t.path === path);
        if (existing) {
            setSelectedPath(path);
            setCode(existing.content);
            return;
        }

        const res = await fetch(`${API_BASE}/files/read?path=${encodeURIComponent(path)}`);
        if (!res.ok) {
            alert(`Failed to open: ${path}`);
            return;
        }
        const data = await res.json();
        const content = data.content || "";

        setTabs((prev) => [...prev, { path, content, isDirty: false }]);    /* ...prev는 ["a", "b", "c"](이전 상태 값으로 갖고 있는 것) */
        setSelectedPath(path);
        setCode(content);
    };

    const saveFile = async () => {
        const cur = tabs.find((t) => t.path === selectedPath);
        const contentToSave = cur ? cur.content : code;

        await fetch(`${API_BASE}/files/write`, {
            method: "POST",
            headers: { "Content-Type": "application/json"},
            body: JSON.stringify({ path: selectedPath, content: code }),
        });

        setTabs((prev) => 
            prev.map((t) => (t.path === selectedPath ? { ...t, isDirty: false } : t ))
        );

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
            refreshHistory();
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
            await refreshHistory();
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
                {/* 파일 만 보이게 할 때
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
                </div>*/
                }
                { /* 트리 형태로 보이게 할 때 */ }
                <div style={{ overflowY: "auto", maxHeight: "calc(100vh - 80px)" }}>
                    {renderNode(tree, 0)}
                </div>
                { /* 히스토리 */ }
                <div style={{ marginTop: 16 }}>
                    <div style={{ fontWeight: 700, marginBottom: 6 }}>Run History</div>
                    <button onClick={refreshHistory} disabled={isRunning}>Reload</button>

                    <div style={{ marginTop: 8, maxHeight: 220, overflowY: "auto", border: "1px solid #ddd", borderRadius: 8 }}>
                        {history.map((h) => (
                            <div
                                key={h.id}
                                onClick={async () => {
                                    setSelectedRunId(h.id);
                                    const res = await fetch(`${API_BASE}/history/${h.id}`);
                                    const data = await res.json();
                                    setOutput(data.output || "");
                                }}
                                style={{
                                    padding: 8,
                                    cursor: "pointer",
                                    borderBottom: "1px solid #eee",
                                    background: selectedRunId === h.id ? "#eef" : "transparent",
                                }}
                            >
                                <div style={{ fontSize: 12, fontWeight: 700 }}>
                                    {h.status.toUpperCase()} • {h.id}
                                </div>
                                <div style={{ fontSize: 12, opacity: 0.8, whiteSpace: "pre-wrap" }}>
                                    {h.preview}
                                </div>
                            </div>
                        ))}
                    </div>
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
                    <div style={{ display: "flex", gap: 6, padding: "8px 12px", borderBottom: "1px solid #ddd", overflowX: "auto" }}>
                        {tabs.map((t) => {
                            const active = t.path === selectedPath;
                            return (
                                <div
                                    key={t.path}
                                    onClick={() => {
                                    setSelectedPath(t.path);
                                    setCode(t.content);
                                    }}
                                    style={{
                                    padding: "6px 10px",
                                    borderRadius: 8,
                                    cursor: "pointer",
                                    background: active ? "#eef" : "#f6f6f6",
                                    border: "1px solid #ddd",
                                    whiteSpace: "nowrap",
                                    }}
                                    title={t.path}
                                >
                                    {t.path} {t.isDirty ? "●" : ""}
                                </div>
                            );
                        })}
                    </div>

                    <Editor
                        height="60vh"
                        language={guessLanguage(selectedPath)}
                        value={code}
                        /*onChange={(value) => setCode(value || "")}*/
                        onChange={(value) => {
                            const v = value || "";
                            setCode(v);
                            setTabs((prev) =>
                                prev.map((t) =>
                                    t.path === selectedPath ? { ...t, content: v, isDirty: true } : t
                                )
                            );
                        }}
                    />
                </div>

                <pre style={{ flex: 1, margin: 0, padding: 12, borderTop: "1px solid #ddd", overflow: "auto" }}>
                {output}
                </pre>
            </div>
        </div>
    );
}