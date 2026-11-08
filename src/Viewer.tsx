import { useEffect, useRef, useState } from 'react';
import maplibregl, { type CustomLayerInterface } from 'maplibre-gl';
import * as THREE from 'three';
import { Copc, Las, Bounds, type Hierarchy } from 'copc';
import proj4 from 'proj4';
import { Mountain } from 'lucide-react';
import { api, type Dataset } from './api';

export default function Viewer({ dataset, size, visible, onPoints }: { dataset: Dataset | null; size: number; visible: boolean; onPoints: (n: number) => void }) {
  const container = useRef<HTMLDivElement>(null), mapRef = useRef<maplibregl.Map | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null), materialRef = useRef<THREE.PointsMaterial | null>(null);
  const [error, setError] = useState(''), [message, setMessage] = useState('');
  useEffect(() => {
    let map: maplibregl.Map;
    try { map = new maplibregl.Map({ container: container.current!, center: [53.6, 32.5], zoom: 5, pitch: 50, maxPitch: 80, style: {
      version: 8, sources: { basemap: { type: 'raster', tiles: ['https://basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png'], tileSize: 256, attribution: '© OpenStreetMap contributors © CARTO' } }, layers: [{ id: 'base', type: 'raster', source: 'basemap', paint: { 'raster-saturation': -0.9, 'raster-opacity': 0.65 } }],
    } });
    } catch { setError('WebGL در این مرورگر در دسترس نیست. شتاب‌دهی سخت‌افزاری را فعال کنید یا مرورگر دیگری را امتحان کنید.'); return; }
    map.addControl(new maplibregl.NavigationControl(), 'top-left'); map.addControl(new maplibregl.ScaleControl(), 'bottom-left'); mapRef.current = map;
    return () => { map.remove(); mapRef.current = null; };
  }, []);
  useEffect(() => { if (materialRef.current) materialRef.current.size = size; mapRef.current?.triggerRepaint(); }, [size]);
  useEffect(() => { if (sceneRef.current) sceneRef.current.visible = visible; mapRef.current?.triggerRepaint(); }, [visible]);
  useEffect(() => {
    const map = mapRef.current; if (!map) return; if (dataset?.status !== 'READY') { setError(''); setMessage(''); return; }
    const abort = new AbortController(); let disposed = false, running = false;
    const scene = new THREE.Scene(), camera = new THREE.Camera(); sceneRef.current = scene;
    const material = new THREE.PointsMaterial({ size, vertexColors: true, sizeAttenuation: false }); materialRef.current = material; scene.visible = visible;
    let renderer: THREE.WebGLRenderer | undefined; const cache = new Map<string, THREE.Points>();
    const layer: CustomLayerInterface = { id: 'lidar-cloud', type: 'custom', renderingMode: '3d', onAdd: (_map, gl) => { renderer = new THREE.WebGLRenderer({ canvas: map.getCanvas(), context: gl as WebGL2RenderingContext }); renderer.autoClear = false; }, render: (_gl, options) => { if (!renderer) return; camera.projectionMatrix.fromArray(options.defaultProjectionData.mainMatrix); renderer.resetState(); renderer.render(scene, camera); }, onRemove: () => { cache.forEach(p => p.geometry.dispose()); material.dispose(); renderer?.dispose(); } };
    let update = () => {};
    const initialize = async () => {
      try {
        setError(''); setMessage('در حال خواندن ساختار COPC…'); onPoints(0);
        let url = '', expiry = 0;
        const getter = async (begin: number, end: number) => {
          if (end - begin > 32 * 1024 * 1024) throw new Error('گرهٔ فایل بیش از محدودیت حافظه است.');
          if (Date.now() > expiry) { const signed = await api<{ url: string; expiresIn: number }>(`/datasets/${dataset.id}/copc`); url = signed.url; expiry = Date.now() + (signed.expiresIn - 20) * 1000; }
          const response = await fetch(url, { headers: { Range: `bytes=${begin}-${end - 1}` }, signal: abort.signal });
          if (response.status !== 206) { await response.body?.cancel(); throw new Error('فضای ذخیره‌سازی باید درخواست Range را با وضعیت 206 پاسخ دهد.'); }
          const data = new Uint8Array(await response.arrayBuffer()); if (data.length !== end - begin) throw new Error('پاسخ Range ناقص است.'); return data;
        };
        const copc = await Copc.create(getter);
        if (!copc.wkt) throw new Error('سیستم مختصات فایل مشخص نیست.');
        const projection = proj4(copc.wkt, 'EPSG:4326');
        const geographic = (x: number, y: number) => { const [lng, lat] = projection.forward([x, y]); if (!Number.isFinite(lng) || !Number.isFinite(lat) || Math.abs(lng) > 180 || Math.abs(lat) > 85) throw new Error('مختصات فایل برای نقشه معتبر نیست.'); return { lng, lat }; };
        const cube = copc.info.cube;
        const origin = maplibregl.MercatorCoordinate.fromLngLat(geographic((cube[0] + cube[3]) / 2, (cube[1] + cube[4]) / 2), cube[2]);
        const transform = new THREE.Matrix4().makeTranslation(origin.x, origin.y, origin.z);
        layer.render = (_gl, options) => { if (!renderer) return; camera.projectionMatrix.fromArray(options.defaultProjectionData.mainMatrix).multiply(transform); renderer.resetState(); renderer.render(scene, camera); };
        const bounds = new maplibregl.LngLatBounds();
        for (const x of [cube[0], cube[3]]) for (const y of [cube[1], cube[4]]) bounds.extend(geographic(x, y));
        if (disposed) return;
        if (!map.isStyleLoaded()) await new Promise<void>(resolve => map.once('load', () => resolve()));
        if (disposed) return;
        map.addLayer(layer); map.fitBounds(bounds, { padding: 100, maxZoom: 20, duration: 1200 });
        const hierarchy = await Copc.loadHierarchyPage(getter, copc.info.rootHierarchyPage);
        const nodes: Hierarchy.Node.Map = { ...hierarchy.nodes }, pages = { ...hierarchy.pages };
        const lazPerf = await Las.PointData.createLazPerf({ locateFile: (name: string) => `${import.meta.env.BASE_URL}${name}` });
        const nodeBounds = (key: string) => Bounds.stepTo(cube, key.split('-').map(Number) as [number, number, number, number]);
        const priority = (key: string) => {
          const b = nodeBounds(key);
          const corners = [map.project(geographic(b[0], b[1])), map.project(geographic(b[3], b[1])), map.project(geographic(b[0], b[4])), map.project(geographic(b[3], b[4]))];
          const minX = Math.min(...corners.map(p => p.x)), maxX = Math.max(...corners.map(p => p.x));
          const minY = Math.min(...corners.map(p => p.y)), maxY = Math.max(...corners.map(p => p.y));
          if (maxX < -100 || maxY < -100 || minX > map.getCanvas().clientWidth + 100 || minY > map.getCanvas().clientHeight + 100) return 0;
          return Math.hypot(maxX - minX, maxY - minY) / 2;
        };
        update = async () => {
          if (running || disposed) return; running = true;
          try {
            for (const [key, page] of Object.entries(pages).slice(0, 24)) {
              if (page && priority(key) > 40 && Number(key.split('-')[0]) < 12) { const tree = await Copc.loadHierarchyPage(getter, page); delete pages[key]; Object.assign(nodes, tree.nodes); Object.assign(pages, tree.pages); }
            }
            const candidates = Object.entries(nodes).filter(([key, node]) => node && node.pointCount > 0 && priority(key) > 8).sort((a, b) => Number(a[0].split('-')[0]) - Number(b[0].split('-')[0]) || priority(b[0]) - priority(a[0]));
            let count = 0; const wanted = new Set<string>();
            for (const [key, node] of candidates) { if (count + node!.pointCount > 500000 || node!.pointCount * copc.header.pointDataRecordLength > 32 * 1024 * 1024) continue; wanted.add(key); count += node!.pointCount; }
            for (const [key, object] of cache) if (!wanted.has(key)) { scene.remove(object); object.geometry.dispose(); cache.delete(key); }
            for (const [key, node] of candidates) {
              if (disposed || !wanted.has(key) || cache.has(key)) continue;
              const view = await Copc.loadPointDataView(getter, copc, node!, { lazPerf, include: ['X', 'Y', 'Z'] });
              if (disposed) return;
              const positions = new Float32Array(view.pointCount * 3), colors = new Float32Array(view.pointCount * 3);
              const x = view.getter('X'), y = view.getter('Y'), z = view.getter('Z');
              for (let i = 0; i < view.pointCount; i++) { const altitude = z(i), p = maplibregl.MercatorCoordinate.fromLngLat(geographic(x(i), y(i)), altitude); positions.set([p.x - origin.x, p.y - origin.y, p.z - origin.z], i * 3); const t = Math.max(0, Math.min(1, (altitude - cube[2]) / (cube[5] - cube[2] || 1))); const c = new THREE.Color().setHSL(0.55 - t * 0.5, 0.8, 0.55); colors.set([c.r, c.g, c.b], i * 3); }
              const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3)); geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3)); const object = new THREE.Points(geometry, material); object.frustumCulled = false; cache.set(key, object); scene.add(object); map.triggerRepaint(); onPoints([...cache.values()].reduce((n, p) => n + p.geometry.attributes.position.count, 0));
              await new Promise(resolve => setTimeout(resolve, 0));
            }
            setMessage(cache.size ? '' : 'برای دریافت نقاط، روی محدودهٔ فایل بزرگ‌نمایی کنید.');
          } catch (e) { if (!disposed) setError((e as Error).message); } finally { running = false; }
        };
        map.on('moveend', update); await update();
      } catch (e) { if (!disposed) setError((e as Error).message); }
    };
    void initialize();
    return () => { disposed = true; abort.abort(); map.off('moveend', update); if (map.getLayer(layer.id)) map.removeLayer(layer.id); else { material.dispose(); renderer?.dispose(); } sceneRef.current = null; materialRef.current = null; };
  }, [dataset?.id, dataset?.status]);
  return <><div ref={container} className="map-canvas"/>{!error && (!dataset || dataset.status !== 'READY') && <div className="map-message"><Mountain size={40}/><h2>{dataset ? 'ابرنقاط در حال آماده‌سازی است' : 'دنیای داده‌ها را از بالا ببینید'}</h2><p>{dataset ? 'پس از پایان پردازش و ساخت COPC، نمایش سه‌بعدی خودکار آغاز می‌شود.' : 'فایل LAS یا LAZ را بارگذاری کنید؛ محدوده و نقاط آن را روی نقشه بررسی کنید.'}</p></div>}{(error || (dataset?.status === 'READY' && message)) && <div role={error ? 'alert' : 'status'} className={`map-message ${error ? 'viewer-error' : ''}`}><p>{error || message}</p></div>}</>;
}
