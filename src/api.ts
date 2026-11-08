export type Dataset = { id: string; originalFilename: string; fileSize: string; status: string; processingError: string | null; metadata: Record<string, unknown> | null; createdAt: string };
export type Session = { datasetId: string; uploadSessionId: string; originalFilename: string; fileSize: string; partSize: number; totalParts: number; expiresAt: string; fingerprint?: string };
export async function api<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
  const response = await fetch(`${import.meta.env.VITE_API_URL || '/api/v1'}${path}`, { method, headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(15000) });
  if (!response.ok) { const error = await response.json().catch(() => null); throw new Error(error?.message?.toString() || `خطای ارتباط: ${response.status}`); }
  return response.status === 204 ? undefined as T : response.json();
}
export const bytes = (n: number) => n >= 1073741824 ? `${(n / 1073741824).toFixed(2)} GB` : n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${(n / 1024).toFixed(1)} KB`;
export const fingerprint = (file: File) => `${file.name}:${file.size}:${file.lastModified}`;
export function putPart(url: string, blob: Blob, signal: AbortSignal, progress: (n: number) => void) {
  return new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest(); const abort = () => xhr.abort();
    if (signal.aborted) return reject(new DOMException('Paused', 'AbortError'));
    signal.addEventListener('abort', abort, { once: true });
    const cleanup = () => signal.removeEventListener('abort', abort);
    xhr.open('PUT', url); xhr.timeout = 120000;
    xhr.upload.onprogress = e => progress(e.loaded);
    xhr.onload = () => { cleanup(); xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`خطای ارسال بخش: ${xhr.status}`)); };
    xhr.onerror = xhr.ontimeout = () => { cleanup(); reject(new Error('ارتباط با فضای ذخیره‌سازی قطع شد.')); };
    xhr.onabort = () => { cleanup(); reject(new DOMException('Paused', 'AbortError')); };
    xhr.send(blob);
  });
}
