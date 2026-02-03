import { ok } from "assert";


export function useAgentGen(API_BASE: string) {
    async function previewGen(body: any) {
        const res = await fetch(`${API_BASE}/agent/gen/preview`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
        });

        const data = await res.json();
        return { ok: res.ok, data }
    }

    async function applyGen(body: any) {
        const res = await fetch(`${API_BASE}/agent/gen/apply`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
        });

        const data = await res.json();
        return { ok: res.ok, data }
    }

    return { previewGen, applyGen };
}