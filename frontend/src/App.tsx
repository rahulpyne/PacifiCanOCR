import { useCallback, useEffect, useRef, useState } from "react";
import { DocumentsView } from "./components/DocumentsView";
import { ParseView } from "./components/ParseView";
import { Sidebar } from "./components/Sidebar";
import { api } from "./lib/api";
import type { DocNode, DocumentDetail, DocumentSummary } from "./types";

type View = "home" | "documents" | "settings" | "parse";

export default function App() {
  const [view, setView] = useState<View>("documents");
  const [documents, setDocuments] = useState<DocumentSummary[]>([]);
  const [activeDoc, setActiveDoc] = useState<DocumentDetail | null>(null);
  const [uploading, setUploading] = useState(false);
  const [reparsing, setReparsing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const saveTimer = useRef<number | undefined>(undefined);
  // Cancels a poll when a NEW upload/reparse starts (prevents two concurrent polls).
  const pollAbort = useRef<AbortController | null>(null);
  // Which doc id the UI should follow for live updates. Set to null on navigation
  // so a background poll doesn't overwrite whatever the user just opened.
  const watchingId = useRef<string | null>(null);

  const refreshDocs = useCallback(() => {
    api.listDocuments().then(setDocuments).catch((e) => setError(e.message));
  }, []);

  useEffect(() => {
    refreshDocs();
  }, [refreshDocs]);

  const openDoc = async (id: string) => {
    watchingId.current = null; // stop live-updating activeDoc from any background poll
    setError(null);
    try {
      const detail = await api.getDocument(id);
      setActiveDoc(detail);
      setView("parse");
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const upload = async (file: File) => {
    // Cancel any previous poll so we don't have two concurrent polls running.
    pollAbort.current?.abort();
    const ac = new AbortController();
    pollAbort.current = ac;
    setUploading(true);
    setError(null);
    try {
      const pending = await api.uploadAndParse(file);
      const pollId = pending.id;
      watchingId.current = pollId;
      setActiveDoc(pending);
      setView("parse");
      refreshDocs();
      const detail = await api.pollDocument(pollId, {
        signal: ac.signal,
        onTick: (d) => {
          if (watchingId.current === pollId) setActiveDoc(d);
        },
      });
      // Always refresh the list so the doc shows "parsed" even if user navigated away.
      refreshDocs();
      if (watchingId.current === pollId) {
        setActiveDoc(detail);
        if (detail.status === "error") setError(detail.error || "Parse failed");
      }
    } catch (e) {
      if ((e as Error).name !== "AbortError") setError((e as Error).message);
    } finally {
      setUploading(false);
    }
  };

  const reparse = async () => {
    if (!activeDoc) return;
    pollAbort.current?.abort();
    const ac = new AbortController();
    pollAbort.current = ac;
    setReparsing(true);
    setError(null);
    try {
      const pending = await api.reparse(activeDoc.id);
      const pollId = pending.id;
      watchingId.current = pollId;
      setActiveDoc(pending);
      const detail = await api.pollDocument(pollId, {
        signal: ac.signal,
        onTick: (d) => {
          if (watchingId.current === pollId) setActiveDoc(d);
        },
      });
      refreshDocs();
      if (watchingId.current === pollId) {
        setActiveDoc(detail);
        if (detail.status === "error") setError(detail.error || "Parse failed");
      }
    } catch (e) {
      if ((e as Error).name !== "AbortError") setError((e as Error).message);
    } finally {
      setReparsing(false);
    }
  };

  const deleteDoc = async (id: string) => {
    await api.deleteDocument(id);
    if (activeDoc?.id === id) {
      setActiveDoc(null);
      setView("documents");
    }
    refreshDocs();
  };

  // local edit + debounced persistence
  const onNodesChange = (nodes: DocNode[]) => {
    if (!activeDoc) return;
    const next = { ...activeDoc, nodes, node_count: nodes.length };
    setActiveDoc(next);
    window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => {
      api
        .updateNodes(next.id, nodes)
        .then((updated) => setActiveDoc(updated))
        .catch((e) => setError(e.message));
    }, 700);
  };

  const goNew = () => {
    setActiveDoc(null);
    setView("documents");
  };

  return (
    <div className="app-shell">
      {/* top accent strip */}
      <div style={{ height: 4, flex: "none", display: "flex", background: "var(--navy)" }}>
        <span style={{ width: 78, background: "var(--red)" }} />
      </div>

      <div style={{ flex: 1, display: "flex", minHeight: 0, position: "relative" }}>
        <div
          style={{
            position: "absolute",
            inset: 0,
            pointerEvents: "none",
            backgroundImage:
              "linear-gradient(rgba(38,55,74,.05) 1px,transparent 1px),linear-gradient(90deg,rgba(38,55,74,.05) 1px,transparent 1px)",
            backgroundSize: "46px 46px",
          }}
        />

        <Sidebar
          view={view === "parse" ? "documents" : view}
          onNavigate={(v) => {
            watchingId.current = null; // detach UI from background poll, poll keeps running
            setView(v);
            setActiveDoc(null);
          }}
          docCount={documents.length}
        />

        {view === "parse" && activeDoc ? (
          <ParseView
            doc={activeDoc}
            onNodesChange={onNodesChange}
            onReparse={reparse}
            onNewAnalysis={goNew}
            reparsing={reparsing}
          />
        ) : view === "settings" ? (
          <SettingsView />
        ) : (
          <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0, position: "relative", zIndex: 2 }}>
            {error && <Banner message={error} onClose={() => setError(null)} />}
            <DocumentsView
              documents={documents}
              uploading={uploading}
              onUpload={upload}
              onOpen={openDoc}
              onDelete={deleteDoc}
            />
          </div>
        )}
      </div>
    </div>
  );
}

function Banner({ message, onClose }: { message: string; onClose: () => void }) {
  return (
    <div
      style={{
        background: "#fbeef0",
        borderBottom: "1px solid #e3b6bc",
        color: "var(--red)",
        padding: "10px 22px",
        fontSize: 12.5,
        fontFamily: "var(--mono)",
        display: "flex",
        justifyContent: "space-between",
      }}
    >
      <span>{message}</span>
      <span style={{ cursor: "pointer" }} onClick={onClose}>
        ✕
      </span>
    </div>
  );
}

function SettingsView() {
  return (
    <div style={{ flex: 1, overflowY: "auto", position: "relative", zIndex: 2 }}>
      <div style={{ maxWidth: 720, margin: "0 auto", padding: "32px 24px" }}>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 600, color: "var(--navy)" }}>Settings</h1>
        <p style={{ color: "var(--mut)", fontSize: 13, lineHeight: 1.6 }}>
          Engine and storage are configured via backend environment variables (see{" "}
          <code>backend/.env.example</code>). Local mode stores originals and parsed JSON on disk;
          set <code>STORAGE_BACKEND=adls</code> to persist to Azure Data Lake Gen2 containers.
        </p>
        <ul style={{ color: "var(--ink2)", fontSize: 13, lineHeight: 1.9 }}>
          <li>Parsing engine: <strong>docling</strong></li>
          <li>OCR + table-structure recognition: enabled by default</li>
          <li>Element types: section_header, text, table, picture, list, formula, caption, page_header</li>
        </ul>
      </div>
    </div>
  );
}
