import { NODE_COLORS, NODE_TYPES, type DocNode, type NodeType } from "../types";
import { Check, ChevronDown, Trash } from "./Icons";

export function PropertiesPanel({
  node,
  readingOrder,
  pages,
  draftText,
  saved,
  onChangeType,
  onChangeText,
  onApply,
  onDelete,
}: {
  node: DocNode | null;
  readingOrder: number;
  pages: number;
  draftText: string;
  saved: boolean;
  onChangeType: (t: NodeType) => void;
  onChangeText: (v: string) => void;
  onApply: () => void;
  onDelete: () => void;
}) {
  return (
    <aside
      style={{
        width: 340,
        flex: "none",
        borderLeft: "1px solid var(--line)",
        background: "var(--surface)",
        display: "flex",
        flexDirection: "column",
        minHeight: 0,
      }}
    >
      <div
        style={{
          padding: "14px 18px",
          borderBottom: "1px solid var(--line)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <span style={{ fontSize: 13, fontWeight: 600, color: "var(--navy)" }}>Properties</span>
        <span style={{ fontFamily: "var(--mono)", fontSize: 9.5, letterSpacing: ".16em", color: "var(--dim)" }}>
          INSPECTOR
        </span>
      </div>

      {!node ? (
        <EmptyState />
      ) : (
        <div style={{ flex: 1, overflowY: "auto", padding: 18, display: "flex", flexDirection: "column", gap: 18 }}>
          {/* identity */}
          <div
            style={{
              border: "1px solid var(--line)",
              borderRadius: 10,
              background: "#f6f8f9",
              padding: 14,
              position: "relative",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                right: 0,
                height: 3,
                background: `linear-gradient(90deg,${NODE_COLORS[node.type]},transparent)`,
              }}
            />
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 7,
                  fontFamily: "var(--mono)",
                  fontSize: 11,
                  color: NODE_COLORS[node.type],
                  border: `1px solid ${NODE_COLORS[node.type]}`,
                  padding: "3px 9px",
                  borderRadius: 6,
                }}
              >
                <span style={{ width: 7, height: 7, borderRadius: "50%", background: NODE_COLORS[node.type] }} />
                {node.type}
              </span>
              <span style={{ fontFamily: "var(--mono)", fontSize: 10.5, color: "var(--mut)" }}>
                node :: {node.id}
              </span>
            </div>
            <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 9 }}>
              <Cell label="PAGE" value={`${node.page} / ${pages}`} />
              <Cell label="READING ORDER" value={`#${readingOrder}`} />
            </div>
            <div style={{ marginTop: 9 }}>
              <Cell label="BOUNDING BOX" value={bboxLabel(node)} valueColor="var(--teal)" full />
            </div>
          </div>

          {/* confidence */}
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 7 }}>
              <span style={{ fontFamily: "var(--mono)", fontSize: 9.5, letterSpacing: ".16em", color: "var(--mut)" }}>
                OCR CONFIDENCE
              </span>
              <span style={{ fontFamily: "var(--mono)", fontSize: 12, color: "var(--teal)" }}>
                {Math.round(node.confidence * 100)}%
              </span>
            </div>
            <div
              style={{
                height: 6,
                borderRadius: 6,
                background: "#eef1f4",
                border: "1px solid var(--line)",
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  height: "100%",
                  width: `${Math.round(node.confidence * 100)}%`,
                  background: "linear-gradient(90deg,var(--teal),var(--teal-br))",
                }}
              />
            </div>
          </div>

          {/* type */}
          <div>
            <label style={labelStyle}>ELEMENT TYPE</label>
            <div style={{ position: "relative" }}>
              <select
                value={node.type}
                onChange={(e) => onChangeType(e.target.value as NodeType)}
                style={{
                  width: "100%",
                  padding: "10px 34px 10px 12px",
                  borderRadius: 8,
                  border: "1px solid var(--line2)",
                  background: "#f6f8f9",
                  color: "var(--ink)",
                  fontFamily: "var(--ui)",
                  fontSize: 13,
                  outline: "none",
                  cursor: "pointer",
                }}
              >
                {NODE_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
              <ChevronDown
                style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }}
              />
            </div>
          </div>

          {/* content */}
          <div>
            <label style={labelStyle}>EXTRACTED CONTENT</label>
            <textarea
              value={draftText}
              onChange={(e) => onChangeText(e.target.value)}
              rows={6}
              style={{
                width: "100%",
                padding: "11px 12px",
                borderRadius: 8,
                border: "1px solid var(--line2)",
                background: "#f6f8f9",
                color: "var(--ink)",
                fontFamily: "var(--serif)",
                fontSize: 13.5,
                lineHeight: 1.55,
                outline: "none",
                resize: "vertical",
              }}
            />
            <div style={{ fontFamily: "var(--mono)", fontSize: 9.5, color: "var(--dim)", marginTop: 6 }}>
              Edits sync to the document region in real time.
            </div>
          </div>

          {/* actions */}
          <div style={{ display: "flex", gap: 9, marginTop: 2 }}>
            <button
              onClick={onApply}
              className="btn"
              style={{
                flex: 1,
                padding: 11,
                justifyContent: "center",
                background: saved ? "var(--green)" : "var(--teal)",
                borderColor: saved ? "#256b42" : "var(--teal)",
                color: "#fff",
              }}
            >
              <Check />
              {saved ? "Saved" : "Apply changes"}
            </button>
            <button
              onClick={onDelete}
              className="btn"
              style={{
                padding: "11px 13px",
                border: "1px solid #e3b6bc",
                background: "#fbeef0",
                color: "var(--red)",
              }}
            >
              <Trash />
            </button>
          </div>
        </div>
      )}
    </aside>
  );
}

