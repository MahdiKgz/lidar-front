/** LAS RGB is sRGB; Three.js vertex attributes are linear RGB. */
export function linearRgb(value: number, maximum = 65535): number {
  const srgb = Math.max(0, Math.min(1, value / maximum));
  return srgb <= 0.04045 ? srgb / 12.92 : ((srgb + 0.055) / 1.055) ** 2.4;
}
