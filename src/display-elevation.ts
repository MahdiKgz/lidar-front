/** Display-only offset for a flat basemap. Never write this back into LAS/COPC. */
export const GROUND_CLEARANCE_METERS = 0;
export function displayElevation(altitude: number, minimumAltitude: number): number {
  return altitude - minimumAltitude + GROUND_CLEARANCE_METERS;
}
