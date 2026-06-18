import type {
  ChunkResponse,
  DocNode,
  DocumentDetail,
  DocumentSummary,
  EngineHealth,
  IngestResponse,
} from "../types";

const BASE = "/api";

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let detail = res.statusText;
    try {
      const body = await res.json();
      detail = body.detail || detail;
    } catch {
      /* ignore */
    }
    throw new Error(detail);
  }
  return res.json() as Promise<T>;
}

export const api = {
  engineHealth: () =>
    fetch(`${BASE}/health/engine`).then((r) => json<EngineHealth>(r)),

  listDocuments: () =>
    fetch(`${BASE}/documents`).then((r) => json<DocumentSummary[]>(r)),

  getDocument: (id: string) =>
    fetch(`${BASE}/documents/${id}`).then((r) => json<DocumentDetail>(r)),

  uploadAndParse: (file: File) => {
    const fd = new FormData();
    fd.append("file", file);
    return fetch(`${BASE}/documents/upload-and-parse`, {
      method: "POST",
      body: fd,
    }).then((r) => json<DocumentDetail>(r));
  },

  reparse: (id: string) =>
    fetch(`${BASE}/documents/${id}/parse`, { method: "POST" }).then((r) =>
      json<DocumentDetail>(r)
    ),

  updateNodes: (id: string, nodes: DocNode[]) =>
    fetch(`${BASE}/documents/${id}/nodes`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(nodes),
    }).then((r) => json<DocumentDetail>(r)),

  deleteDocument: (id: string) =>
    fetch(`${BASE}/documents/${id}`, { method: "DELETE" }),

  exportUrl: (id: string) => `${BASE}/documents/${id}/export`,

  /**
   * Poll GET /documents/{id} every `intervalMs` until parsing reaches a terminal
   * state ("parsed" or "error"). `onTick` receives each intermediate detail so
   * the UI can reflect progress. Resolves with the final detail.
   */
  pollDocument: (
    id: string,
    opts: { intervalMs?: number; onTick?: (d: DocumentDetail) => void } = {}
  ): Promise<DocumentDetail> => {
    const interval = opts.intervalMs ?? 2000;
    return new Promise((resolve, reject) => {
      const tick = async () => {
        try {
          const detail = await api.getDocument(id);
          opts.onTick?.(detail);
          if (detail.status === "parsed" || detail.status === "error") {
            resolve(detail);
          } else {
            window.setTimeout(tick, interval);
          }
        } catch (e) {
          reject(e);
        }
      };
      tick();
    });
  },

  chunk: (id: string, max_tokens: number, overlap: number) =>
    fetch(`${BASE}/documents/${id}/chunk`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ max_tokens, overlap }),
    }).then((r) => json<ChunkResponse>(r)),

  ingest: (id: string, store: string, max_tokens: number, overlap: number) =>
    fetch(`${BASE}/documents/${id}/ingest`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ store, max_tokens, overlap }),
    }).then((r) => json<IngestResponse>(r)),
};
