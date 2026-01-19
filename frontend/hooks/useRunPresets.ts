import { useCallback, useEffect, useState } from "react";


type Choices = {
    timeout_s: number[];
    memory_mb: number[];
    cpus: number[];
    lang: number[];
};

type Current = {
    timeout_s: number;
    memory_mb: number;
    cpus: number;
    lang: string;
};


export function useRunPresets(API_BASE: string) {
    const [choices, setChoices] = useState<Choices | null>(null);
    const [current, setCurrent] = useState<Current | null>(null);

    const refresh = useCallback(async () => {
        const res = await fetch(`${API_BASE}/run/presets`);
        const data = await res.json();
        setChoices(data.choices);
        setCurrent(data.current);

    }, [API_BASE]);

    const update = useCallback(async (next: Current) => {
        const res = await fetch(`${API_BASE}/run/presets`, {
            method: "POST",
            headers: { "Content-Type": "application/json"},
            body: JSON.stringify(next),
        });
        if (!res.ok) throw new Error("Failed to save presets");
        setCurrent(next);
    }, [API_BASE]);

    useEffect(() => { refresh(); }, [refresh]);

    return { choices, current, refresh, update };
}