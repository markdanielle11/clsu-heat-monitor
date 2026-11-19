/**
 * The ONLY monitored location. It is intentionally a compile-time constant and
 * not configurable through env vars, the API, or the app.
 *
 * Coordinates: 15°43'58"N 120°55'52"E (CLSU campus, as listed on the
 * Wikipedia infobox for Central Luzon State University), rounded to 4 decimals
 * (about 11 m).
 */
export const CLSU = Object.freeze({
  name: 'Central Luzon State University (CLSU)',
  shortName: 'CLSU, Muñoz',
  city: 'Science City of Muñoz, Nueva Ecija, Philippines',
  latitude: 15.7328,
  longitude: 120.9311,
  timezone: 'Asia/Manila',
  /** Manila has no DST; this fixed offset is always correct. */
  utcOffset: '+08:00',
});

export type Clsu = typeof CLSU;
