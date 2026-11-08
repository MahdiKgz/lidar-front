import { api, fingerprint, putPart, type Session } from './api';
export const SESSION_KEY = 'lidar-upload-session';
export async function uploadFile(file: File, previous: Session | null, signal: AbortSignal, update: (session: Session, loaded: number) => void) {
  if (!/\.(las|laz)$/i.test(file.name) || file.size < 1 || file.size > 1073741824) throw new Error('یک فایل LAS یا LAZ با حجم حداکثر ۱ گیگابایت انتخاب کنید.');
  if (previous && previous.fingerprint !== fingerprint(file)) throw new Error('برای ادامه، همان فایل قبلی را انتخاب کنید.');
  const session: Session = previous ?? { ...await api<Session>('/uploads/initiate', 'POST', { originalFilename: file.name, fileSize: file.size }), fingerprint: fingerprint(file) };
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  update(session, 0);
  let existing: { uploadedParts: { partNumber: number; valid: boolean; size: number }[] };
  try { existing = await api(`/uploads/${session.uploadSessionId}/parts`); }
  catch (originalError) {
    // A lost complete response must not strand a successfully completed session.
    try { await api(`/uploads/${session.uploadSessionId}/complete`, 'POST'); localStorage.removeItem(SESSION_KEY); return session; }
    catch { throw originalError; }
  }
  const sizes = new Map<number, number>();
  existing.uploadedParts.filter(p => p.valid).forEach(p => sizes.set(p.partNumber, p.size));
  const emit = () => update(session, [...sizes.values()].reduce((a, b) => a + b, 0)); emit();
  const pending = Array.from({ length: session.totalParts }, (_, i) => i + 1).filter(n => !sizes.has(n));
  let failed = false;
  const worker = async () => {
    while (pending.length && !failed) {
      if (signal.aborted) throw new DOMException('Paused', 'AbortError');
      const partNumber = pending.shift()!;
      const blob = file.slice((partNumber - 1) * session.partSize, partNumber * session.partSize);
      for (let attempt = 0; ; attempt++) {
        try {
          const signed = await api<{ parts: { url: string }[] }>(`/uploads/${session.uploadSessionId}/parts/presign`, 'POST', { partNumbers: [partNumber] });
          await putPart(signed.parts[0].url, blob, signal, n => { sizes.set(partNumber, n); emit(); });
          sizes.set(partNumber, blob.size); emit(); break;
        } catch (error) {
          sizes.delete(partNumber); emit();
          if (signal.aborted || attempt >= 2) { failed = true; throw error; }
          await new Promise(r => setTimeout(r, 500 * 2 ** attempt));
        }
      }
    }
  };
  const results = await Promise.allSettled(Array.from({ length: Math.min(3, pending.length) }, worker));
  const failure = results.find(r => r.status === 'rejected'); if (failure?.status === 'rejected') throw failure.reason;
  if (signal.aborted) throw new DOMException('Paused', 'AbortError');
  await api(`/uploads/${session.uploadSessionId}/complete`, 'POST');
  localStorage.removeItem(SESSION_KEY); return session;
}
