/// <reference lib="webworker" />
import { displayElevation } from './display-elevation';
import { Copc, Las } from 'copc';
import { mercatorPosition } from './mercator';
import { mapProjection, viewerError } from './projection';
let runtime: ReturnType<typeof Las.PointData.createLazPerf> | undefined;
self.onmessage = async ({ data }) => {
  try {
    runtime ??= Las.PointData.createLazPerf({ locateFile: (name: string) => new URL(name, data.assetBase).href });
    const lazPerf = await runtime;
    const view = await Copc.loadPointDataView(async () => new Uint8Array(data.compressed), data.copc, data.node, { lazPerf, include: ['X', 'Y', 'Z'] });
    const projection = mapProjection(data.copc.wkt);
    const x = view.getter('X'), y = view.getter('Y'), z = view.getter('Z');
    const positions = new Float32Array(view.pointCount * 3), colors = new Float32Array(view.pointCount * 3);
    const [minZ, maxZ] = [data.copc.header.min[2], data.copc.header.max[2]];
    for (let i = 0; i < view.pointCount; i++) {
      const [lng, lat] = projection.forward([x(i), y(i)]);
      if (!Number.isFinite(lng) || !Number.isFinite(lat) || Math.abs(lat) > 85) throw new Error('Invalid projected coordinates.');
      const altitude = z(i);
      const [px, py, pz] = mercatorPosition(lng, lat, displayElevation(altitude, minZ));
      positions[i * 3] = px - data.origin.x; positions[i * 3 + 1] = py - data.origin.y; positions[i * 3 + 2] = pz - data.origin.z;
      const t = Math.max(0, Math.min(1, (altitude - minZ) / (maxZ - minZ || 1)));
      // Linear RGB gradient; avoid allocating a Color for every point.
      colors[i * 3] = 0.15 + 0.8 * t; colors[i * 3 + 1] = 0.65 + 0.25 * (1 - Math.abs(2 * t - 1)); colors[i * 3 + 2] = 0.95 - 0.85 * t;
    }
    self.postMessage({ positions, colors }, { transfer: [positions.buffer, colors.buffer] });
  } catch (error) { self.postMessage({ error: viewerError(error) }); }
};
