import { describe, expect, it } from 'vitest';
import { displayElevation } from './display-elevation';
describe('relative display elevation', () => {
  it('places Tehran ground near the flat basemap and keeps building height', () => {
    expect(displayElevation(1510,1510)).toBe(2);
    expect(displayElevation(1530,1510)).toBe(22);
    expect(displayElevation(1530,1510)-displayElevation(1510,1510)).toBe(20);
  });
  it('retains relief including below-sea-level inputs', () => {
    expect(displayElevation(2319.923,1752.343)).toBeCloseTo(569.58);
    expect(displayElevation(-30,-40)).toBe(12);
  });
});
