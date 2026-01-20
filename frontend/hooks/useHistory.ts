import { error } from "console";
import { useCallback, useState, useEffect } from "react";

export type RunHistoryItem = {
    id: string;
    started_at: number;
    ended_at: number | null;
    status: string,

    exit_code: number | null;
    signal: number | null;
    reason: string | null;
    duration_ms: number | null;

    output: string;
    preview: string;
};

export function useHistory(API_BASE: string) {
    const [history, setHistory] = useState<RunHistoryItem[]>([]);
    const [selectedRunId, setSelectedRunId] = useState<string | null>(null);

    const refreshHistory = useCallback(async () => {
        console.log("[useHistory] refreshHistory called");
        const res = await fetch(`${API_BASE}/history?limit=30`);
        const data = await res.json();
        console.log("[useHistory] fetched items", data.items);
        setHistory(data.items || []);
    }, [API_BASE]);

    const loadHistoryOutput = useCallback(async (runId: string): Promise<string> => {
        setSelectedRunId(runId);
        const res = await fetch(`${API_BASE}/history/${runId}`);

        if (!res.ok)
            throw new Error("History load failed");

        const data = await res.json();
        return data.output || "";
    }, [API_BASE]);

    useEffect(() => {
        refreshHistory();
    }, [refreshHistory]);

    return { history, selectedRunId, refreshHistory, loadHistoryOutput };
}