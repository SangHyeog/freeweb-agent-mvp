import { useCallback, useRef, useState } from "react";

export function useRun(API_BASE: string) {
    const [isRunning, setIsRunning] = useState(false);
    const wsRef = useRef<WebSocket | null>(null);

    const run = useCallback((onMessage: (chunk: string) => void, onClose?: () => void) => {
        if (isRunning)
            return;

        setIsRunning(true);

        const ws = new WebSocket("ws://localhost:8000/ws/run");
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
    }, [API_BASE]);

    const stop = useCallback(async () => {
        await fetch(`${API_BASE}/stop`, { method: "POST" });

        wsRef.current?.close();
    }, [API_BASE]);

    return { isRunning, run, stop };
}