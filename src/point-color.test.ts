import { expect, it } from 'vitest';
import { linearRgb } from './point-color';
it('normalizes LAS RGB without washing out the natural colors', () => {
  expect(linearRgb(0)).toBe(0); expect(linearRgb(65535)).toBe(1);
  expect(linearRgb(32768)).toBeCloseTo(0.214,3);
  expect(linearRgb(128,255)).toBeCloseTo(0.216,3);
});
