import { useEffect, useRef, useState } from "react";
import { NODE_COLORS, type DocNode, type PageImage } from "../types";
import { ChevronLeft, ChevronRight, Grid } from "./Icons";

type Tab = "parse" | "chunk" | "ingest";
type ViewMode = "layout" | "text";

/** Translucent fill from a node-type CSS color var (used for overlay boxes). */
function fillFor(type: DocNode["type"], pct: number): string {
  return `color-mix(in srgb, ${NODE_COLORS[type]} ${pct}%, transparent)`;
}

/** Visual styling per node type inside the dark document canvas. */
function nodeStyle(type: DocNode["type"]): React.CSSProperties {
  switch (type) {
    case "section_header":
      return { fontFamily: "var(--serif)", fontSize: 26, fontWeight: 600, color: "var(--doc-head)", letterSpacing: "-.01em" };
    case "page_header":
      return { fontFamily: "var(--mono)", fontSize: 10.5, letterSpacing: ".18em", color: "var(--doc-mut)" };
    case "caption":
      return { fontFamily: "var(--serif)", fontSize: 12, fontStyle: "italic", color: "var(--doc-mut)" };
    case "list":
      return { fontFamily: "var(--serif)", fontSize: 14, lineHeight: 1.55, color: "var(--doc-body)" };
    case "formula":
      return { fontFamily: "var(--mono)", fontSize: 13, color: "var(--teal-lt)" };
    default:
      return { fontFamily: "var(--serif)", fontSize: 15, lineHeight: 1.62, color: "var(--doc-body)" };
  }
}

