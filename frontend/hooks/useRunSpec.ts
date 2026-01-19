import { useCallback, useEffect, useState } from "react";


export type RunSpecInfo = {
    lang: string;
    entry: string;
    image: string;
    cmd: string[];
    source: "auto" | "run.json";
};


export function useRunSpec(API_BASE: string) {
    const [spec, setSpec] = useState<RunSpecInfo | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const refresh = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await fetch(`${API_BASE}/run/spec`);
            if (!res.ok) throw new Error("Failed to load run spec");
            const data = await res.json();
            setSpec(data);
        }
        catch (e: any) {
            setError(e.message || "error");
            setSpec(null);
        }
        finally {
            setLoading(false);
        }
    }, [API_BASE]);

    useEffect(() => {
        refresh();
    }, [refresh]);

    return { spec, loading, error, refresh };
}