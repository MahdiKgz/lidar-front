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

## Live status via SSE

The page opens one EventSource to `${VITE_API_URL}/datasets/events`. Five-second list polling and three-second selected-file polling are removed. Dataset updates and progress patch React state directly. New/deleted records and stream reconnect request a debounced REST snapshot (including selected status), rather than periodic requests. A query/page change and explicit actions still fetch REST as needed. Native EventSource reconnect handles interrupted connections; unmount closes the connection. Binary upload progress continues to use XHR byte counts. Processing percentages are stage milestones, not estimated conversion completion time.

## Natural RGB color

The viewer defaults to the LAS RGB dimensions when present and nonzero. A color selector switches between natural RGB and elevation using resident buffer attributes, without re-fetching or decoding nodes. RGB is normalized from LAS 16-bit values (with a node-level 8-bit fallback) and converted from sRGB to linear RGB for Three.js. Missing/all-zero RGB falls back to the elevation gradient. Decoding and coloring remain in the Web Worker. This supersedes the earlier elevation-only description.

Autzen source and processed COPC both have Red/Green/Blue dimensions (format 7); an actual processed root-node RGB sample was [41216,41728,39936]. No separate image/orthophoto is fetched or inferred. Visual appearance depends on resident point density and point size; this feature does not imply that screenshot-quality rendering has been verified in the WebGL-disabled in-app browser.

## Zoom-dependent COPC detail

LOD selection now uses projected 3D node bounds (including the display elevation offset) and a target projected point spacing of 1.5 pixels. Closer zoom makes deeper nodes eligible; root/ancestor chunks remain additive. Relevant hierarchy pages are expanded in priority order, with up to eight pages per pass and continuation when more are needed. View changes during loading schedule another selection pass. Offscreen nodes are evicted; resident points are capped at 750,000 and individual decoded nodes at 32 MiB. This supersedes the earlier fixed 200,000-point and ground-only viewport selection. Point count is not guaranteed to increase monotonically: a close view may cover a smaller area, while local point density increases. The cap can still limit extreme close-range detail. Automated tests verify progressive detail eligibility and bounded memory; visual zoom behavior must be checked in a WebGL2-capable browser.

## Detail presets

The map toolbar now offers balanced (750k points / 1.5 pixel target spacing), high (2m / 0.75px), and ultra (4m / 0.35px). Ultra is the default requested detail level. Changing presets reselects nodes using the existing cache/worker and continues hierarchy refinement; it does not recreate the map or reload all resident nodes. The 32 MiB single-node decoded limit remains. Higher presets use more GPU/CPU memory and network, and do not increase source measurement accuracy.

Selection benchmark with actual Autzen root hierarchy and an assumed 1600-pixel full-scene projected extent (not a real browser FPS/visibility measurement): balanced selected 23 nodes / 746,756 points / maximum depth 3; high 63 nodes / 1,999,536 points / depth 4; ultra 120 nodes / 3,999,561 points / depth 5. Build and 16 frontend tests passed. Actual camera footprint and available source density determine final visible counts.

## Zero-clearance model anchor

All models now use `displayZ = originalZ - header.minZ` with zero clearance above the flat basemap. The previous two-metre clearance is removed. The worker geometry, camera target and LOD bounds share this transform. Every dataset's minimum elevation is at map Z=0; height differences, sloped terrain and building heights remain intact. This anchors the model base and does not flatten all points onto a plane or register an uneven ground surface against a DEM. Original files and metadata are unchanged.
