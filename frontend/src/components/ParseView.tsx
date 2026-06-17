import { useMemo, useRef, useState } from "react";
import { api } from "../lib/api";
import type { DocNode, DocumentDetail, NodeType } from "../types";
import { DocumentViewer } from "./DocumentViewer";
import { Download, History, Plus } from "./Icons";
import { LayersBar } from "./LayersBar";
import { ModulePanel } from "./ModulePanel";
import { PropertiesPanel } from "./PropertiesPanel";
import { StructureTree } from "./StructureTree";

type Tab = "parse" | "chunk" | "ingest";

function fmtSize(b: number): string {
  if (b > 1024 * 1024) return `${(b / 1024 / 1024).toFixed(1)} MB`;
  if (b > 1024) return `${(b / 1024).toFixed(0)} KB`;
  return `${b} B`;
}

export function ParseView({
  doc,
  onNodesChange,
  onReparse,
  onNewAnalysis,
  reparsing,
}: {
  doc: DocumentDetail;
  onNodesChange: (nodes: DocNode[]) => void;
  onReparse: () => void;
  onNewAnalysis: () => void;
  reparsing: boolean;
}) {
  const [tab, setTab] = useState<Tab>("parse");
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [filter, setFilter] = useState("");
  const [hiddenLayers, setHiddenLayers] = useState<string[]>([]);
  const [draft, setDraft] = useState("");
  const [saved, setSaved] = useState(false);
  const savedTimer = useRef<number | undefined>(undefined);

  const nodes = doc.nodes;
  const pages = Math.max(1, doc.pages);

  const pageNodes = useMemo(() => nodes.filter((n) => n.page === currentPage), [nodes, currentPage]);

  const treeNodes = useMemo(() => {
    const ft = filter.trim().toLowerCase();
    return pageNodes.filter(
      (n) =>
        !hiddenLayers.includes(n.type) &&
        (!ft || n.text.toLowerCase().includes(ft) || n.type.includes(ft))
    );
  }, [pageNodes, filter, hiddenLayers]);

  const selected = nodes.find((n) => n.id === selectedId) || null;
  const readingOrder = selected ? pageNodes.findIndex((n) => n.id === selected.id) + 1 : 0;

  const selectNode = (id: string) => {
    const n = nodes.find((x) => x.id === id);
    setSelectedId(id);
    setDraft(n ? n.text : "");
    setSaved(false);
  };

  const toggleLayer = (t: NodeType) =>
    setHiddenLayers((s) => (s.includes(t) ? s.filter((x) => x !== t) : [...s, t]));

  const changeType = (t: NodeType) =>
    onNodesChange(nodes.map((n) => (n.id === selectedId ? { ...n, type: t } : n)));

  // live edit: reflect text in the document region immediately
  const changeText = (v: string) => {
    setDraft(v);
    setSaved(false);
    onNodesChange(nodes.map((n) => (n.id === selectedId ? { ...n, text: v } : n)));
  };

  const apply = () => {
    onNodesChange(nodes.map((n) => (n.id === selectedId ? { ...n, text: draft } : n)));
    setSaved(true);
    window.clearTimeout(savedTimer.current);
    savedTimer.current = window.setTimeout(() => setSaved(false), 1600);
  };

  const deleteNode = () => {
    onNodesChange(nodes.filter((n) => n.id !== selectedId));
    setSelectedId(null);
  };

  const setPage = (n: number) => {
    setCurrentPage(n);
    setSelectedId(null);
  };

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0, position: "relative", zIndex: 2 }}>
      {/* top bar */}
      <header
        style={{
          height: 50,
          flex: "none",
          display: "flex",
          alignItems: "center",
          padding: "0 22px",
          borderBottom: "1px solid var(--line)",
          background: "var(--surface)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 9, fontSize: 12.5, fontFamily: "var(--mono)" }}>
          <span style={{ color: "var(--mut)" }}>Studio</span>
          <span style={{ color: "var(--dim)" }}>/</span>
          <span style={{ color: "var(--mut)" }}>{doc.filename}</span>
          <span style={{ color: "var(--dim)" }}>/</span>
          <span style={{ color: "var(--navy)", fontWeight: 600, textTransform: "capitalize" }}>{tab}</span>
        </div>
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 14 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 7,
              fontFamily: "var(--mono)",
              fontSize: 10.5,
              color: "var(--mut)",
            }}
          >
            <span
              style={{
                width: 6,
                height: 6,
                borderRadius: "50%",
                background: "var(--teal-br)",
                boxShadow: "0 0 6px rgba(19,138,130,.6)",
              }}
            />
            SECURE&nbsp;·&nbsp;PROTECTED&nbsp;B
          </div>
          <button className="btn btn-red" onClick={onNewAnalysis}>
            <Plus color="#fff" />
            New analysis
          </button>
        </div>
      </header>

      {/* file title row */}
      <div
        style={{
          flex: "none",
          padding: "16px 22px 14px",
          borderBottom: "1px solid var(--line)",
          display: "flex",
          alignItems: "flex-start",
          gap: 16,
          background: "var(--surface)",
        }}
      >
        <div
          style={{
            width: 40,
            height: 48,
            flex: "none",
            borderRadius: 6,
            background: "var(--teal-dim)",
            border: "1px solid var(--teal-line)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <span style={{ fontFamily: "var(--mono)", fontSize: 9, color: "var(--teal)", fontWeight: 600 }}>
            {(doc.filename.split(".").pop() || "DOC").toUpperCase().slice(0, 4)}
          </span>
        </div>
        <div style={{ minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <h1 style={{ margin: 0, fontSize: 19, fontWeight: 600, color: "var(--navy)" }}>{doc.filename}</h1>
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
                color: "var(--teal)",
              }}
            >
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--teal-br)" }} />
              {doc.status.toUpperCase()}
            </span>
          </div>
          <div style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--mut)", marginTop: 6 }}>
            {fmtSize(doc.size_bytes)} · {doc.pages} pages · {doc.node_count} nodes · {doc.classification}
          </div>
        </div>
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 14 }}>
          {/* tabs */}
          <div style={{ display: "flex", gap: 4, background: "#eef1f4", padding: 3, borderRadius: 9 }}>
            {(["parse", "chunk", "ingest"] as Tab[]).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className="btn"
                style={{
                  padding: "6px 13px",
                  background: tab === t ? "var(--navy)" : "transparent",
                  color: tab === t ? "#fff" : "var(--mut)",
                  textTransform: "capitalize",
                  fontWeight: tab === t ? 600 : 500,
                }}
              >
                {t}
              </button>
            ))}
          </div>
          <a className="btn btn-teal" href={api.exportUrl(doc.id)} style={{ textDecoration: "none" }}>
            <Download color="#fff" />
            Download JSON
          </a>
          <button className="btn btn-ghost" title="History">
            <History />
          </button>
        </div>
      </div>

      {/* layers */}
      <LayersBar
        pageNodes={pageNodes}
        hiddenLayers={hiddenLayers}
        onToggle={toggleLayer}
        onReparse={onReparse}
        reparsing={reparsing}
      />

      {/* workspace */}
      <div style={{ flex: 1, display: "flex", minHeight: 0 }}>
        <StructureTree
          nodes={treeNodes}
          totalCount={pageNodes.length}
          filter={filter}
          onFilter={setFilter}
          selectedId={selectedId}
          onSelect={selectNode}
          onHover={setHoveredId}
          onExpandAll={() => setHiddenLayers([])}
          onCollapseAll={() => setFilter("")}
        />

        <DocumentViewer
          tab={tab}
          pageNodes={pageNodes}
          pages={pages}
          currentPage={currentPage}
          selectedId={selectedId}
          hoveredId={hoveredId}
          hiddenLayers={hiddenLayers}
          enableGlow
          onSelect={selectNode}
          onHover={setHoveredId}
          onPage={setPage}
          onPrev={() => setPage(Math.max(1, currentPage - 1))}
          onNext={() => setPage(Math.min(pages, currentPage + 1))}
        />

        {tab === "parse" ? (
          <PropertiesPanel
            node={selected}
            readingOrder={readingOrder}
            pages={pages}
            draftText={draft}
            saved={saved}
            onChangeType={changeType}
            onChangeText={changeText}
            onApply={apply}
            onDelete={deleteNode}
          />
        ) : (
          <ModulePanel tab={tab} docId={doc.id} />
        )}
      </div>
    </div>
  );
}
