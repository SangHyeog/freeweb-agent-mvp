import { useEffect, useRef } from "react";

type Props = {
    output: string;
    autoScroll: boolean;
    setAutoScroll: (v: boolean) => void;
    setOutput: (v: string) => void;
};

export default function OutputPanel ({ output, autoScroll, setAutoScroll, setOutput }: Props) {
    const ref = useRef<HTMLPreElement | null>(null);

    useEffect(() => {
        if (!autoScroll || !ref.current) return;

        ref.current.scrollTop = ref.current.scrollHeight;
    }, [output, autoScroll]);

    return (
        <>
          <div style={{ height: "100%", display: "flex", flexDirection: "column", minHeight: 0 }}>
            <div style={{ padding: "8px 12px", borderTop: "1px solid #ddd", display: "flex", gap: 8, flexShrink: 0, }}>
              <button onClick={() => { setOutput("");
                if (ref.current) ref.current.scrollTop = 0;
              }}>
                Clear
              </button>
              <button onClick={() => { navigator.clipboard.writeText(output) }}>
                Copy
              </button>
              <label style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 6 }}>
                <input type="checkbox" checked={autoScroll} onChange={(e) => setAutoScroll(e.target.checked)} /> 
                Auto-scroll
              </label>
            </div>
            <pre ref={ref} style={{ flex: 1, minHeight: 0, overflow: "auto", margin: 0, padding: 12, whiteSpace: "pre-wrap", }}>
              {output}
            </pre>
          </div>
        </>
    );
}