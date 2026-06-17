import { useRef, useState } from "react";
import type { DocumentSummary } from "../types";
import { Plus, FileIcon, Trash } from "./Icons";

function fmtSize(b: number): string {
  if (b > 1024 * 1024) return `${(b / 1024 / 1024).toFixed(1)} MB`;
  if (b > 1024) return `${(b / 1024).toFixed(0)} KB`;
  return `${b} B`;
}

function fmtAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.round(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  return `${Math.round(h / 24)} d ago`;
}

const statusColor: Record<string, string> = {
  parsed: "var(--teal)",
  parsing: "var(--gold)",
  uploaded: "var(--mut)",
  error: "var(--red)",
};

export function DocumentsView({
  documents,
  uploading,
  onUpload,
  onOpen,
  onDelete,
}: {
  documents: DocumentSummary[];
  uploading: boolean;
  onUpload: (file: File) => void;
  onOpen: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const pick = () => inputRef.current?.click();

  return (
    <div style={{ flex: 1, overflowY: "auto", background: "var(--bg)" }}>
      <input
        ref={inputRef}
        type="file"
        accept=".pdf,.docx,.pptx,.xlsx,.html,.md,.png,.jpg,.jpeg,.tiff,.bmp"
        style={{ display: "none" }}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onUpload(f);
          e.target.value = "";
        }}
      />

      <div style={{ maxWidth: 940, margin: "0 auto", padding: "28px 24px 48px" }}>
        <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between" }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 22, fontWeight: 600, color: "var(--navy)" }}>
              Documents
            </h1>
            <div style={{ fontFamily: "var(--mono)", fontSize: 11.5, color: "var(--mut)", marginTop: 6 }}>
              {documents.length} document{documents.length === 1 ? "" : "s"} · parsed with docling
            </div>
          </div>
          <button className="btn btn-red" onClick={pick} disabled={uploading}>
            {uploading ? <span className="spinner" /> : <Plus color="#fff" />}
            {uploading ? "Parsing…" : "New analysis"}
          </button>
        </div>

        {/* dropzone */}
        <div
          onClick={pick}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            const f = e.dataTransfer.files?.[0];
            if (f) onUpload(f);
          }}
          style={{
            marginTop: 22,
            border: `1.5px dashed ${dragging ? "var(--teal-br)" : "var(--line2)"}`,
            background: dragging ? "var(--teal-dim)" : "var(--surface)",
            borderRadius: 12,
            padding: "34px 24px",
            textAlign: "center",
            cursor: "pointer",
            transition: "all .15s",
          }}
        >
          <div
            style={{
              width: 54,
              height: 54,
              margin: "0 auto 14px",
              borderRadius: 12,
              background: "var(--teal-dim)",
              border: "1px solid var(--teal-line)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <FileIcon size={24} color="var(--teal)" sw={1.5} />
          </div>
          <div style={{ fontSize: 15, fontWeight: 600, color: "var(--navy)" }}>
            Drop a document to analyze
          </div>
          <div style={{ fontSize: 12.5, color: "var(--mut)", marginTop: 7 }}>
            PDF, DOCX, PPTX, XLSX, HTML, or images — parsed locally with docling
          </div>
        </div>

        {/* list */}
        <div style={{ marginTop: 26, display: "flex", flexDirection: "column", gap: 10 }}>
          {documents.length === 0 && (
            <div style={{ textAlign: "center", color: "var(--dim)", fontSize: 13, padding: "20px 0" }}>
              No documents yet — upload one to get started.
            </div>
          )}
          {documents.map((d) => (
            <div
              key={d.id}
              onClick={() => onOpen(d.id)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 16,
                padding: "14px 16px",
                background: "var(--surface)",
                border: "1px solid var(--line)",
                borderRadius: 10,
                cursor: "pointer",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.borderColor = "var(--teal-br)")}
              onMouseLeave={(e) => (e.currentTarget.style.borderColor = "var(--line)")}
            >
              <div
                style={{
                  width: 36,
                  height: 44,
                  flex: "none",
                  borderRadius: 6,
                  background: "var(--teal-dim)",
                  border: "1px solid var(--teal-line)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <FileIcon size={17} color="var(--teal)" sw={1.6} />
              </div>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div
                  style={{
                    fontSize: 14.5,
                    fontWeight: 600,
                    color: "var(--navy)",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {d.filename}
                </div>
                <div style={{ fontFamily: "var(--mono)", fontSize: 10.5, color: "var(--mut)", marginTop: 5 }}>
                  {fmtSize(d.size_bytes)} · {d.pages} pages · {d.node_count} nodes ·{" "}
                  {fmtAgo(d.created_at)}
                </div>
              </div>
              <span
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "4px 10px",
                  borderRadius: 20,
                  background: "var(--teal-dim)",
                  border: "1px solid var(--teal-line)",
                  fontFamily: "var(--mono)",
                  fontSize: 10,
                  letterSpacing: ".08em",
                  color: statusColor[d.status] || "var(--mut)",
                  textTransform: "uppercase",
                }}
              >
                <span
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: "50%",
                    background: statusColor[d.status] || "var(--mut)",
                  }}
                />
                {d.status}
              </span>
              <button
                className="btn"
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete(d.id);
                }}
                style={{
                  padding: "8px 10px",
                  border: "1px solid #e3b6bc",
                  background: "#fbeef0",
                  color: "var(--red)",
                }}
                title="Delete"
              >
                <Trash />
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
