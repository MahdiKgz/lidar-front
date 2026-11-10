import { useEffect, useRef, useState } from 'react';
import maplibregl, { type CustomLayerInterface } from 'maplibre-gl';
import * as THREE from 'three';
import { Copc, Bounds, type Hierarchy } from 'copc';
import { selectLod, QUALITY_LEVELS, type ViewerQuality } from './lod';
import { mercatorPosition } from './mercator';
import { mapProjection, viewerError } from './projection';
import { displayElevation } from './display-elevation';
import { api, type Dataset } from './api';

export default function Viewer({ dataset, size, visible, colorMode, quality, onPoints, onMessage }: { dataset: Dataset | null; size: number; visible: boolean; colorMode: 'rgb' | 'elevation'; quality: ViewerQuality; onPoints: (n: number) => void; onMessage: (msg: string) => void }) {
  const qualityRef = useRef(quality); qualityRef.current = quality;
  const updateRef = useRef<() => void>(() => {});
  useEffect(() => { updateRef.current(); }, [quality]);
  const modeRef = useRef(colorMode); modeRef.current = colorMode;
  const container = useRef<HTMLDivElement>(null), mapRef = useRef<maplibregl.Map | null>(null);
  const styleReady = useRef<Promise<void> | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null), materialRef = useRef<THREE.PointsMaterial | null>(null);
  const [error, setError] = useState('');
  useEffect(() => { onMessage(''); }, [dataset?.id, onMessage]);
  useEffect(() => {
    let map: maplibregl.Map;
    try { map = new maplibregl.Map({ container: container.current!, attributionControl: false, center: [53.6, 32.5], zoom: 5, pitch: 50, maxPitch: 80, style: {
      version: 8, sources: { basemap: { type: 'raster', tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'], tileSize: 256, attribution: '© OpenStreetMap contributors' } }, layers: [{ id: 'base', type: 'raster', source: 'basemap', paint: { 'raster-saturation': -0.9, 'raster-opacity': 0.65 } }],
    } });
    } catch { setError('نقشه در این مرورگر اجرا نشد. شتاب‌دهی سخت‌افزاری را فعال کنید یا با مرورگر دیگری باز کنید.'); return; }
    styleReady.current = new Promise<void>(resolve => { map.once('style.load', () => resolve()); });
    map.addControl(new maplibregl.NavigationControl(), 'top-left'); mapRef.current = map;
    return () => { map.remove(); mapRef.current = null; };
  }, []);
  useEffect(() => { if (materialRef.current) materialRef.current.size = size; mapRef.current?.triggerRepaint(); }, [size]);
  useEffect(() => { if (sceneRef.current) sceneRef.current.visible = visible; mapRef.current?.triggerRepaint(); }, [visible]);
  useEffect(() => {
    sceneRef.current?.traverse(object => {
      if (object instanceof THREE.Points) {
        const attribute = object.geometry.userData[colorMode === 'rgb' ? 'rgb' : 'elevation'];
        if (attribute) object.geometry.setAttribute('color', attribute);
      }
    });
    mapRef.current?.triggerRepaint();
  }, [colorMode]);
  useEffect(() => {
    const map = mapRef.current; if (!map) return; if (dataset?.status !== 'READY') { setError(''); onMessage(''); return; }
    const abort = new AbortController(); let disposed = false, running = false, pendingUpdate = false;
    const scene = new THREE.Scene(), camera = new THREE.Camera(); sceneRef.current = scene;
    const material = new THREE.PointsMaterial({ size, vertexColors: true, sizeAttenuation: false }); materialRef.current = material; scene.visible = visible;
    let screenMatrix: THREE.Matrix4 | undefined;
    let renderer: THREE.WebGLRenderer | undefined; const cache = new Map<string, THREE.Points>();
    const layer: CustomLayerInterface = { id: 'lidar-cloud', type: 'custom', renderingMode: '3d', onAdd: (_map, gl) => { renderer = new THREE.WebGLRenderer({ canvas: map.getCanvas(), context: gl as WebGL2RenderingContext }); renderer.autoClear = false; }, render: (_gl, options) => { if (!renderer) return; camera.projectionMatrix.fromArray(options.defaultProjectionData.mainMatrix); renderer.resetState(); renderer.render(scene, camera); }, onRemove: () => { cache.forEach(p => p.geometry.dispose()); material.dispose(); renderer?.dispose(); } };
    const worker = new Worker(new URL('./point-worker.ts', import.meta.url), { type: 'module' });
    let rejectDecode: ((reason: Error) => void) | undefined;
    const decode = (payload: object, buffer: ArrayBuffer) => new Promise<{ positions: Float32Array; colors: Float32Array; rgbColors: Float32Array; hasRgb: boolean }>((resolve, reject) => {
      rejectDecode = reject;
      worker.onmessage = ({ data }) => { rejectDecode = undefined; data.error ? reject(new Error(data.error)) : resolve(data); };
      worker.onerror = () => { rejectDecode = undefined; reject(new Error('رمزگشایی نقاط در Worker ناموفق بود.')); };
      worker.postMessage(payload, [buffer]);
    });
    let update = () => {};
    const initialize = async () => {
      try {
        setError(''); onMessage('در حال خواندن ساختار COPC…'); onPoints(0);
        let url = '', expiry = 0;
        const getter = async (begin: number, end: number) => {
          if (end - begin > 32 * 1024 * 1024) throw new Error('گرهٔ فایل بیش از محدودیت حافظه است.');
          if (Date.now() > expiry) { const signed = await api<{ url: string; expiresIn: number }>(`/datasets/${dataset.id}/copc`); url = signed.url; expiry = Date.now() + (signed.expiresIn - 20) * 1000; }
          const response = await fetch(url, { headers: { Range: `bytes=${begin}-${end - 1}` }, signal: AbortSignal.any([abort.signal, AbortSignal.timeout(20000)]) });
          if (response.status !== 206) { await response.body?.cancel(); throw new Error('فضای ذخیره‌سازی باید درخواست Range را با وضعیت 206 پاسخ دهد.'); }
          const data = new Uint8Array(await response.arrayBuffer()); if (data.length !== end - begin) throw new Error('پاسخ Range ناقص است.'); return data;
        };
        const copc = await Copc.create(getter);
        if (!copc.wkt) throw new Error('سیستم مختصات فایل مشخص نیست.');
        const projection = mapProjection(copc.wkt);
        const geographic = (x: number, y: number) => { const [lng, lat] = projection.forward([x, y]); if (!Number.isFinite(lng) || !Number.isFinite(lat) || Math.abs(lng) > 180 || Math.abs(lat) > 85) throw new Error('مختصات فایل برای نقشه معتبر نیست.'); return { lng, lat }; };
        const cube = copc.info.cube;
        const dataBounds = [...copc.header.min, ...copc.header.max];
        const centerElevation = displayElevation((copc.header.min[2] + copc.header.max[2]) / 2, copc.header.min[2]);
        const origin = maplibregl.MercatorCoordinate.fromLngLat(geographic((cube[0] + cube[3]) / 2, (cube[1] + cube[4]) / 2), 0);
        const transform = new THREE.Matrix4().makeTranslation(origin.x, origin.y, origin.z);
        layer.render = (_gl, options) => { if (!renderer) return; camera.projectionMatrix.fromArray(options.defaultProjectionData.mainMatrix).multiply(transform); screenMatrix = camera.projectionMatrix.clone(); renderer.resetState(); renderer.render(scene, camera); };
        const bounds = new maplibregl.LngLatBounds();
        for (const x of [dataBounds[0], dataBounds[3]]) for (const y of [dataBounds[1], dataBounds[4]]) bounds.extend(geographic(x, y));
        if (disposed) return;
        onMessage('در حال آماده‌سازی لایهٔ نقشه…');
        let timer: ReturnType<typeof setTimeout> | undefined;
        try { await Promise.race([styleReady.current, new Promise<never>((_resolve, reject) => { timer = setTimeout(() => reject(new Error('نقشه بارگذاری نشد. اتصال اینترنت را بررسی کنید و دوباره امتحان کنید.')), 20000); })]); }
        finally { if (timer) clearTimeout(timer); }
        if (disposed) return;
        map.addLayer(layer);
        map.setCenterClampedToGround(false);
        map.setCenterElevation(centerElevation);
        map.fitBounds(bounds, { padding: 100, maxZoom: 18, duration: 0 });
        map.setCenterElevation(centerElevation);
        onMessage('در حال خواندن سلسله‌مراتب نقاط…');
        const hierarchy = await Copc.loadHierarchyPage(getter, copc.info.rootHierarchyPage);
        const nodes: Hierarchy.Node.Map = { ...hierarchy.nodes }, pages = { ...hierarchy.pages };
        onMessage('در حال دریافت نقاط…');
        const nodeBounds = (key: string) => Bounds.stepTo(cube, key.split('-').map(Number) as [number, number, number, number]);
        const spacingRatio = copc.info.spacing / (cube[3] - cube[0]);
        const priority = (key: string) => {
          if (key === '0-0-0-0') return 1000000;
          if (!screenMatrix) return 0;
          const b = nodeBounds(key);
          // Only the portion overlapping actual point bounds can contain data.
          const lo = [Math.max(b[0], dataBounds[0]), Math.max(b[1], dataBounds[1]), Math.max(b[2], dataBounds[2])];
          const hi = [Math.min(b[3], dataBounds[3]), Math.min(b[4], dataBounds[4]), Math.min(b[5], dataBounds[5])];
          if (lo.some((v,i) => v > hi[i])) return 0;
          const corners: THREE.Vector4[] = [];
          for (const x of [lo[0],hi[0]]) for (const y of [lo[1],hi[1]]) for (const z of [lo[2],hi[2]]) {
            const location = geographic(x,y);
            const p = mercatorPosition(location.lng, location.lat, displayElevation(z, copc.header.min[2]));
            corners.push(new THREE.Vector4(p[0]-origin.x,p[1]-origin.y,p[2]-origin.z,1).applyMatrix4(screenMatrix));
          }
          const front = corners.filter(p => p.w > 0);
          if (!front.length) return 0;
          // Near-plane intersections remain eligible instead of disappearing at close zoom.
          if (front.length !== corners.length) return 2000;
          const xs = front.map(p => p.x/p.w), ys = front.map(p => p.y/p.w);
          const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
          if (maxX < -1.15 || minX > 1.15 || maxY < -1.15 || minY > 1.15) return 0;
          return Math.max((maxX-minX)*map.getCanvas().clientWidth/2, (maxY-minY)*map.getCanvas().clientHeight/2);
        };
        update = async () => {
          if (disposed) return; if (running) { pendingUpdate = true; return; } running = true;
          try {
            // Expand the most relevant hierarchy pages first, not the first entries in the file.
            const settings = QUALITY_LEVELS[qualityRef.current];
            onMessage('در حال تکمیل جزئیات…');
            let expanded = 0;
            while (expanded < 8 && !disposed) {
              const next = Object.entries(pages).filter(([key,page]) => page && priority(key)*spacingRatio >= settings.spacing)
                .sort((a,b) => priority(b[0])-priority(a[0]))[0];
              if (!next) break;
              const tree = await Copc.loadHierarchyPage(getter, next[1]!);
              delete pages[next[0]]; Object.assign(nodes,tree.nodes); Object.assign(pages,tree.pages); expanded++;
            }
            if (expanded === 8) pendingUpdate = true;
            const scores = new Map<string, number>();
            for (const key of Object.keys(nodes)) scores.set(key, priority(key));
            const selectedKeys = selectLod(Object.entries(nodes).flatMap(([key,node]) => node ? [{ key, points: node.pointCount, pixels: scores.get(key)!, bytes: node.pointCount*copc.header.pointDataRecordLength }] : []), spacingRatio, settings.budget, settings.spacing);
            const wanted = new Set(selectedKeys);
            const candidates = selectedKeys.map(key => [key,nodes[key]!] as const);
            for (const [key, object] of cache) if (!wanted.has(key)) { scene.remove(object); object.geometry.dispose(); cache.delete(key); }
            for (const [key, node] of candidates) {
              if (disposed) return; if (pendingUpdate && expanded < 8) break; if (!wanted.has(key) || cache.has(key)) continue;
              const compressed = await Copc.loadCompressedPointDataBuffer(getter, node!);
              if (disposed) return;
              const { positions, colors, rgbColors } = await decode({ compressed: compressed.buffer, copc, node, origin: { x: origin.x, y: origin.y, z: origin.z }, assetBase: new URL(import.meta.env.BASE_URL, location.origin).href }, compressed.buffer as ArrayBuffer);
              if (disposed) return;
              const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3)); geometry.userData.elevation = new THREE.BufferAttribute(colors, 3); geometry.userData.rgb = new THREE.BufferAttribute(rgbColors, 3); geometry.setAttribute('rgbColor', geometry.userData.rgb); geometry.setAttribute('elevationColor', geometry.userData.elevation); geometry.setAttribute('color', modeRef.current === 'rgb' ? geometry.userData.rgb : geometry.userData.elevation); const object = new THREE.Points(geometry, material); object.frustumCulled = false; cache.set(key, object); scene.add(object); map.triggerRepaint(); onPoints([...cache.values()].reduce((n, p) => n + p.geometry.attributes.position.count, 0));
              await new Promise(resolve => setTimeout(resolve, 0));
            }
            onPoints([...cache.values()].reduce((n, p) => n + p.geometry.attributes.position.count, 0));
            map.triggerRepaint();
            onMessage(cache.size ? '' : 'در این محدوده نقطه‌ای دیده نمی‌شود. کمی بزرگ‌نمایی کنید.');
          } catch (e) { if (!disposed) setError(viewerError(e)); } finally { running = false; if (pendingUpdate && !disposed) { pendingUpdate = false; queueMicrotask(update); } }
        };
        updateRef.current = () => { void update(); };
        map.on('moveend', update); await update();
      } catch (e) { if (!disposed) setError(viewerError(e)); }
    };
    void initialize();
    return () => { updateRef.current = () => {}; disposed = true; worker.terminate(); rejectDecode?.(new Error('Viewer disposed')); abort.abort(); map.off('moveend', update); if (map.getLayer(layer.id)) map.removeLayer(layer.id); else { material.dispose(); renderer?.dispose(); } sceneRef.current = null; materialRef.current = null; };
  }, [dataset?.id, dataset?.status]);
  return <><div ref={container} className="map-canvas"/>{error && <div role="alert" className="map-message viewer-error"><p>{error}</p></div>}</>;
}

export function ViewerStatus({ message }: { message: string }) {
  return message ? <span className="viewer-status">{message}</span> : null;
}
