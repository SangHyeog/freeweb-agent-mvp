import { useCallback, useMemo, useEffect, useState } from "react";

export type FileItem = { path: string, type: "file" | "dir" };
export type Tab = { path: string, content: string; isDirty: boolean };
export type TreeNode =  
    | { type: "dir"; name: string; path: string; children: TreeNode[] } 
    | { type: "file"; name: string; path: string };

/* =========================
   Utils
========================= */
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
            const part = parts[i];
            const fullPath = parts.slice(0, i + 1).join("/");
            const isLast = i === parts.length - 1;

            if (isLast && it.type === "file") {
                cur.children.push({ type: "file", name: part, path: fullPath });
            } else {
                cur = ensureDir(cur, part, fullPath);
            }
        }
    }

    // sort: dirs first
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


export function guessLanguage(path: string) {
    if (path.endsWith(".py")) return "python";
    if (path.endsWith(".ts") || path.endsWith(".tsx")) return "typescript";
    if (path.endsWith(".js") || path.endsWith(".jsx")) return "javascript";
    if (path.endsWith(".json")) return "json";
    if (path.endsWith(".md")) return "markdown";

    return "plaintext";
}


export function useFiles(API_BASE: string, projectId: string) {
    const [items, setItems] = useState<FileItem[]>([]);
    const [tabs, setTabs] = useState<Tab[]>([]);
    const [selectedPath, setSelectedPath] = useState<string>("main.py");
    const [code, setCode] = useState("");
    const [expanded, setExpanded] = useState<Record<string, boolean>>({ "": true });

    const tree = useMemo(() => buildTree(items), [items]);

    /* ---------- api ---------- */
    const refreshFiles = useCallback(async () => {
        const res = await fetch(`${API_BASE}/files?project_id=${encodeURIComponent(projectId)}`);
        const data = await res.json();
        setItems(data.items || []);
    }, [API_BASE, projectId]);

    const openFile = useCallback(async (path: string) => {
        //  이미 탭이 있으면 전환만
        const existing = tabs.find((t) => t.path === path);
        if (existing) {
            setSelectedPath(path);
            setCode(existing.content);
            return;
        }

        const res = await fetch(`${API_BASE}/files/read?project_id=${encodeURIComponent(projectId)}&path=${encodeURIComponent(path)}`);
        if (!res.ok) 
            throw new Error(`Failed to open: ${path}`);
            
        const data = await res.json();
        const content = data.content || "";

        setTabs((prev) => [...prev, { path, content, isDirty: false }]);    /* ...prev는 ["a", "b", "c"](이전 상태 값으로 갖고 있는 것) */
        setSelectedPath(path);
        setCode(content);
    }, [API_BASE, projectId, tabs]);

    const updateCode = useCallback((newCode: string) => {
        setCode(newCode);
        setTabs((prev) =>
            prev.map((t) => (t.path === selectedPath ? { ...t, content: newCode, isDirty: true }: t))
        );
    }, [selectedPath]);

    const saveCurrent = useCallback(async () => {
        const tab = tabs.find((t) => t.path === selectedPath);
        if (!tab) return;

        const res = await fetch(`${API_BASE}/files/write?project_id=${encodeURIComponent(projectId)}`, {
            method: "POST",
            headers: { "Content-Type": "application/json"},
            body: JSON.stringify({ path: tab.path, content: tab.content }),
        });

        if (!res.ok) {
            const text = await res.text();
            throw new Error(`Save failed: ${text}`);
        }

        setTabs((prev) => prev.map((t) => (t.path === selectedPath ? { ...t, isDirty: false} : t)));
    }, [API_BASE, projectId, tabs, selectedPath]);

    const createFile = useCallback(async (path: string) => {
        const res = await fetch(`${API_BASE}/files/create?project_id=${encodeURIComponent(projectId)}`, {
            method: "POST",
            headers: { "Content-Type": "application/json"},
            body: JSON.stringify({ path }),
        });

        if (!res.ok)
            throw new Error("Create failed");

        await refreshFiles();
        await openFile(path);
    }, [API_BASE, projectId, refreshFiles, openFile]);

    const deleteFile = useCallback(async (path: string) => {
        const res = await fetch(`${API_BASE}/files/delete?project_id=${encodeURIComponent(projectId)}`, {
            method: "POST",
            headers: { "Content-Type": "application/json"},
            body: JSON.stringify({ path }),
        });

        if (!res.ok) 
            throw new Error("Delete failed");

        //  삭제된 파일이 열려 있던 탭이면 제거
        setTabs((prev) => prev.filter((t) => t.path !== path));

        //  현재 선택된 파일이면 다른 파일로 이동
        setSelectedPath((prev) => {
            if (prev !== path) return prev;

            //  다른 탭이 있으면 그쪽으로
            const remaining = tabs.filter((t) => t.path !== path);
            if (remaining.length > 0) {
                setCode(remaining[remaining.length - 1].content);
                return remaining[remaining.length - 1].path;
            }

            //  아무 탭도 없으면 기본 파일로
            setCode("");
            return "";
        });

        await refreshFiles();
    }, [API_BASE, projectId, refreshFiles, tabs]);

    const renameFile = useCallback(async (oldPath: string, newPath: string) => {
        const res = await fetch(`${API_BASE}/files/rename?project_id=${encodeURIComponent(projectId)}`, {
            method: "POST",
            headers: { "Content-Type": "application/json"},
            body: JSON.stringify({ old_path: oldPath, new_path: newPath }),
        });

        if (!res.ok) 
            throw new Error("Rename failed");

        //  열려있는 탭 경로도 갱신
        setTabs((prev) =>
            prev.map((t) => (t.path === oldPath ? { ...t, path: newPath }: t))
        );

        if (selectedPath === oldPath)
            setSelectedPath(newPath);

        await refreshFiles();
    }, [API_BASE, projectId, refreshFiles, selectedPath]);

    const closeTab = useCallback(async (path: string) => {
        const tab = tabs.find((t) => t.path === path);
        if (!tab) return;

        if (tab.isDirty) {
            const choice = prompt(
                `File has unsaved changes:\n${path}\n\nType:\n  s = Save\n  d = Discard\n  c = Cancel`,
                "c"
            );
            if (!choice || choice.toLowerCase() === "c") return;

            if(choice.toLocaleLowerCase() === "s") {
                //  저장 후 닫기
                const res = await fetch(`${API_BASE}/files/write?project_id=${encodeURIComponent(projectId)}`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json"},
                    body: JSON.stringify({ path, content: tab.content }),
                });

                if (!res.ok)
                    throw new Error("Save failed");
            }
        }

        const remaining = tabs.filter((t) => t.path !== path);
        setTabs(remaining);

        //  닫는 탭이 현채 선택 탭이면 다른 탭으로 이동
        if (selectedPath === path) {
            if (remaining.length > 0) {
                const next = remaining[remaining.length - 1];
                setSelectedPath(next.path);
                setCode(next.content);
            } else {
                setSelectedPath("");
                setCode("");
            }
        }
    }, [API_BASE, projectId, tabs, selectedPath, openFile]);

    const reloadFile = useCallback(async (path: string): Promise<string> => {
        const res = await fetch(`${API_BASE}/files/read?project_id=${encodeURIComponent(projectId)}&path=${encodeURIComponent(path)}`);
        if (!res.ok)
            throw new Error(`Failed to reload: ${path}`);

        const data = await res.json();
        const content = data.content || "";

        setTabs((prev) => 
            prev.map((t) => 
                t.path === path ? { ...t, content, isDirty: false } : t
            )
        );

        setSelectedPath(path);
        setCode(content);

        return content;
    }, [API_BASE, projectId]);

    useEffect(() => {
        if (!projectId) return;
        refreshFiles();
    }, [projectId, refreshFiles]);

    useEffect(() => {
        // 프로젝트 변경 시 상태 즉시 리셋
        setItems([]);
        setTabs([]);
        setSelectedPath("");   // null ❌, string 타입이므로 ""
        setCode("");
        setExpanded({ "": true });

        // ⚠️ 여기서 refreshFiles()는 호출하지 않는다
    }, [projectId]);

    return {
        //  file list / tree
        items,
        tree,
        expanded,
        setExpanded,
        refreshFiles,

        //  editor/tabs
        tabs,
        selectedPath,
        code,
        setSelectedPath,
        setCode,
        updateCode,
        openFile,
        closeTab,
        saveCurrent,

        //  ops
        createFile,
        deleteFile,
        renameFile,
        reloadFile,
    };
}