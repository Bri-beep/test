import type { FeatureCollection } from "geojson";

import type {
  DataTone,
  NumberFormat,
  VisualizationState,
} from "@/components/data-visualization/types";

export type AnalyticsMapProjection = "mercator" | "equal-earth";

export type AnalyticsMapMarker = {
  id: string;
  label: string;
  coordinates: readonly [number, number];
  value?: number;
  description?: string;
  tone?: DataTone;
};

export type AnalyticsMapProps = {
  title: string;
  description?: string;
  features: FeatureCollection;
  values?: Readonly<Record<string, number>>;
  featureIdProperty?: string;
  featureLabelProperty?: string;
  markers?: readonly AnalyticsMapMarker[];
  projection?: AnalyticsMapProjection;
  heatmap?: boolean;
  initialZoom?: number;
  minZoom?: number;
  maxZoom?: number;
  valueLabel?: string;
  valueFormat?: NumberFormat;
  state?: VisualizationState;
  className?: string;
  height?: number;
};

export type MapTooltipDatum = {
  label: string;
  value?: number;
  description?: string;
  x: number;
  y: number;
  tone: DataTone;
};

export type MapRegionDatum = {
  key: string;
  label: string;
  value?: number;
  path: string;
  centroid: readonly [number, number];
  fillOpacity: number;
};

export type ProjectedMapMarker = AnalyticsMapMarker & {
  point: readonly [number, number];
  heatRadius: number;
};

export type MapDataTableRow = {
  key: string;
  label: string;
  kind: "Zone" | "Repère";
  value?: number;
  description?: string;
};

export type MapValueRange = {
  minimum: number;
  maximum: number;
};

export type MapPanOffset = {
  x: number;
  y: number;
};
