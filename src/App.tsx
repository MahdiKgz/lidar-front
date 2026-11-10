import { QUALITY_LEVELS, type ViewerQuality } from './lod';
import { subscribeDatasets } from './events';
import { useEffect, useRef, useState, lazy, Suspense } from 'react';
import { UploadCloud, Pause, Play, Trash2, RefreshCw, Crosshair, Mountain, ArrowUpLeft, Check, FileBox } from 'lucide-react';
import { api, bytes, type Dataset, type Session } from './api';
import { SESSION_KEY, uploadFile } from './upload';
const Viewer = lazy(() => import('./Viewer'));
const ViewerStatus = lazy(() => import('./Viewer').then(m => ({ default: m.ViewerStatus })));
const labels: Record<string, string> = { UPLOADING: 'در حال آپلود', UPLOADED: 'آمادهٔ پردازش', QUEUED: 'در صف پردازش', PROCESSING: 'در حال پردازش', READY: 'آمادهٔ نمایش', FAILED: 'ناموفق', DELETING: 'در حال حذف' };
function saved(): Session | null { try { return JSON.parse(localStorage.getItem(SESSION_KEY) || 'null'); } catch { return null; } }
export default function App() {
  const [datasets, setDatasets] = useState<Dataset[]>([]), [selected, setSelected] = useState<Dataset | null>(null);
  const [session, setSession] = useState<Session | null>(saved), [file, setFile] = useState<File | null>(null);
  const [loaded, setLoaded] = useState(0), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const [connected, setConnected] = useState(false), [page, setPage] = useState(1), [total, setTotal] = useState(0);
  const [search, setSearch] = useState(''), [points, setPoints] = useState(0), [pointSize, setPointSize] = useState(2), [visible, setVisible] = useState(true);
  const [quality, setQuality] = useState<ViewerQuality>('ultra');
  const [colorMode, setColorMode] = useState<'rgb' | 'elevation'>('rgb');
  const [viewerMessage, setViewerMessage] = useState('');
  const [processingProgress, setProcessingProgress] = useState<Record<string, number>>({});
  const refreshRef = useRef<() => Promise<void>>(async () => {});
  const controller = useRef<AbortController | null>(null); const input = useRef<HTMLInputElement>(null);
  const selectedRef = useRef(selected); selectedRef.current = selected;
  const refreshSequence = useRef(0);
  const refresh = async () => {
    const sequence = ++refreshSequence.current;
    try { const result = await api<{ data: Dataset[]; total: number }>(`/datasets?page=${page}&limit=12&search=${encodeURIComponent(search)}`); if (sequence !== refreshSequence.current) return; setDatasets(result.data); setTotal(result.total); setConnected(true); setSelected(previous => previous ? result.data.find(d => d.id === previous.id) ?? previous : null); }
    catch { setConnected(false); }
  };
  refreshRef.current = async () => {
    await refresh();
    const current = selectedRef.current;
    if (!current) return;
    try {
      const status = await api<{ id: string; status: string; processingError: string | null; processing: { progress: number } | null }>(`/datasets/${current.id}/status`);
      setSelected(value => value?.id === status.id ? { ...value, status: status.status, processingError: status.processingError } : value);
      if (typeof status.processing?.progress === 'number') setProcessingProgress(value => ({ ...value, [status.id]: status.processing!.progress }));
    } catch { /* Stream reconnect will retry the snapshot. */ }
  };
  useEffect(() => { void refreshRef.current(); }, [page, search]);
  useEffect(() => () => controller.current?.abort(), []);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const sync = () => { if (timer) clearTimeout(timer); timer = setTimeout(() => { void refreshRef.current(); }, 150); };
    const close = subscribeDatasets({
      sync,
      connection: setConnected,
      update: update => {
        setDatasets(current => current.map(d => d.id === update.id ? { ...d, ...update } : d));
        setSelected(current => current?.id === update.id ? { ...current, ...update } : current);
        if (update.status !== 'PROCESSING') setProcessingProgress(current => { const next = { ...current }; delete next[update.id]; return next; });
      },
      remove: id => { setDatasets(current => current.filter(d => d.id !== id)); setSelected(current => current?.id === id ? null : current); },
      progress: (id, progress) => setProcessingProgress(current => ({ ...current, [id]: progress })),
    });
    return () => { close(); if (timer) clearTimeout(timer); };
  }, []);
  const start = async () => {
    if (!file || busy) return; setError(''); setBusy(true); controller.current = new AbortController();
    try { await uploadFile(file, session, controller.current.signal, (s, n) => { setSession(s); setLoaded(n); }); setSession(null); setFile(null); setLoaded(0); await refresh(); }
    catch (e) { if ((e as Error).name !== 'AbortError') setError((e as Error).message); }
    finally { setBusy(false); }
  };
  const cancel = async () => { controller.current?.abort(); if (!session) return; try { await api(`/uploads/${session.uploadSessionId}`, 'DELETE'); localStorage.removeItem(SESSION_KEY); setSession(null); setLoaded(0); setFile(null); await refresh(); } catch (e) { setError((e as Error).message); } };
  const action = async (dataset: Dataset, remove = false) => { if (remove && !confirm(`«${dataset.originalFilename}» و فایل‌های وابسته حذف شوند؟`)) return; try { await api(`/datasets/${dataset.id}${remove ? '' : '/requeue'}`, remove ? 'DELETE' : 'POST'); if (remove && selected?.id === dataset.id) setSelected(null); await refresh(); } catch (e) { setError((e as Error).message); } };
  const progress = Math.min(100, Math.round(loaded / Number(session?.fileSize || file?.size || 1) * 100));
  return <main className="app"><section className="workspace"><aside className="sidebar" aria-label="فایل‌ها و آپلود">
    <header className="sidebar-header"><h1>فایل‌های LiDAR</h1><span className={connected ? 'live' : 'offline'}><i/>{connected ? 'متصل' : 'قطع ارتباط'}</span></header>
    {error && <div role="alert" className="error"><span>{error}</span><button aria-label="بستن پیام" onClick={() => setError('')}>×</button></div>}
    <div className={`dropzone ${busy ? 'uploading' : ''}`} onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); if (!busy) setFile(e.dataTransfer.files[0] ?? null); }}><input ref={input} type="file" accept=".las,.laz" disabled={busy} onChange={e => setFile(e.target.files?.[0] ?? null)}/><div className="upload-icon"><UploadCloud size={26}/></div><h2>{session ? 'ادامهٔ آپلود' : 'افزودن فایل'}</h2><p>{session ? `فایل «${session.originalFilename}» را دوباره انتخاب کنید.` : 'فایل را اینجا بکشید یا انتخاب کنید.'}</p><button className="primary" disabled={busy} onClick={() => input.current?.click()}>{file ? file.name : 'انتخاب فایل LAS / LAZ'}</button><span className="hint">LAS / LAZ · حداکثر ۱ گیگابایت</span>
    {(file || session) && <div className="upload-state"><div className="progress-info"><span>{busy ? 'در حال انتقال' : progress === 100 ? 'در حال نهایی‌سازی' : 'آمادهٔ ارسال'}</span><b>{progress}%</b></div><progress max={100} value={progress}/><small dir="ltr">{bytes(loaded)} / {bytes(Number(session?.fileSize || file?.size || 0))}</small><div className="upload-actions"><button disabled={!file || busy} onClick={start}><Play size={14}/> {session ? 'ادامهٔ آپلود' : 'شروع آپلود'}</button>{busy && <button onClick={() => controller.current?.abort()}><Pause size={14}/> توقف</button>}<button disabled={busy} onClick={cancel}>لغو</button></div></div>}</div>
    <div className="library-heading"><h2>فایل‌ها</h2><button title="تازه‌سازی" onClick={refresh}><RefreshCw size={15}/></button></div><input className="search" placeholder="جست‌وجوی نام فایل…" aria-label="جست‌وجوی دیتاست" value={search} onChange={e => { setSearch(e.target.value); setPage(1); }}/>
    <div className="dataset-list">{datasets.length === 0 && <div className="empty-list"><FileBox size={24}/><p>{connected ? search ? 'فایلی با این نام پیدا نشد.' : 'هنوز فایلی اضافه نشده.' : 'لیست فایل‌ها دریافت نشد. اتصال به سرور را بررسی کنید.'}</p></div>}{datasets.map(d => <article className={`dataset ${selected?.id === d.id ? 'selected' : ''}`} key={d.id}><button className="dataset-select" onClick={() => { setSelected(d); setPoints(0); }}><span className="file-icon"><Mountain size={18}/></span><span><strong dir="auto">{d.originalFilename}</strong><small>{bytes(Number(d.fileSize))} <span>·</span> {new Date(d.createdAt).toLocaleDateString('fa-IR')}</small></span>{d.status === 'READY' && <Check size={14} className="check"/>}</button><div className="dataset-bottom"><span className={`badge ${d.status.toLowerCase()}`}>{labels[d.status] || d.status}{d.status === 'PROCESSING' && processingProgress[d.id] !== undefined ? ` · ${processingProgress[d.id]}٪` : ''}</span><div>{d.status === 'FAILED' && <button title="پردازش مجدد" onClick={() => action(d)}><RefreshCw size={14}/></button>}<button title="حذف دیتاست" onClick={() => action(d, true)}><Trash2 size={14}/></button></div></div>{d.processingError && <small className="dataset-error">{d.processingError}</small>}</article>)}</div>{total > 12 && <div className="pagination"><button disabled={page === 1} onClick={() => setPage(p => p - 1)}>قبلی</button><span>{page} / {Math.ceil(total / 12)}</span><button disabled={page * 12 >= total} onClick={() => setPage(p => p + 1)}>بعدی</button></div>}
    <div className="sidebar-footer"><a href={`${import.meta.env.VITE_API_URL || '/api/v1'}/docs`} target="_blank" rel="noreferrer">راهنمای API <ArrowUpLeft size={13}/></a><a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer" lang="en" dir="ltr">© OpenStreetMap</a></div></aside><div className="map-panel"><div className="map-top"><span><i className="map-dot"/> نقشه</span><Suspense fallback={null}><ViewerStatus message={viewerMessage}/></Suspense><span className="point-count">{points.toLocaleString('fa-IR')} نقطه</span></div><Suspense fallback={<div className="map-loading">در حال آماده‌سازی نقشه…</div>}><Viewer dataset={selected} size={pointSize} visible={visible} colorMode={colorMode} quality={quality} onPoints={setPoints} onMessage={setViewerMessage}/></Suspense><div className="viewer-toolbar"><div><Crosshair size={16}/><strong>{selected?.originalFilename || 'فایلی انتخاب نشده'}</strong><span>{selected ? labels[selected.status] : 'برای نمایش، یک فایل انتخاب کنید'}</span></div><label>جزئیات <select aria-label="کیفیت نمایش" value={quality} onChange={e => setQuality(e.target.value as ViewerQuality)}>{Object.entries(QUALITY_LEVELS).map(([key,level]) => <option key={key} value={key}>{level.label} · {(level.budget / 1000000).toLocaleString('fa-IR')} میلیون</option>)}</select></label><label>رنگ <select aria-label="رنگ نقاط" value={colorMode} onChange={e => setColorMode(e.target.value as 'rgb' | 'elevation')}><option value="rgb">رنگ واقعی (RGB)</option><option value="elevation">ارتفاع</option></select></label><label>اندازهٔ نقاط <input type="range" min="1" max="6" step="0.5" value={pointSize} onChange={e => setPointSize(Number(e.target.value))}/></label><label className="visibility"><input type="checkbox" checked={visible} onChange={e => setVisible(e.target.checked)}/> نمایش لایه</label></div></div></section>
    </main>;
}
