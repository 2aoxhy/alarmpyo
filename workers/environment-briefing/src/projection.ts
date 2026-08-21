const DEGREES_TO_RADIANS = Math.PI / 180;
const RADIANS_TO_DEGREES = 180 / Math.PI;

const KMA_EARTH_RADIUS_KM = 6_371.00877;
const KMA_GRID_KM = 5;
const KMA_STANDARD_LATITUDE_ONE = 30 * DEGREES_TO_RADIANS;
const KMA_STANDARD_LATITUDE_TWO = 60 * DEGREES_TO_RADIANS;
const KMA_ORIGIN_LONGITUDE = 126 * DEGREES_TO_RADIANS;
const KMA_ORIGIN_LATITUDE = 38 * DEGREES_TO_RADIANS;
const KMA_ORIGIN_X = 43;
const KMA_ORIGIN_Y = 136;

const scaledRadius = KMA_EARTH_RADIUS_KM / KMA_GRID_KM;
const projectionExponent =
  Math.log(
    Math.cos(KMA_STANDARD_LATITUDE_ONE) /
      Math.cos(KMA_STANDARD_LATITUDE_TWO),
  ) /
  Math.log(
    Math.tan(Math.PI * 0.25 + KMA_STANDARD_LATITUDE_TWO * 0.5) /
      Math.tan(Math.PI * 0.25 + KMA_STANDARD_LATITUDE_ONE * 0.5),
  );
const projectionScale =
  (Math.pow(
    Math.tan(Math.PI * 0.25 + KMA_STANDARD_LATITUDE_ONE * 0.5),
    projectionExponent,
  ) *
    Math.cos(KMA_STANDARD_LATITUDE_ONE)) /
  projectionExponent;
const originRadius =
  scaledRadius *
  projectionScale *
  Math.pow(
    Math.tan(Math.PI * 0.25 + KMA_ORIGIN_LATITUDE * 0.5),
    -projectionExponent,
  );

export type GeographicCoordinate = Readonly<{
  latitude: number;
  longitude: number;
}>;

export type KoreaTmCoordinate = Readonly<{
  x: number;
  y: number;
}>;

/** Returns the geographic center represented by an integer KMA grid cell. */
export function kmaGridToGeographic(nx: number, ny: number): GeographicCoordinate {
  const x = nx - KMA_ORIGIN_X;
  const y = originRadius - ny + KMA_ORIGIN_Y;
  const radius = Math.sqrt(x * x + y * y);
  const adjustedRadius = projectionExponent < 0 ? -radius : radius;
  const latitude =
    2 *
      Math.atan(
        Math.pow(
          (scaledRadius * projectionScale) / adjustedRadius,
          1 / projectionExponent,
        ),
      ) -
    Math.PI * 0.5;
  const theta = Math.atan2(x, y) / projectionExponent;
  return {
    latitude: latitude * RADIANS_TO_DEGREES,
    longitude:
      (theta + KMA_ORIGIN_LONGITUDE) * RADIANS_TO_DEGREES,
  };
}

/**
 * WGS84 to Korea 2000 / Central Belt (EPSG:5181), the TM coordinates accepted
 * by AirKorea's nearby-measuring-station endpoint.
 */
export function geographicToKoreaTm(
  latitude: number,
  longitude: number,
): KoreaTmCoordinate {
  const semiMajorAxis = 6_378_137;
  const inverseFlattening = 298.257222101;
  const flattening = 1 / inverseFlattening;
  const eccentricitySquared = flattening * (2 - flattening);
  const secondEccentricitySquared =
    eccentricitySquared / (1 - eccentricitySquared);
  const latitudeOrigin = 38 * DEGREES_TO_RADIANS;
  const centralMeridian = 127 * DEGREES_TO_RADIANS;
  const falseEasting = 200_000;
  const falseNorthing = 500_000;
  const latitudeRadians = latitude * DEGREES_TO_RADIANS;
  const longitudeRadians = longitude * DEGREES_TO_RADIANS;

  const meridionalArc = (phi: number) => {
    const e2 = eccentricitySquared;
    const e4 = e2 * e2;
    const e6 = e4 * e2;
    return (
      semiMajorAxis *
      ((1 - e2 / 4 - (3 * e4) / 64 - (5 * e6) / 256) * phi -
        ((3 * e2) / 8 + (3 * e4) / 32 + (45 * e6) / 1_024) *
          Math.sin(2 * phi) +
        ((15 * e4) / 256 + (45 * e6) / 1_024) * Math.sin(4 * phi) -
        ((35 * e6) / 3_072) * Math.sin(6 * phi))
    );
  };

  const sinLatitude = Math.sin(latitudeRadians);
  const cosLatitude = Math.cos(latitudeRadians);
  const tangent = Math.tan(latitudeRadians);
  const normalRadius =
    semiMajorAxis /
    Math.sqrt(1 - eccentricitySquared * sinLatitude * sinLatitude);
  const tangentSquared = tangent * tangent;
  const longitudeCoefficient =
    secondEccentricitySquared * cosLatitude * cosLatitude;
  const longitudeDistance =
    cosLatitude * (longitudeRadians - centralMeridian);
  const longitudeDistance2 = longitudeDistance * longitudeDistance;
  const longitudeDistance3 = longitudeDistance2 * longitudeDistance;
  const longitudeDistance4 = longitudeDistance2 * longitudeDistance2;
  const longitudeDistance5 = longitudeDistance4 * longitudeDistance;
  const longitudeDistance6 = longitudeDistance3 * longitudeDistance3;

  const x =
    falseEasting +
    normalRadius *
      (longitudeDistance +
        ((1 - tangentSquared + longitudeCoefficient) * longitudeDistance3) /
          6 +
        ((5 -
          18 * tangentSquared +
          tangentSquared * tangentSquared +
          72 * longitudeCoefficient -
          58 * secondEccentricitySquared) *
          longitudeDistance5) /
          120);
  const y =
    falseNorthing +
    (meridionalArc(latitudeRadians) - meridionalArc(latitudeOrigin)) +
    normalRadius *
      tangent *
      (longitudeDistance2 / 2 +
        ((5 -
          tangentSquared +
          9 * longitudeCoefficient +
          4 * longitudeCoefficient * longitudeCoefficient) *
          longitudeDistance4) /
          24 +
        ((61 -
          58 * tangentSquared +
          tangentSquared * tangentSquared +
          600 * longitudeCoefficient -
          330 * secondEccentricitySquared) *
          longitudeDistance6) /
          720);
  return { x, y };
}
