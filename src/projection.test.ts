import { describe, it, expect } from 'vitest';
import { horizontalWkt, mapProjection, viewerError } from './projection';
const geographic = 'GEOGCS["WGS 84",DATUM["WGS_1984",SPHEROID["WGS 84",6378137,298.257223563]],PRIMEM["Greenwich",0],UNIT["degree",0.0174532925199433]]';
const projected = `PROJCS["WGS 84 / UTM zone 40N",${geographic},PROJECTION["Transverse_Mercator"],PARAMETER["latitude_of_origin",0],PARAMETER["central_meridian",57],PARAMETER["scale_factor",0.9996],PARAMETER["false_easting",500000],PARAMETER["false_northing",0],UNIT["metre",1]]`;
describe('compound LiDAR CRS', () => {
  it('extracts the horizontal projected CRS before passing it to proj4', () => {
    const compound = `COMPD_CS["UTM + unknown",${projected},VERT_CS["",VERT_DATUM["unknown",2005],UNIT["metre",1]]]`;
    expect(horizontalWkt(compound)).toBe(projected);
    const [lng, lat] = mapProjection(compound).forward([700000,3770000]);
    expect(lng).toBeCloseTo(59.16684,4); expect(lat).toBeCloseTo(34.05164,4);
  });
  it('preserves an ordinary CRS and reports thrown strings', () => {
    expect(horizontalWkt(projected)).toBe(projected);
    expect(viewerError('projection failed')).toBe('projection failed');
  });
});
