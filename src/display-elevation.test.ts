import { describe, expect, it } from 'vitest';
import { displayElevation } from './display-elevation';
describe('relative display elevation', () => {
  it('places Tehran ground exactly on the flat basemap and keeps building height', () => {
    expect(displayElevation(1510,1510)).toBe(0);
    expect(displayElevation(1530,1510)).toBe(20);
    expect(displayElevation(1530,1510)-displayElevation(1510,1510)).toBe(20);
  });
  it('retains relief including below-sea-level inputs', () => {
    expect(displayElevation(2319.923,1752.343)).toBeCloseTo(567.58);
    expect(displayElevation(-30,-40)).toBe(10);
  });
});

it.each([0, 1510, 2050, -40])('anchors minimum elevation %s at map zero', minimum => { expect(displayElevation(minimum, minimum)).toBe(0); });