export function DocumentViewer({
  tab,
  pageNodes,
  pages,
  currentPage,
  pageImage,
  viewMode,
  selectedId,
  hoveredId,
  hiddenLayers,
  enableGlow,
  parsing,
  onSelect,
  onHover,
  onPage,
  onPrev,
  onNext,
  onViewMode,
}: {
  tab: Tab;
  pageNodes: DocNode[];
  pages: number;
  currentPage: number;
  pageImage?: PageImage | null;
  viewMode: ViewMode;
  selectedId: string | null;
  hoveredId: string | null;
  hiddenLayers: string[];
  enableGlow: boolean;
  parsing?: boolean;
  onSelect: (id: string) => void;
  onHover: (id: string | null) => void;
  onPage: (n: number) => void;
  onPrev: () => void;
  onNext: () => void;
  onViewMode: (m: ViewMode) => void;
}) {
  const hasLayout = !!pageImage?.image;
  const showLayout = viewMode === "layout" && hasLayout;
  return (
    <section
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        minWidth: 0,
        background: "radial-gradient(150% 90% at 50% 0%,#f3f6f8,#e7edf1)",
      }}
    >
      {/* page rail */}
      <div
        style={{
          flex: "none",
          display: "flex",
          alignItems: "center",
          gap: 14,
          padding: "10px 18px",
          borderBottom: "1px solid var(--doc-line)",
          background: "rgba(0,0,0,.04)",
        }}
      >
        <div style={{ display: "flex", gap: 5, overflowX: "auto", paddingBottom: 2 }}>
          {Array.from({ length: Math.max(1, pages) }, (_, i) => i + 1).map((n) => {
            const active = n === currentPage;
            return (
              <button
                key={n}
                onClick={() => onPage(n)}
                style={{
                  width: 28,
                  height: 28,
                  flex: "none",
                  borderRadius: 7,
                  border: `1px solid ${active ? "var(--teal-br)" : "var(--doc-line)"}`,
                  background: active ? "var(--teal-br)" : "#fff",
                  color: active ? "#fff" : "var(--doc-mut)",
                  fontFamily: "var(--mono)",
                  fontSize: 11,
                  fontWeight: 500,
                  cursor: "pointer",
                }}
              >
                {n}
              </button>
            );
          })}
        </div>
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 10 }}>
          {hasLayout && (
            <div style={{ display: "flex", gap: 3, background: "#eef1f4", padding: 3, borderRadius: 8 }}>
              {(["layout", "text"] as ViewMode[]).map((m) => (
                <button
                  key={m}
                  onClick={() => onViewMode(m)}
                  style={{
                    padding: "4px 11px",
                    border: "none",
                    borderRadius: 6,
                    cursor: "pointer",
                    fontFamily: "var(--mono)",
                    fontSize: 10.5,
                    letterSpacing: ".04em",
                    textTransform: "uppercase",
                    fontWeight: viewMode === m ? 600 : 500,
                    background: viewMode === m ? "var(--navy)" : "transparent",
                    color: viewMode === m ? "#fff" : "var(--mut)",
                  }}
                >
                  {m}
                </button>
              ))}
            </div>
          )}
          <span style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--mut)", whiteSpace: "nowrap" }}>
            Page {currentPage} of {pages}
          </span>
          <RailBtn onClick={onPrev}>
            <ChevronLeft />
          </RailBtn>
          <RailBtn onClick={onNext}>
            <ChevronRight />
          </RailBtn>
        </div>
      </div>

      {/* surface */}
      <div style={{ flex: 1, overflowY: "auto", padding: 30, display: "flex", justifyContent: "center" }}>
        {tab !== "parse" ? (
          <ModulePlaceholder tab={tab} />
        ) : showLayout ? (
          <LayoutView
            page={pageImage as PageImage}
            nodes={pageNodes}
            selectedId={selectedId}
            hoveredId={hoveredId}
            hiddenLayers={hiddenLayers}
            enableGlow={enableGlow}
            onSelect={onSelect}
            onHover={onHover}
          />
        ) : (
          <div
            style={{
              width: 680,
              maxWidth: "100%",
              background: "var(--doc-card)",
              border: "1px solid var(--doc-line)",
              borderRadius: 6,
              position: "relative",
              boxShadow: "0 24px 60px -24px rgba(0,0,0,.6)",
              height: "max-content",
            }}
          >
            {/* corner brackets */}
            <Corner pos="tl" />
            <Corner pos="br" />

            <div style={{ padding: "40px 46px 52px", display: "flex", flexDirection: "column", gap: 13 }}>
              {pageNodes.length === 0 && (
                <div
                  style={{
                    textAlign: "center",
                    color: "var(--doc-mut)",
                    fontSize: 13,
                    padding: "40px 0",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    gap: 12,
                  }}
                >
                  {parsing ? (
                    <>
                      <span className="spinner spinner-dark" />
                      Parsing document…
                    </>
                  ) : (
                    "No parsed nodes on this page."
                  )}
                </div>
              )}
              {pageNodes.map((n) => {
                const dim = hiddenLayers.includes(n.type);
                const sel = selectedId === n.id;
                const hov = hoveredId === n.id;
                const ring = sel
                  ? enableGlow
                    ? "0 0 0 1.5px var(--teal-br), 0 0 16px rgba(19,138,130,.28)"
                    : "0 0 0 1.5px var(--teal-br)"
                  : hov
                  ? "0 0 0 1px var(--teal-br)"
                  : "none";
                const accent = NODE_COLORS[n.type];
                return (
                  <div
                    key={n.id}
                    onClick={() => onSelect(n.id)}
                    onMouseEnter={() => onHover(n.id)}
                    onMouseLeave={() => onHover(null)}
                    style={{
                      position: "relative",
                      cursor: "pointer",
                      border: "1px solid transparent",
                      borderLeft: `2px solid ${accent}`,
                      borderRadius: 4,
                      padding: "8px 12px",
                      opacity: dim ? 0.2 : 1,
                      boxShadow: ring,
                      transition: "box-shadow .15s, background .15s, opacity .15s",
                    }}
                  >
                    <span
                      style={{
                        position: "absolute",
                        top: -8,
                        left: 9,
                        fontFamily: "var(--mono)",
                        fontSize: 8,
                        letterSpacing: ".08em",
                        textTransform: "uppercase",
                        color: accent,
                        background: "var(--doc-card)",
                        padding: "0 4px",
                      }}
                    >
                      {n.type}
                    </span>
                    {n.type === "picture" ? (
                      <PictureRegion label={n.text} image={n.image} />
                    ) : n.type === "table" && n.table_html ? (
                      <div
                        className="doc-table"
                        dangerouslySetInnerHTML={{ __html: n.table_html }}
                      />
                    ) : (
                      <div style={nodeStyle(n.type)}>{n.text}</div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

/**
 * Original-document view: the rendered page bitmap with absolutely-positioned,
 * labeled bounding boxes per node. Boxes are placed as percentages of the page's
 * point dimensions so they scale with the image at any width.
 */
function LayoutView({
  page,
  nodes,
  selectedId,
  hoveredId,
  hiddenLayers,
  enableGlow,
  onSelect,
  onHover,
}: {
  page: PageImage;
  nodes: DocNode[];
  selectedId: string | null;
  hoveredId: string | null;
  hiddenLayers: string[];
  enableGlow: boolean;
  onSelect: (id: string) => void;
  onHover: (id: string | null) => void;
}) {
  const W = page.width || 1;
  const H = page.height || 1;

  // Track the rendered width so labels can be sized in the page's own point
  // space (px-per-point) — that keeps them proportional to the document's text
  // at any zoom instead of a fixed pixel size that overpowers small renders.
  const wrapRef = useRef<HTMLDivElement>(null);
  const [pxPerPt, setPxPerPt] = useState(1);
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const update = () => setPxPerPt(el.clientWidth / W);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [W, page.image]);

  // ~6.5pt label, clamped so it stays legible but never larger than body text.
  const labelFont = Math.min(11, Math.max(4.5, 6.5 * pxPerPt));
  const labelH = labelFont + 3;

  return (
    <div
      style={{
        width: 720,
        maxWidth: "100%",
        background: "var(--doc-card)",
        border: "1px solid var(--doc-line)",
        borderRadius: 6,
        position: "relative",
        boxShadow: "0 24px 60px -24px rgba(0,0,0,.6)",
        height: "max-content",
        padding: 16,
      }}
    >
      <Corner pos="tl" />
      <Corner pos="br" />
      {/* image box — overlays are positioned relative to this wrapper */}
      <div ref={wrapRef} style={{ position: "relative", lineHeight: 0 }}>
        <img
          src={page.image as string}
          alt={`Page ${page.page_no}`}
          style={{ display: "block", width: "100%", height: "auto", borderRadius: 2 }}
        />
        {nodes.map((n) => {
          if (!n.bbox) return null;
          const dim = hiddenLayers.includes(n.type);
          const sel = selectedId === n.id;
          const hov = hoveredId === n.id;
          const accent = NODE_COLORS[n.type];
          const left = (n.bbox.x / W) * 100;
          const top = (n.bbox.y / H) * 100;
          const w = (n.bbox.width / W) * 100;
          const h = (n.bbox.height / H) * 100;
          // Only label the active box at small zoom to avoid clutter; always
          // label when hovered/selected.
          const showLabel = sel || hov || labelFont >= 6.5;
          return (
            <div
              key={n.id}
              onClick={() => onSelect(n.id)}
              onMouseEnter={() => onHover(n.id)}
              onMouseLeave={() => onHover(null)}
              style={{
                position: "absolute",
                left: `${left}%`,
                top: `${top}%`,
                width: `${w}%`,
                height: `${h}%`,
                border: `${Math.max(0.75, pxPerPt * 0.6)}px solid ${accent}`,
                borderRadius: 2,
                background: sel ? fillFor(n.type, 18) : hov ? fillFor(n.type, 9) : "transparent",
                boxShadow: sel && enableGlow ? `0 0 10px ${fillFor(n.type, 45)}` : "none",
                opacity: dim ? 0.12 : 1,
                cursor: "pointer",
                transition: "background .12s, opacity .12s",
                zIndex: sel || hov ? 3 : 1,
              }}
            >
              {showLabel && (
                <span
                  style={{
                    position: "absolute",
                    top: -labelH,
                    left: -0.75,
                    fontFamily: "var(--mono)",
                    fontSize: labelFont,
                    lineHeight: `${labelH}px`,
                    letterSpacing: ".04em",
                    fontWeight: 500,
                    textTransform: "uppercase",
                    color: "#fff",
                    background: accent,
                    padding: `0 ${Math.max(2, labelFont * 0.45)}px`,
                    borderRadius: "2px 2px 0 0",
                    whiteSpace: "nowrap",
                    pointerEvents: "none",
                    opacity: dim ? 0 : sel || hov ? 1 : 0.82,
                    zIndex: sel || hov ? 4 : 2,
                  }}
                >
                  {n.type}
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function RailBtn({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      style={{
        width: 28,
        height: 28,
        borderRadius: 7,
        border: "1px solid var(--doc-line)",
        background: "#fff",
        color: "var(--doc-mut)",
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
        e.currentTarget.style.color = "var(--doc-mut)";
        e.currentTarget.style.borderColor = "var(--doc-line)";
      }}
    >
      {children}
    </button>
  );
}

function Corner({ pos }: { pos: "tl" | "br" }) {
  const common: React.CSSProperties = { position: "absolute", width: 18, height: 18 };
  if (pos === "tl")
    return (
      <div
        style={{
          ...common,
          top: -1,
          left: -1,
          borderTop: "2px solid var(--teal-br)",
          borderLeft: "2px solid var(--teal-br)",
          borderRadius: "6px 0 0 0",
        }}
      />
    );
  return (
    <div
      style={{
        ...common,
        bottom: -1,
        right: -1,
        borderBottom: "2px solid var(--teal-br)",
        borderRight: "2px solid var(--teal-br)",
        borderRadius: "0 0 6px 0",
      }}
    />
  );
}

function PictureRegion({ label, image }: { label: string; image?: string | null }) {
  // When docling extracted the bitmap, render it; otherwise fall back to the
  // dashed placeholder graphic.
  if (image) {
    return (
      <figure style={{ margin: 0 }}>
        <img
          src={image}
          alt={label || "extracted figure"}
          style={{
            display: "block",
            maxWidth: "100%",
            height: "auto",
            borderRadius: 6,
            border: "1px solid var(--doc-line)",
          }}
        />
        {label && (
          <figcaption
            style={{
              fontFamily: "var(--mono)",
              fontSize: 11,
              color: "var(--doc-mut)",
              marginTop: 6,
            }}
          >
            {label}
          </figcaption>
        )}
      </figure>
    );
  }
  return (
    <div
      style={{
        border: "1px dashed var(--doc-line)",
        borderRadius: 6,
        background: "rgba(47,125,79,.08)",
        padding: 22,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 18,
      }}
    >
      <svg width="180" height="60" viewBox="0 0 220 74" fill="none" strokeWidth={1.3}>
        <rect x="8" y="26" width="46" height="22" rx="3" stroke="var(--green)" fill="rgba(47,125,79,.08)" />
        <rect x="87" y="10" width="46" height="22" rx="3" stroke="var(--green)" fill="rgba(47,125,79,.08)" />
        <rect x="87" y="42" width="46" height="22" rx="3" stroke="var(--green)" fill="rgba(47,125,79,.08)" />
        <rect x="166" y="26" width="46" height="22" rx="3" stroke="var(--green)" fill="rgba(47,125,79,.08)" />
        <path d="M54 37h33M133 21h33M133 53h33" stroke="var(--green)" strokeDasharray="3 3" />
      </svg>
      <span
        style={{
          fontFamily: "var(--mono)",
          fontSize: 10,
          letterSpacing: ".14em",
          color: "var(--green)",
          textTransform: "uppercase",
        }}
      >
        {label || "image region"}
      </span>
    </div>
  );
}

function ModulePlaceholder({ tab }: { tab: "chunk" | "ingest" }) {
  const info = {
    chunk: {
      title: "Chunking module",
      body: "Segment the parsed document into retrieval-ready chunks. Configure chunk size and overlap in the panel, then run chunking.",
    },
    ingest: {
      title: "Ingest module",
      body: "Embed and write chunks into a vector store. Choose a destination store in the panel to begin ingestion of the parsed nodes.",
    },
  }[tab];
  return (
    <div style={{ margin: "auto", textAlign: "center", maxWidth: 360 }}>
      <div
        style={{
          width: 60,
          height: 60,
          borderRadius: 14,
          border: "1px solid var(--teal-line)",
          background: "var(--teal-dim)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          margin: "0 auto 18px",
        }}
      >
        <Grid />
      </div>
      <div style={{ fontSize: 16, fontWeight: 600, color: "var(--navy)" }}>{info.title}</div>
      <div style={{ fontSize: 12.5, color: "var(--doc-mut)", marginTop: 8, lineHeight: 1.6 }}>
        {info.body}
      </div>
    </div>
  );
}
