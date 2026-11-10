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

## Real deb_23/deb_40 CRS fix (2026-11-10)

Both COPCs carry compound WKT with an unknown vertical datum. proj4 throws a string when given this compound CRS directly; earlier error handling assumed an Error object, leaving no visible error while the initial progress message persisted. `src/projection.ts` now extracts the horizontal WKT component with balanced brackets and normalizes unknown errors. It does not infer or transform a vertical datum.

Verified using actual server COPCs through HTTP 206 and the same patched projection helper:

- deb_23: 118,646,120 total points; root node decoded 7,175 points; first coordinate 59.263454 E, 33.999742 N.
- deb_40: 90,093,735 total points; root node decoded 5,209 points; first coordinate 59.731729 E, 34.038001 N.

Both datasets are READY. Header, CRS projection, hierarchy and actual LAZ decoding succeeded with four Range requests per root-node test. Browser rendering remains unverified in the in-app environment without WebGL. Both files' embedded UTM 40N coordinates place them around 59 E / 34 N, not Tehran; the viewer follows the embedded CRS.

## Elevated cloud camera correction (2026-11-10)

The initial map camera was clamped to ground/zero while cloud points kept absolute elevations. For Tehran foothills the file spans 1752.343–2319.923 m; the camera now unclamps its center from ground and targets 2036.133 m. Initial bounds use LAS header min/max instead of the padded COPC hierarchy cube. Elevation coloring also uses actual min/max. Root-node data is always eligible for initial display, and a map update arriving during an existing load is scheduled again afterwards. File coordinates and heights remain unchanged.

Checked the actual uploaded tehran-foothills dataset through four HTTP Range requests: root decoded 30,936 points and horizontal coordinates project to Tehran. Build and unit checks do not prove the final WebGL image; that must be checked in a browser supporting WebGL2.

## Rendering responsiveness (2026-11-10)

Removed the centered introductory map overlay ("دنیای داده‌ها را از بالا ببینید"); the floating layer controls remain in their original position. LAZ decoding, WKT projection, Mercator conversion and color generation now run in a dedicated module Web Worker. Typed positions/colors are transferred back without cloning. The worker is terminated on dataset switch. Point selection computes scores once per update; the resident point budget is reduced from 500,000 to 200,000. Per-point Color allocations were removed. Worker Mercator coordinates are tested against MapLibre at Tehran and the deb datasets' coordinates. Browser FPS improvement has not been measured in the WebGL-disabled in-app browser.

## Ground-relative display (2026-11-10)

At the user's request, the flat-basemap viewer now subtracts the COPC header minimum Z from point display elevations, then adds 2 metres clearance. Camera center elevation uses the same display transform and the Mercator origin has zero elevation. Original point heights, downloads, COPC and metadata remain untouched; elevation colors still use original heights. This supersedes the absolute-height camera-only approach above. The constant offset preserves all height differences and terrain slope; high ridges remain higher than low terrain. This is visual alignment with a flat map, not DEM/vertical-datum registration.
