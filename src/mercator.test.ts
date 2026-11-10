import { describe, expect, it } from 'vitest';
import { MercatorCoordinate } from 'maplibre-gl';
import { mercatorPosition } from './mercator';
describe('worker point positioning', () => {
  it.each([[51.423,35.819,2050],[59.26345,33.99974,1450],[0,0,0]])('matches MapLibre for %s %s at %s metres', (lng,lat,altitude) => {
    const reference = MercatorCoordinate.fromLngLat({lng,lat},altitude);
    const actual = mercatorPosition(lng,lat,altitude);
    expect(actual[0]).toBeCloseTo(reference.x,12); expect(actual[1]).toBeCloseTo(reference.y,12); expect(actual[2]).toBeCloseTo(reference.z,12);
  });
});
