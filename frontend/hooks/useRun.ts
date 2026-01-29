import { useCallback, useEffect, useRef, useState } from "react";

type FixStatus = "idle" | "fixing" | "fixed" | "not_fixed" | "llm_unavailable" | "previewing";


export function useRun(API_BASE: string, projectId: string) {
    const [isRunning, setIsRunning] = useState(false);
    const wsRef = useRef<WebSocket | null>(null);
    const [fixStatus, setFixStatus] = useState<FixStatus>("idle")

    useEffect(() => {
        if (isRunning) {
            console.warn("Project changed during run");
            wsRef.current?.close();     // 실행 중이면 WS 정리
        }
        setIsRunning(false);
        wsRef.current = null;
    }, [projectId]);

    const run = useCallback((onMessage: (chunk: string) => void, onClose?: () => void) => {
        if (isRunning)
            return;

        setIsRunning(true);

        const ws = new WebSocket(`ws://localhost:8000/ws/run?project_id=${encodeURIComponent(projectId)}`);
        wsRef.current = ws;

        ws.onmessage = (event) => onMessage(event.data);

        ws.onerror = () => {
            onMessage("\n[WebSocket Error]\n");
            setIsRunning(false);
            wsRef.current = null;
            onClose?.();
        };

        ws.onclose = () => {
            onMessage("\n[WebSocket Closed]\n");
            setIsRunning(false);
            wsRef.current = null;
            onClose?.();
        };
    }, [API_BASE, projectId]);

    const stop = useCallback(async () => {
        await fetch(`${API_BASE}/stop?project_id=${encodeURIComponent(projectId)}`, {
            method: "POST" 
        });

        wsRef.current?.close();
    }, [API_BASE, projectId]);

    const fixWithAgent = useCallback(async (params: {
        runId: string;
        entry: string;
        lang: "node" | "python";
    }) => {
        setFixStatus("fixing");

        const res = await fetch(`${API_BASE}/agent/fix`, {
            method: "POST",
            headers: { "Content-Type": "application/json"},
            body: JSON.stringify({
                project_id: projectId,
                run_id: params.runId,
                entry: params.entry,
                lang: params.lang,
            }),
        });

        const data = await res.json();

        if (data.fixed) {
            setFixStatus("fixed");
        } else if (data.reason === "llm_unavailable") {
            setFixStatus("llm_unavailable");
        } else {
            setFixStatus("not_fixed");
        }

        return data;
    }, [API_BASE, projectId])

    return { isRunning, run, stop, fixStatus, fixWithAgent };
}