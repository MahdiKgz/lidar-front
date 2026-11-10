import type { Dataset } from './api';
export type DatasetUpdate = Pick<Dataset, 'id' | 'status' | 'processingError'> & Partial<Dataset>;
export function subscribeDatasets(handlers: {
  sync: () => void;
  update: (dataset: DatasetUpdate) => void;
  remove: (id: string) => void;
  progress: (id: string, progress: number) => void;
  connection: (connected: boolean) => void;
}) {
  const source = new EventSource(`${(import.meta.env.VITE_API_URL || '/api/v1').replace(/\/$/, '')}/datasets/events`);
  const listen = (type: string, callback: (data: any) => void) => source.addEventListener(type, event => {
    try { callback(JSON.parse((event as MessageEvent).data)); } catch { /* Ignore malformed frames; reconnect snapshots remain authoritative. */ }
  });
  listen('connected', () => { handlers.connection(true); handlers.sync(); });
  listen('sync-required', () => handlers.sync());
  listen('dataset-created', () => handlers.sync());
  listen('dataset-updated', data => { if (typeof data.id === 'string' && typeof data.status === 'string') handlers.update(data); });
  listen('dataset-deleted', data => { if (typeof data.id === 'string') { handlers.remove(data.id); handlers.sync(); } });
  listen('dataset-progress', data => { if (typeof data.id === 'string' && typeof data.progress === 'number') handlers.progress(data.id, Math.max(0, Math.min(100, data.progress))); });
  source.onerror = () => handlers.connection(false);
  // EventSource reconnects natively; never start a competing retry loop or polling fallback.
  return () => source.close();
}
