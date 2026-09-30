import {
  geoEqualEarth,
  geoMercator,
  geoPath,
  type GeoProjection,
} from "d3-geo";
import type {
  Feature,
  FeatureCollection,
  GeoJsonProperties,
  Geometry,
} from "geojson";

import { clamp } from "@/components/data-visualization/format";
import type {
  AnalyticsMapMarker,
  AnalyticsMapProjection,
  MapDataTableRow,
  MapPanOffset,
  MapRegionDatum,
  MapValueRange,
  ProjectedMapMarker,
} from "@/components/maps/types";

export const DEFAULT_MAP_WIDTH = 720;
export const DEFAULT_MAP_HEIGHT = 420;
export const DEFAULT_MAP_MIN_ZOOM = 1;
export const DEFAULT_MAP_MAX_ZOOM = 4;

const MAP_PADDING = 28;
const MAP_RENDER_PRECISION = 1_000_000;

export const CENTERED_MAP_PAN: MapPanOffset = { x: 0, y: 0 };

export function stabilizeMapMeasurement(value: number) {
  return Math.round(value * MAP_RENDER_PRECISION) / MAP_RENDER_PRECISION;
}

function getFiniteValue(value: number | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function getProperty(
  properties: GeoJsonProperties,
  propertyName: string | undefined,
) {
  if (!properties || !propertyName) {
    return undefined;
  }

  const value = properties[propertyName];
  return typeof value === "string" || typeof value === "number"
    ? String(value)
    : undefined;
}

function getFeatureKey(
  feature: Feature<Geometry, GeoJsonProperties>,
  index: number,
  featureIdProperty: string | undefined,
) {
  return (
    getProperty(feature.properties, featureIdProperty) ??
    (feature.id === undefined ? undefined : String(feature.id)) ??
    `zone-${index + 1}`
  );
}

function getFeatureLabel(
  feature: Feature<Geometry, GeoJsonProperties>,
  key: string,
  featureLabelProperty: string | undefined,
) {
  return (
    getProperty(feature.properties, featureLabelProperty) ??
    getProperty(feature.properties, "name") ??
    getProperty(feature.properties, "label") ??
    key
  );
}

function getNormalizedValue(
  value: number | undefined,
  range: MapValueRange | undefined,
) {
  if (value === undefined || !range) {
    return undefined;
  }

  if (range.maximum === range.minimum) {
    return 0.65;
  }

  return clamp(
    (value - range.minimum) / (range.maximum - range.minimum),
    0,
    1,
  );
}

export function getMapHeight(height: number | undefined) {
  return typeof height === "number" && Number.isFinite(height)
    ? clamp(height, 240, 760)
    : DEFAULT_MAP_HEIGHT;
}

export function constrainMapPan(
  pan: MapPanOffset,
  zoom: number,
  width: number,
  height: number,
): MapPanOffset {
  if (
    !Number.isFinite(zoom) ||
    zoom <= 1 ||
    !Number.isFinite(width) ||
    width <= 0 ||
    !Number.isFinite(height) ||
    height <= 0
  ) {
    return CENTERED_MAP_PAN;
  }

  const maximumX = (width * (zoom - 1)) / 2;
  const maximumY = (height * (zoom - 1)) / 2;

  return {
    x: clamp(Number.isFinite(pan.x) ? pan.x : 0, -maximumX, maximumX),
    y: clamp(Number.isFinite(pan.y) ? pan.y : 0, -maximumY, maximumY),
  };
}

export function createMapProjection(
  name: AnalyticsMapProjection,
  width: number,
  height: number,
  features: FeatureCollection,
) {
  const projection: GeoProjection =
    name === "mercator" ? geoMercator() : geoEqualEarth();

  if (features.features.length > 0) {
    const padding = Math.min(MAP_PADDING, width * 0.08, height * 0.08);
    projection.fitExtent(
      [
        [padding, padding],
        [width - padding, height - padding],
      ],
      features,
    );
  } else {
    projection.translate([width / 2, height / 2]);
  }

  return projection;
}

export function getMapValueRange(
  values: readonly (number | undefined)[],
): MapValueRange | undefined {
  const finiteValues = values.filter(
    (value): value is number => value !== undefined && Number.isFinite(value),
  );

  if (finiteValues.length === 0) {
    return undefined;
  }

  return {
    minimum: Math.min(...finiteValues),
    maximum: Math.max(...finiteValues),
  };
}

export function createMapRegions({
  features,
  projection,
  values,
  featureIdProperty,
  featureLabelProperty,
  width,
  height,
}: {
  features: FeatureCollection;
  projection: GeoProjection;
  values: Readonly<Record<string, number>> | undefined;
  featureIdProperty: string | undefined;
  featureLabelProperty: string | undefined;
  width: number;
  height: number;
}): readonly MapRegionDatum[] {
  const pathGenerator = geoPath(projection).digits(3);
  const regionValues = features.features.map((feature, index) => {
    const key = getFeatureKey(feature, index, featureIdProperty);
    return getFiniteValue(values?.[key]);
  });
  const range = getMapValueRange(regionValues);

  return features.features.map((feature, index) => {
    const key = getFeatureKey(feature, index, featureIdProperty);
    const value = regionValues[index];
    const normalizedValue = getNormalizedValue(value, range);
    const projectedCentroid = pathGenerator.centroid(feature);
    const centroid = projectedCentroid.every(Number.isFinite)
      ? projectedCentroid
      : ([width / 2, height / 2] as const);

    return {
      key,
      label: getFeatureLabel(feature, key, featureLabelProperty),
      value,
      path: pathGenerator(feature) ?? "",
      centroid: [
        stabilizeMapMeasurement(centroid[0]),
        stabilizeMapMeasurement(centroid[1]),
      ],
      fillOpacity: stabilizeMapMeasurement(
        normalizedValue === undefined ? 0.08 : 0.18 + normalizedValue * 0.66,
      ),
    };
  });
}

export function createProjectedMapMarkers(
  markers: readonly AnalyticsMapMarker[],
  projection: GeoProjection,
): readonly ProjectedMapMarker[] {
  const range = getMapValueRange(
    markers.map((marker) => getFiniteValue(marker.value)),
  );

  return markers.flatMap((marker) => {
    const value = getFiniteValue(marker.value);
    const point = projection([
      marker.coordinates[0],
      marker.coordinates[1],
    ]);
    if (!point || !point.every(Number.isFinite)) {
      return [];
    }

    const normalizedValue = getNormalizedValue(value, range) ?? 0.35;
    return [
      {
        ...marker,
        value,
        point: [
          stabilizeMapMeasurement(point[0]),
          stabilizeMapMeasurement(point[1]),
        ] as const,
        heatRadius: stabilizeMapMeasurement(20 + normalizedValue * 34),
      },
    ];
  });
}

export function createMapDataTableRows(
  regions: readonly MapRegionDatum[],
  markers: readonly AnalyticsMapMarker[],
): readonly MapDataTableRow[] {
  return [
    ...regions.map((region) => ({
      key: `region-${region.key}`,
      label: region.label,
      kind: "Zone" as const,
      value: region.value,
    })),
    ...markers.map((marker) => ({
      key: `marker-${marker.id}`,
      label: marker.label,
      kind: "Repère" as const,
      value: getFiniteValue(marker.value),
      description: marker.description,
    })),
  ];
}

export function getRegionAriaLabel(
  region: MapRegionDatum,
  valueLabel: string,
  formatValue: (value: number) => string,
) {
  if (region.value === undefined) {
    return `${region.label}. ${valueLabel} : aucune donnée.`;
  }

  return `${region.label}. ${valueLabel} : ${formatValue(region.value)}.`;
}

export function getMarkerAriaLabel(
  marker: AnalyticsMapMarker,
  valueLabel: string,
  formatValue: (value: number) => string,
) {
  const parts = [marker.label];
  if (marker.value !== undefined) {
    parts.push(`${valueLabel} : ${formatValue(marker.value)}`);
  }
  if (marker.description) {
    parts.push(marker.description);
  }
  return `${parts.join(". ")}.`;
}

export function getZoomedMapPoint(
  point: readonly [number, number],
  zoom: number,
  width: number,
  height: number,
  pan: MapPanOffset = CENTERED_MAP_PAN,
): readonly [number, number] {
  return [
    width / 2 + (point[0] - width / 2) * zoom + pan.x,
    height / 2 + (point[1] - height / 2) * zoom + pan.y,
  ];
}
