/**
 * Geo helpers (framework-free). Used for the photo geofence check (is a photo's
 * EXIF GPS near the complaint's reported location?) and the map view.
 */

const R = 6_371_000; // Earth radius in metres

/** Great-circle distance between two lat/lon points, in metres. */
export function haversineMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}

export type GeoFlag = "ok" | "far" | "no_gps" | "no_reference";

/**
 * Classify a photo's EXIF GPS against a reference (complaint) location.
 * Returns the flag + distance (metres) when both points are known.
 */
export function geofencePhoto(
  photoLat: number | null,
  photoLon: number | null,
  refLat: number | null | undefined,
  refLon: number | null | undefined,
  maxMeters: number,
): { flag: GeoFlag; distanceM: number | null } {
  if (photoLat == null || photoLon == null) return { flag: "no_gps", distanceM: null };
  if (refLat == null || refLon == null) return { flag: "no_reference", distanceM: null };
  const d = haversineMeters(photoLat, photoLon, refLat, refLon);
  return { flag: d > maxMeters ? "far" : "ok", distanceM: d };
}
