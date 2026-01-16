import { useEffect, useRef, useState } from "react";
import Editor from "@monaco-editor/react";

/* =========================
   Config
========================= */
const API_BASE = "http://localhost:8000";

/* =========================
   Types
========================= */
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

/* =========================
   Utils
========================= */
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
    };

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


/* =========================
   Component
========================= */
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
    const [quickOpen, setQuickOpen] = useState(false);
    const [query, setQuery] = useState("");
    const [autoScroll, setAutoScroll] = useState(true);
    const outputRef = useRef<HTMLPreElement | null>(null);


    /* ---------- api ---------- */
    const refreshHistory = async () => {
        const res = await fetch(`${API_BASE}/history?limit=30`);
        const data = await res.json();
        setHistory(data.items || []);
    };

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

    const closeTab = async (path: string) => {
        const tab = tabs.find((t) => t.path === path);
        if (!tab) return;

        if (tab.isDirty) {
            const choice = prompt(
                `File has unsaved changes:\n${path}\n\nType:\n  s = Save\n  d = Discard\n   c = Cancel`,
                "c"
            );
            if (!choice || choice.toLowerCase() === "c") return;

            if(choice.toLocaleLowerCase() === "s") {
                //  저장 후 닫기
                await fetch(`${API_BASE}/files/write`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json"},
                    body: JSON.stringify({ path, content: tab.content }),
                });
            }

            //  d(버림) 또는 s(저장) 이후 공통 : 닫기 진행
        }

        setTabs((prev) => prev.filter((t) => t.path !== path));

        //  닫는 탭이 현채 선택 탭이면 다른 탭으로 이동
        if (selectedPath === path) {
            const remaining = tabs.filter((t) => t.path !== path);
            if (remaining.length > 0) {
                const next = remaining[remaining.length - 1];
                setSelectedPath(next.path);
                setCode(next.content);
            } else {
                //  탭이 다 닫히면 main.py 다시 열기
                await openFile("main.py");
            }
        }
    };

    const renameFile = async (oldPath: string) => {
        const newPath = prompt("Rename to:", oldPath);
        if (!newPath || newPath === oldPath) return;

        const res = await fetch(`${API_BASE}/files/rename`, {
            method: "POST",
            headers: { "Content-Type": "application/json"},
            body: JSON.stringify({ old_path: oldPath, new_path: newPath }),
        });

        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            alert(err.detail || "Rename failed");
            return;
        }

        //  열려있는 탭 경로도 갱신
        setTabs((prev) =>
            prev.map((t) => (t.path === oldPath ? { ...t, path: newPath }: t))
        );

        if (selectedPath === oldPath) {
            setSelectedPath(newPath);
        }

        await refreshFiles();
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

    /* ---------- run ---------- */
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

    /* ---------- effects ---------- */
    useEffect(() => {
        //  최초 로딩: 파일 목록 + main.py 오픈
        (async () => {
            await refreshFiles();
            await openFile("main.py");
            await refreshHistory();
        })();
    }, []);

    useEffect(() => {
        const onKeyDown = (e: KeyboardEvent) => {
            if (e.ctrlKey && e.key.toLocaleLowerCase() === "p") {
                e.preventDefault();
                setQuickOpen(true);
                setQuery("");
            }
            if (e.key === "Escape") {
                setQuickOpen(false);
            }
        };
        
        window.addEventListener("keydown", onKeyDown);
        return () => window.removeEventListener("keydown", onKeyDown);
    }, []);

    useEffect(() => {
        if (!autoScroll) return;

        const el = outputRef.current;
        if (!el) return;

        el.scrollTop = el.scrollHeight;
    }, [output, autoScroll]);

    function scrollToTop() {
        const el = outputRef.current;
        if (!el) return;
        el.scrollTop = 0;
    }

    /* ---------- render helpers ---------- */
    const filesOnly = items.filter((x) => x.type === "file");
    const tree = buildTree(items);
    const allFiles = items.filter((x) => x.type === "file").map((x) => x.path);
    const filtered = allFiles.filter((p) => p.toLocaleLowerCase().includes(query.toLocaleLowerCase())).slice(0, 20);

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
        if (node.type === "file") {
            const isActive = node.path === selectedPath;
            return (
                <div
                    key = {node.path}
                    style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 6,
                        padding: "4px 6px",
                        marginLeft: pad,
                        cursor: "pointer",
                        background: isActive ? "#eef" : "transparent",
                        borderRadius: 6,
                    }}
                    title={node.path}
                >
                    <div
                        style={{ flex:1, cursor: "pointer", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                        onClick={() => openFile(node.path)}
                    >
                        {node.name}
                    </div>
                    
                    <button onClick={(e) => { e.stopPropagation(); renameFile(node.path) }} disabled={isRunning}>
                        R
                    </button>
                </div>
            );
        }
    };

    /* ---------- JSX ---------- */
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
                                    scrollToTop();
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
                                    style={{
                                        display: "flex",
                                        alignItems: "center",
                                        gap: 8,
                                        padding: "6px 10px",
                                        borderRadius: 8,
                                        cursor: "pointer",
                                        background: active ? "#eef" : "#f6f6f6",
                                        border: "1px solid #ddd",
                                        whiteSpace: "nowrap",
                                    }}
                                    title={t.path}
                                    onClick={() => {
                                        setSelectedPath(t.path);
                                        setCode(t.content);
                                    }}
                                >
                                    <span>
                                        {t.path} {t.isDirty ? "●" : ""}
                                    </span>
                                    
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            closeTab(t.path);
                                        }}
                                        style={{ marginLeft: 4 }}
                                        disabled={isRunning}
                                    >
                                        x
                                    </button>
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

                <div style={{ padding: "8px 12px", borderTop: "1px solid #ddd", display: "flex", gap: 8 }}>
                    <button onClick={() => { setOutput(""); scrollToTop(); }} disabled={isRunning}>Clear</button>
                    <button
                        onClick={async () => {
                            await navigator.clipboard.writeText(output);
                            alert("Copied!");
                        }}
                    >
                        Copy
                    </button>
                    <label style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 6 }}>
                        <input type="checkbox" checked={autoScroll} onChange={(e) => setAutoScroll(e.target.checked)} />
                        Auto-scroll
                    </label>
                </div>

                <pre ref={outputRef} style={{ flex: 1, margin: 0, padding: 12, borderTop: "1px solid #ddd", overflow: "auto" }}>
                  {output}
                </pre>
            </div>

            {quickOpen && (
                <div
                    style={{
                        position: "fixed",
                        inset: 0,
                        background: "rgba(0,0,0,0.3)",
                        display: "flex",
                        alignItems: "flex-start",
                        justifyContent: "center",
                        paddingTop: 80,
                    }}
                    onClick={() => setQuickOpen(false)}
                >
                    <div
                        style={{ width: 600, background: "white", borderRadius: 12, padding: 12 }}
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div style={{ fontWeight: 700, marginBottom: 8 }}>Quick Open (Ctrl+P)</div>
                        <input
                            autoFocus
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            placeholder="Type to search..."
                            style={{ width: "100%", padding: 10, border: "1px solid #ddd", borderRadius: 8 }}
                        />
                        <div style={{ marginTop: 10, maxHeight: 320, overflowY: "auto" }}>
                            {filtered.map((p) => (
                            <div
                                key={p}
                                style={{ padding: 8, cursor: "pointer", borderBottom: "1px solid #eee" }}
                                onClick={async () => {
                                await openFile(p);
                                setQuickOpen(false);
                                }}
                            >
                                {p}
                            </div>
                            ))}
                            {filtered.length === 0 && <div style={{ padding: 8, opacity: 0.7 }}>No matches</div>}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}