const labelStyle: React.CSSProperties = {
  display: "block",
  fontFamily: "var(--mono)",
  fontSize: 9.5,
  letterSpacing: ".16em",
  color: "var(--mut)",
  marginBottom: 8,
};

function bboxLabel(n: DocNode): string {
  if (!n.bbox) return "—";
  const b = n.bbox;
  return `x ${b.x} · y ${b.y} · ${b.width} × ${b.height}`;
}

function Cell({
  label,
  value,
  valueColor = "var(--ink)",
  full,
}: {
  label: string;
  value: string;
  valueColor?: string;
  full?: boolean;
}) {
  return (
    <div
      style={{
        background: "#fff",
        border: "1px solid var(--line)",
        borderRadius: 7,
        padding: "8px 10px",
        gridColumn: full ? "1 / -1" : undefined,
      }}
    >
      <div style={{ fontFamily: "var(--mono)", fontSize: 8.5, letterSpacing: ".14em", color: "var(--dim)" }}>
        {label}
      </div>
      <div style={{ fontFamily: "var(--mono)", fontSize: 11.5, color: valueColor, marginTop: 3 }}>{value}</div>
    </div>
  );
}

function EmptyState() {
  return (
    <div
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        textAlign: "center",
        padding: 30,
      }}
    >
      <div style={{ width: 74, height: 74, position: "relative", marginBottom: 20 }}>
        <div style={{ position: "absolute", inset: 0, border: "1px solid var(--line2)", borderRadius: 14 }} />
        {(["tl", "tr", "bl", "br"] as const).map((c) => (
          <div
            key={c}
            style={{
              position: "absolute",
              width: 14,
              height: 14,
              top: c[0] === "t" ? 8 : undefined,
              bottom: c[0] === "b" ? 8 : undefined,
              left: c[1] === "l" ? 8 : undefined,
              right: c[1] === "r" ? 8 : undefined,
              borderTop: c[0] === "t" ? "2px solid var(--teal-br)" : undefined,
              borderBottom: c[0] === "b" ? "2px solid var(--teal-br)" : undefined,
              borderLeft: c[1] === "l" ? "2px solid var(--teal-br)" : undefined,
              borderRight: c[1] === "r" ? "2px solid var(--teal-br)" : undefined,
            }}
          />
        ))}
        <div
          style={{
            position: "absolute",
            top: "50%",
            left: "50%",
            transform: "translate(-50%,-50%)",
            width: 9,
            height: 9,
            borderRadius: "50%",
            background: "var(--teal-br)",
            boxShadow: "0 0 12px rgba(19,138,130,.6)",
            animation: "blink 1.8s infinite",
          }}
        />
      </div>
      <div style={{ fontSize: 14, fontWeight: 600, color: "var(--navy)" }}>No region selected</div>
      <div style={{ fontSize: 12.5, color: "var(--mut)", marginTop: 8, lineHeight: 1.6, maxWidth: 240 }}>
        Select a node in the structure tree or click a highlighted region in the document to inspect and edit it.
      </div>
    </div>
  );
}
