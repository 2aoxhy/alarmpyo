import type { KmaGrid } from './environment-types';

const DEGREES_TO_RADIANS = Math.PI / 180;
const EARTH_RADIUS_KM = 6_371.00877;
const GRID_KM = 5;
const STANDARD_LATITUDE_ONE = 30 * DEGREES_TO_RADIANS;
const STANDARD_LATITUDE_TWO = 60 * DEGREES_TO_RADIANS;
const ORIGIN_LONGITUDE = 126 * DEGREES_TO_RADIANS;
const ORIGIN_LATITUDE = 38 * DEGREES_TO_RADIANS;
const ORIGIN_X = 43;
const ORIGIN_Y = 136;

export const KMA_GRID_BOUNDS = Object.freeze({
  minNx: 1,
  maxNx: 149,
  minNy: 1,
  maxNy: 253,
});

export const KMA_LOCATION_BOUNDS = Object.freeze({
  minLatitude: 31.651814,
  maxLatitude: 43.39349,
  minLongitude: 123.310165,
  maxLongitude: 132.774963,
});

const scaledRadius = EARTH_RADIUS_KM / GRID_KM;
const projectionExponent =
  Math.log(
    Math.cos(STANDARD_LATITUDE_ONE) /
      Math.cos(STANDARD_LATITUDE_TWO),
  ) /
  Math.log(
    Math.tan(Math.PI * 0.25 + STANDARD_LATITUDE_TWO * 0.5) /
      Math.tan(Math.PI * 0.25 + STANDARD_LATITUDE_ONE * 0.5),
  );
const projectionScale =
  (Math.pow(
    Math.tan(Math.PI * 0.25 + STANDARD_LATITUDE_ONE * 0.5),
    projectionExponent,
  ) *
    Math.cos(STANDARD_LATITUDE_ONE)) /
  projectionExponent;
const originRadius =
  scaledRadius *
  projectionScale *
  Math.pow(
    Math.tan(Math.PI * 0.25 + ORIGIN_LATITUDE * 0.5),
    -projectionExponent,
  );

export function isValidKmaGrid(value: unknown): value is KmaGrid {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const grid = value as Record<string, unknown>;
  return (
    Number.isInteger(grid.nx) &&
    Number(grid.nx) >= KMA_GRID_BOUNDS.minNx &&
    Number(grid.nx) <= KMA_GRID_BOUNDS.maxNx &&
    Number.isInteger(grid.ny) &&
    Number(grid.ny) >= KMA_GRID_BOUNDS.minNy &&
    Number(grid.ny) <= KMA_GRID_BOUNDS.maxNy
  );
}

export function isLocationInsideKmaCoverage(
  latitude: number,
  longitude: number,
): boolean {
  return (
    Number.isFinite(latitude) &&
    latitude >= KMA_LOCATION_BOUNDS.minLatitude &&
    latitude <= KMA_LOCATION_BOUNDS.maxLatitude &&
    Number.isFinite(longitude) &&
    longitude >= KMA_LOCATION_BOUNDS.minLongitude &&
    longitude <= KMA_LOCATION_BOUNDS.maxLongitude
  );
}

/** Converts an ephemeral foreground coordinate to KMA's public 5 km grid. */
export function toKmaGrid(latitude: number, longitude: number): KmaGrid | null {
  if (!isLocationInsideKmaCoverage(latitude, longitude)) return null;

  const latitudeRadians = latitude * DEGREES_TO_RADIANS;
  let longitudeDelta = longitude * DEGREES_TO_RADIANS - ORIGIN_LONGITUDE;
  if (longitudeDelta > Math.PI) longitudeDelta -= Math.PI * 2;
  if (longitudeDelta < -Math.PI) longitudeDelta += Math.PI * 2;

  const radius =
    scaledRadius *
    projectionScale *
    Math.pow(
      Math.tan(Math.PI * 0.25 + latitudeRadians * 0.5),
      -projectionExponent,
    );
  const theta = longitudeDelta * projectionExponent;
  const grid = {
    nx: Math.floor(radius * Math.sin(theta) + ORIGIN_X + 0.5),
    ny: Math.floor(originRadius - radius * Math.cos(theta) + ORIGIN_Y + 0.5),
  };
  return isValidKmaGrid(grid) ? grid : null;
}

export function isSameKmaGrid(left: KmaGrid, right: KmaGrid): boolean {
  return left.nx === right.nx && left.ny === right.ny;
}
