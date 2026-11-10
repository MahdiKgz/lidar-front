/** Same WGS84 sphere circumference used by MapLibre's MercatorCoordinate. */
export function mercatorPosition(lng: number, lat: number, altitude: number): [number, number, number] {
  const radians = lat * Math.PI / 180;
  return [(180 + lng) / 360,
    (180 - (180 / Math.PI * Math.log(Math.tan(Math.PI / 4 + radians / 2)))) / 360,
    altitude / (40030228.88407185 * Math.cos(radians))];
}
