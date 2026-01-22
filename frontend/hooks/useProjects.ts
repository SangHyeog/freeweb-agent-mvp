import { useCallback, useEffect, useState } from "react";


export function useProjects(API_BASE: string) {
    const [projects, setProjects] = useState<string[]>([]);
    const [current, setCurrent] = useState<string>("default");

    const refresh = useCallback(async () => {
        const res = await fetch(`${API_BASE}/projects`);
        if (!res.ok) {
            console.error("Failed to load projects");
            return;
        }

        const data = await res.json();
        setProjects(data.items || []);
    }, [API_BASE]);

    useEffect(() => {
        refresh();
    }, [refresh]);

    return { projects, current, setCurrent, refresh, };
}