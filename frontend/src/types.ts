export type NodeType =
  | "page_header"
  | "section_header"
  | "text"
  | "table"
  | "picture"
  | "list"
  | "formula"
  | "caption";

export type DocStatus = "uploaded" | "parsing" | "parsed" | "error";

export interface BBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface DocNode {
  id: string;
  reading_order: number;
  page: number;
  type: NodeType;
  text: string;
  confidence: number;
  bbox?: BBox | null;
  // For table nodes: structured HTML for rich rendering (text holds markdown).
  table_html?: string | null;
  // For picture nodes: base64 PNG data URI of the extracted image.
  image?: string | null;
}

export interface DocumentSummary {
  id: string;
  filename: string;
  size_bytes: number;
  status: DocStatus;
  pages: number;
  node_count: number;
  classification: string;
  created_at: string;
  parsed_at?: string | null;
  error?: string | null;
}

export interface PageImage {
  page_no: number;
  width: number;
  height: number;
  image?: string | null;
}

export interface DocumentDetail extends DocumentSummary {
  nodes: DocNode[];
  page_images?: PageImage[];
}

export interface Chunk {
  index: number;
  text: string;
  node_ids: string[];
  page_span: number[];
  token_estimate: number;
}

export interface ChunkResponse {
  document_id: string;
  chunk_count: number;
  chunks: Chunk[];
}

export interface IngestResponse {
  document_id: string;
  store: string;
  chunks_ingested: number;
  status: string;
}

export interface EngineHealth {
  online: boolean;
  engine: string;
  version?: string;
  error?: string;
}

export const NODE_COLORS: Record<NodeType, string> = {
  page_header: "var(--slate)",
  section_header: "var(--red)",
  text: "var(--link)",
  table: "var(--violet)",
  picture: "var(--green)",
  list: "var(--tealc)",
  formula: "var(--rose)",
  caption: "var(--gold)",
};

export const NODE_TYPES: NodeType[] = [
  "section_header",
  "text",
  "table",
  "picture",
  "list",
  "formula",
  "caption",
  "page_header",
];
