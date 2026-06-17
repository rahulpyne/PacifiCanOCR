import { useState } from "react";
import { api } from "../lib/api";
import type { Chunk } from "../types";

/** Right-hand config panel for the Chunk / Ingest modules. */
export function ModulePanel({ tab, docId }: { tab: "chunk" | "ingest"; docId: string }) {
  const [maxTokens, setMaxTokens] = useState(512);
  const [overlap, setOverlap] = useState(64);
  const [store, setStore] = useState("local-preview");
  const [busy, setBusy] = useState(false);
  const [chunks, setChunks] = useState<Chunk[] | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      if (tab === "chunk") {
        const res = await api.chunk(docId, maxTokens, overlap);
        setChunks(res.chunks);
        setResult(`${res.chunk_count} chunks created`);
      } else {
        const res = await api.ingest(docId, store, maxTokens, overlap);
        setResult(`${res.chunks_ingested} chunks ${res.status} → ${res.store}`);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

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
        <span style={{ fontSize: 13, fontWeight: 600, color: "var(--navy)" }}>
          {tab === "chunk" ? "Chunking" : "Ingest"}
        </span>
        <span style={{ fontFamily: "var(--mono)", fontSize: 9.5, letterSpacing: ".16em", color: "var(--dim)" }}>
          {tab === "chunk" ? "SEGMENT" : "VECTOR STORE"}
        </span>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: 18, display: "flex", flexDirection: "column", gap: 16 }}>
        <Field label="MAX TOKENS / CHUNK">
          <input
            type="number"
            value={maxTokens}
            onChange={(e) => setMaxTokens(Number(e.target.value))}
            style={inputStyle}
          />
        </Field>
        <Field label="OVERLAP (TOKENS)">
          <input
            type="number"
            value={overlap}
            onChange={(e) => setOverlap(Number(e.target.value))}
            style={inputStyle}
          />
        </Field>

        {tab === "ingest" && (
          <Field label="DESTINATION STORE">
            <select value={store} onChange={(e) => setStore(e.target.value)} style={inputStyle}>
              <option value="local-preview">local-preview (no-op)</option>
              <option value="azure-ai-search">azure-ai-search</option>
            </select>
          </Field>
        )}

        <button onClick={run} disabled={busy} className="btn btn-teal" style={{ justifyContent: "center", padding: 11 }}>
          {busy ? <span className="spinner" /> : null}
          {tab === "chunk" ? "Run chunking" : "Run ingestion"}
        </button>

        {result && (
          <div
            style={{
              fontFamily: "var(--mono)",
              fontSize: 11.5,
              color: "var(--teal)",
              background: "var(--teal-dim)",
              border: "1px solid var(--teal-line)",
              borderRadius: 8,
              padding: "9px 11px",
            }}
          >
            {result}
          </div>
        )}
        {error && (
          <div style={{ fontFamily: "var(--mono)", fontSize: 11.5, color: "var(--red)" }}>{error}</div>
        )}

        {tab === "chunk" && chunks && (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {chunks.map((c) => (
              <div
                key={c.index}
                style={{
                  border: "1px solid var(--line)",
                  borderRadius: 8,
                  padding: "9px 11px",
                  background: "#f6f8f9",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    fontFamily: "var(--mono)",
                    fontSize: 9.5,
                    color: "var(--mut)",
                    marginBottom: 5,
                  }}
                >
                  <span>chunk #{c.index}</span>
                  <span>
                    ~{c.token_estimate} tok · p{c.page_span.join(",")}
                  </span>
                </div>
                <div style={{ fontFamily: "var(--serif)", fontSize: 12.5, color: "var(--ink2)", lineHeight: 1.5 }}>
                  {c.text.length > 180 ? c.text.slice(0, 180) + "…" : c.text}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </aside>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "10px 12px",
  borderRadius: 8,
  border: "1px solid var(--line2)",
  background: "#f6f8f9",
  color: "var(--ink)",
  fontFamily: "var(--ui)",
  fontSize: 13,
  outline: "none",
};

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label
        style={{
          display: "block",
          fontFamily: "var(--mono)",
          fontSize: 9.5,
          letterSpacing: ".16em",
          color: "var(--mut)",
          marginBottom: 8,
        }}
      >
        {label}
      </label>
      {children}
    </div>
  );
}
