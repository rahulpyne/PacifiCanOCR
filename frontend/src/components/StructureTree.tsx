import { NODE_COLORS, type DocNode } from "../types";
import { Plus, Minus, Search } from "./Icons";

export function StructureTree({
  nodes,
  totalCount,
  filter,
  onFilter,
  selectedId,
  onSelect,
  onHover,
  onExpandAll,
  onCollapseAll,
}: {
  nodes: DocNode[];
  totalCount: number;
  filter: string;
  onFilter: (v: string) => void;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onHover: (id: string | null) => void;
  onExpandAll: () => void;
  onCollapseAll: () => void;
}) {
  return (
    <section
      style={{
        width: 318,
        flex: "none",
        borderRight: "1px solid var(--line)",
        display: "flex",
        flexDirection: "column",
        background: "var(--surface)",
        minHeight: 0,
      }}
    >
      <div
        style={{
          padding: "14px 16px 11px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: "var(--navy)" }}>Structure</span>
          <span style={{ fontFamily: "var(--mono)", fontSize: 10.5, color: "var(--mut)" }}>
            {totalCount} nodes
          </span>
        </div>
        <div style={{ display: "flex", gap: 5 }}>
          <IconBtn onClick={onExpandAll}>
            <Plus size={13} />
          </IconBtn>
          <IconBtn onClick={onCollapseAll}>
            <Minus size={13} />
          </IconBtn>
        </div>
      </div>

      <div style={{ padding: "0 16px 12px" }}>
        <div style={{ position: "relative" }}>
          <Search
            style={{ position: "absolute", left: 11, top: "50%", transform: "translateY(-50%)" }}
          />
          <input
            value={filter}
            onChange={(e) => onFilter(e.target.value)}
            placeholder="Filter elements..."
            style={{
              width: "100%",
              padding: "9px 12px 9px 32px",
              borderRadius: 8,
              border: "1px solid var(--line2)",
              background: "#f6f8f9",
              color: "var(--ink)",
              fontFamily: "var(--ui)",
              fontSize: 12.5,
              outline: "none",
            }}
          />
        </div>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "0 8px 16px" }}>
        {nodes.length === 0 && (
          <div style={{ color: "var(--dim)", fontSize: 12, textAlign: "center", padding: "16px 0" }}>
            No elements on this page.
          </div>
        )}
        {nodes.map((n) => {
          const sel = selectedId === n.id;
          const pad = n.type === "text" || n.type === "caption" ? 26 : 10;
          return (
            <div
              key={n.id}
              onClick={() => onSelect(n.id)}
              onMouseEnter={() => onHover(n.id)}
              onMouseLeave={() => onHover(null)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: `6px 8px 6px ${pad}px`,
                margin: "1px 0",
                borderRadius: 7,
                cursor: "pointer",
                background: sel ? "var(--teal-dim)" : "transparent",
                borderLeft: `2px solid ${sel ? "var(--teal-br)" : "transparent"}`,
              }}
              onMouseOver={(e) => {
                if (!sel) e.currentTarget.style.background = "#f1f4f6";
              }}
              onMouseOut={(e) => {
                if (!sel) e.currentTarget.style.background = "transparent";
              }}
            >
              <span
                style={{
                  width: 7,
                  height: 7,
                  borderRadius: "50%",
                  flex: "none",
                  background: NODE_COLORS[n.type],
                }}
              />
              <span
                style={{
                  fontFamily: "var(--mono)",
                  fontSize: 9,
                  color: NODE_COLORS[n.type],
                  border: "1px solid var(--line)",
                  padding: "1px 5px",
                  borderRadius: 4,
                  flex: "none",
                }}
              >
                {n.type}
              </span>
              <span
                style={{
                  fontSize: 12,
                  color: "var(--ink2)",
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  flex: 1,
                  minWidth: 0,
                }}
              >
                {n.text}
              </span>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function IconBtn({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      style={{
        width: 25,
        height: 25,
        borderRadius: 6,
        border: "1px solid var(--line2)",
        background: "var(--surface)",
        color: "var(--mut)",
        cursor: "pointer",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.color = "var(--teal-br)";
        e.currentTarget.style.borderColor = "var(--teal-br)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.color = "var(--mut)";
        e.currentTarget.style.borderColor = "var(--line2)";
      }}
    >
      {children}
    </button>
  );
}
