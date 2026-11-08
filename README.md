# LiDAR Atlas frontend

React + TypeScript + Vite frontend for the sibling lidar-back API. Persian RTL interface with real multipart upload progress, pause/resume, dataset polling, retry/delete and a MapLibre COPC viewer.

```bash
pnpm install --frozen-lockfile
pnpm dev
pnpm build
pnpm test
```

The default development port is 5173. If occupied: `pnpm dev --port 5174`. Add the actual frontend origin to the backend CORS and MinIO allowed origins. Vite proxies `/api` to `http://localhost:3000`; set `VITE_API_URL` for another backend. Production hosting must proxy `/api` or supply that variable at build time.

Uploads go directly to MinIO in three parallel 16 MiB parts, with two retries per failed part. Progress sums actual XHR byte progress, including resumed valid parts. Only session IDs and filename/size/modification-time fingerprint are persisted; signed URLs and credentials are never saved. After refresh, reselect the same file to resume. Backend expiry errors require cancelling the old session and starting a new upload. Pause aborts in-flight PUTs; MinIO parts are authoritative on resume.

Viewer choice: `copc` 0.0.8 (copc.js), laz-perf WASM, Three.js and a MapLibre custom 3D layer. COPC hierarchy and point chunks are read through validated HTTP 206 Range requests; requests returning full files are refused. Signed URLs are renewed before expiry. WKT is transformed with proj4 to WGS84, then Mercator; unknown/unsupported CRS fails explicitly. The viewer selects nodes by screen extent after map movements, loads coarse depths first, caps resident points at 500,000 and node decompression at 32 MiB, and disposes evicted geometry. It supports point size, visibility, camera fit and elevation coloring. `public/laz-perf.wasm` comes from laz-perf 0.0.7 (Apache-2.0); copc is MIT.

Map tiles use CARTO dark raster tiles with OSM attribution. WebGL2 and network access to the tile service are required. If WebGL initialization fails the rest of the app remains usable. Font uses Google Fonts with a local fallback.

Limits: decoding currently runs on the main thread with yields between nodes, so large nodes can cause short pauses. This is a bounded point viewer, not a full scientific rendering engine. No real backend-to-COPC browser acceptance test has been completed because the backend's real PDAL conversion is still unverified. Browser QA in this environment found WebGL unavailable and verified the fallback instead. Backend API access must be available to exercise live upload. No mock clouds or fake upload percentages are presented as real data.
