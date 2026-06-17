import { NODE_COLORS, NODE_TYPES, type DocNode, type NodeType } from "../types";
import { Refresh } from "./Icons";

export function LayersBar({
  pageNodes,
  hiddenLayers,
  onToggle,
  onReparse,
  reparsing,
}: {
  pageNodes: DocNode[];
  hiddenLayers: string[];
  onToggle: (t: NodeType) => void;
  onReparse: () => void;
  reparsing: boolean;
}) {
  return (
    <div
      style={{
        flex: "none",
        padding: "11px 22px",
        borderBottom: "1px solid var(--line)",
        display: "flex",
        alignItems: "center",
        gap: 13,
        background: "#f3f5f7",
      }}
    >
      <span style={{ fontFamily: "var(--mono)", fontSize: 9.5, letterSpacing: ".22em", color: "var(--mut)" }}>
        LAYERS
      </span>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {NODE_TYPES.map((t) => {
          const count = pageNodes.filter((n) => n.type === t).length;
          const active = !hiddenLayers.includes(t);
          return (
            <div
              key={t}
              onClick={() => onToggle(t)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 7,
                padding: "5px 11px 5px 9px",
                border: `1px solid ${active ? "var(--line2)" : "var(--line)"}`,
                borderRadius: 20,
                cursor: "pointer",
                background: active ? "#fff" : "transparent",
                opacity: active ? 1 : 0.45,
                transition: "all .15s",
              }}
            >
              <span style={{ width: 8, height: 8, borderRadius: "50%", background: NODE_COLORS[t], flex: "none" }} />
              <span style={{ fontFamily: "var(--mono)", fontSize: 11, color: active ? "var(--ink2)" : "var(--dim)" }}>
                {t}
              </span>
              <span
                style={{
                  fontFamily: "var(--mono)",
                  fontSize: 10,
                  color: "var(--mut)",
                  background: "rgba(38,55,74,.06)",
                  padding: "0 5px",
                  borderRadius: 9,
                }}
              >
                {count}
              </span>
            </div>
          );
        })}
      </div>
      <button
        onClick={onReparse}
        disabled={reparsing}
        className="btn"
        style={{
          marginLeft: "auto",
          padding: "6px 13px",
          border: "1px solid var(--teal-line)",
          background: "var(--teal-dim)",
          color: "var(--teal)",
        }}
      >
        {reparsing ? <span className="spinner spinner-dark" /> : <Refresh />}
        Re-run parse
      </button>
    </div>
  );
}
