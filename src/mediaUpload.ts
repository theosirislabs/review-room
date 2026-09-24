/** Authenticated media upload used by the post form and batch creator. */

export const CHUNK_SIZE = 25 * 1024 * 1024;
const CHUNK_TIMEOUT_MS = 300000;

export function staffUploadHeaders(extra: Record<string, string> = {}): Record<string, string> {
  const headers: Record<string, string> = { ...extra };
  try {
    const admin = localStorage.getItem("osiris_admin_token");
    if (admin) headers.Authorization = `Bearer ${admin}`;
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k || !k.startsWith("osiris_") || !k.endsWith("_internal")) continue;
      const v = localStorage.getItem(k);
      if (v) {
        headers["x-tenant-token"] = v;
        break;
      }
    }
  } catch { /* ignore */ }
  return headers;
}

function applyStaffHeaders(xhr: XMLHttpRequest) {
  const headers = staffUploadHeaders();
  Object.entries(headers).forEach(([k, v]) => xhr.setRequestHeader(k, v));
}

async function uploadChunked(file: File, onProgress?: (pct: number) => void): Promise<string> {
  const uploadId = crypto.randomUUID();
  const totalChunks = Math.ceil(file.size / CHUNK_SIZE);

  const sendChunk = (chunkFile: File, chunkIndex: number): Promise<void> =>
    new Promise((resolve, reject) => {
      const formData = new FormData();
      formData.append("uploadId", uploadId);
      formData.append("chunkIndex", String(chunkIndex));
      formData.append("totalChunks", String(totalChunks));
      formData.append("file", chunkFile);
      const xhr = new XMLHttpRequest();
      const chunkStartPct = (chunkIndex / totalChunks) * 100;
      const chunkSpanPct = 100 / totalChunks;
      xhr.upload.addEventListener("progress", (e: ProgressEvent) => {
        if (e.lengthComputable && onProgress) {
          onProgress(Math.round(chunkStartPct + (e.loaded / e.total) * chunkSpanPct));
        }
      });
      xhr.addEventListener("load", () => {
        if (xhr.status >= 200 && xhr.status < 300) resolve();
        else {
          try { reject(new Error(JSON.parse(xhr.responseText).error || xhr.statusText)); }
          catch { reject(new Error(`Chunk ${chunkIndex + 1} failed (${xhr.status})`)); }
        }
      });
      xhr.addEventListener("error", () => reject(new Error("Network error")));
      xhr.addEventListener("timeout", () => reject(new Error("Upload timed out")));
      xhr.open("POST", "/api/upload-chunk");
      xhr.withCredentials = true;
      xhr.timeout = CHUNK_TIMEOUT_MS;
      applyStaffHeaders(xhr);
      xhr.send(formData);
    });

  for (let i = 0; i < totalChunks; i++) {
    const start = i * CHUNK_SIZE;
    const end = Math.min(start + CHUNK_SIZE, file.size);
    const chunkFile = new File([file.slice(start, end)], file.name, { type: file.type });
    await sendChunk(chunkFile, i);
  }

  const completeRes = await fetch("/api/upload-complete", {
    method: "POST",
    credentials: "include",
    headers: staffUploadHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({ uploadId, totalChunks, originalFilename: file.name }),
  });
  if (!completeRes.ok) {
    const err = await completeRes.json().catch(() => ({}));
    throw new Error(err.error || "Reassembly failed");
  }
  const { url } = await completeRes.json();
  if (!url) throw new Error("Reassembly returned no URL");
  return url as string;
}

export async function uploadStaffFile(file: File, onProgress?: (pct: number) => void): Promise<string> {
  if (file.size > CHUNK_SIZE) return uploadChunked(file, onProgress);
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const formData = new FormData();
    formData.append("file", file);
    xhr.upload.addEventListener("progress", (e: ProgressEvent) => {
      if (e.lengthComputable && onProgress) onProgress(Math.round((e.loaded / e.total) * 100));
    });
    xhr.addEventListener("load", () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try { resolve(JSON.parse(xhr.responseText).url); }
        catch { reject(new Error("Invalid server response")); }
      } else {
        try { reject(new Error(JSON.parse(xhr.responseText).error || xhr.statusText)); }
        catch { reject(new Error(`Upload failed (${xhr.status})`)); }
      }
    });
    xhr.addEventListener("error", () => reject(new Error("Network error")));
    xhr.addEventListener("timeout", () => reject(new Error("Upload timed out")));
    xhr.open("POST", "/api/upload");
    xhr.withCredentials = true;
    xhr.timeout = 1800000;
    applyStaffHeaders(xhr);
    xhr.send(formData);
  });
}
