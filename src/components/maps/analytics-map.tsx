"use client";

import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";

import { DataCard } from "@/components/cards/data-card";
import { clamp, formatNumber } from "@/components/data-visualization/format";
import type {
  NumberFormat,
  VisualizationState,
} from "@/components/data-visualization/types";
import {
  CENTERED_MAP_PAN,
  constrainMapPan,
  createMapDataTableRows,
  createMapProjection,
  createMapRegions,
  createProjectedMapMarkers,
  DEFAULT_MAP_MAX_ZOOM,
  DEFAULT_MAP_MIN_ZOOM,
  DEFAULT_MAP_WIDTH,
  getMapHeight,
  getMapValueRange,
  getZoomedMapPoint,
} from "@/components/maps/map-geometry";
import {
  AccessibleMapDataTable,
  MapEmptyState,
  MapErrorState,
  MapHeatLayer,
  MapLegend,
  MapLoadingState,
  MapMarkerLayer,
  MapRegionLayer,
  MapShadowFilter,
  MapTooltip,
  MapZoomControls,
} from "@/components/maps/map-ui";
import type {
  AnalyticsMapProps,
  MapPanOffset,
  MapRegionDatum,
  MapTooltipDatum,
  ProjectedMapMarker,
} from "@/components/maps/types";
import { useElementWidth } from "@/components/maps/use-element-width";

export type {
  AnalyticsMapMarker,
  AnalyticsMapProjection,
  AnalyticsMapProps,
} from "@/components/maps/types";

const DEFAULT_STATE: VisualizationState = { status: "ready" };
const DEFAULT_VALUE_FORMAT = {
  maximumFractionDigits: 1,
} satisfies NumberFormat;
const KEYBOARD_PAN_STEP = 32;

type MapPointerDrag = {
  pointerId: number;
  startClientX: number;
  startClientY: number;
  origin: MapPanOffset;
  scaleX: number;
  scaleY: number;
};

function MapVisualization({
  title,
  description,
  features,
  values,
  featureIdProperty,
  featureLabelProperty,
  markers = [],
  projection: projectionName = "equal-earth",
  heatmap = false,
  initialZoom: requestedInitialZoom = DEFAULT_MAP_MIN_ZOOM,
  minZoom: requestedMinZoom = DEFAULT_MAP_MIN_ZOOM,
  maxZoom: requestedMaxZoom = DEFAULT_MAP_MAX_ZOOM,
  valueLabel = "Valeur",
  valueFormat = DEFAULT_VALUE_FORMAT,
  height,
}: Omit<AnalyticsMapProps, "className" | "state">) {
  const [viewportRef, width] = useElementWidth<HTMLDivElement>(DEFAULT_MAP_WIDTH);
  const tooltipId = useId();
  const svgTitleId = useId();
  const svgDescriptionId = useId();
  const filterId = `map-shadow-${useId().replaceAll(":", "")}`;
  const mapHeight = getMapHeight(height);
  const minZoom = Number.isFinite(requestedMinZoom)
    ? Math.max(0.5, requestedMinZoom)
    : DEFAULT_MAP_MIN_ZOOM;
  const maxZoom = Number.isFinite(requestedMaxZoom)
    ? Math.max(minZoom, requestedMaxZoom)
    : DEFAULT_MAP_MAX_ZOOM;
  const [initialZoom] = useState(() =>
    clamp(
      Number.isFinite(requestedInitialZoom) ? requestedInitialZoom : minZoom,
      minZoom,
      maxZoom,
    ),
  );
  const resetZoom = clamp(initialZoom, minZoom, maxZoom);
  const [storedZoom, setStoredZoom] = useState(initialZoom);
  const zoom = clamp(storedZoom, minZoom, maxZoom);
  const [storedPan, setStoredPan] = useState<MapPanOffset>(CENTERED_MAP_PAN);
  const pan = constrainMapPan(storedPan, zoom, width, mapHeight);
  const dragRef = useRef<MapPointerDrag | undefined>(undefined);
  const [isPanning, setIsPanning] = useState(false);
  const [activeKey, setActiveKey] = useState<string>();
  const [tooltip, setTooltip] = useState<MapTooltipDatum>();
  const valueFormatter = (value: number) => formatNumber(value, valueFormat);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      setStoredZoom((currentZoom) => {
        const nextZoom = clamp(currentZoom, minZoom, maxZoom);
        return nextZoom === currentZoom ? currentZoom : nextZoom;
      });
      setStoredPan((currentPan) => {
        const nextPan = constrainMapPan(
          currentPan,
          zoom,
          width,
          mapHeight,
        );
        return nextPan.x === currentPan.x && nextPan.y === currentPan.y
          ? currentPan
          : nextPan;
      });
    });

    return () => window.cancelAnimationFrame(frame);
  }, [mapHeight, maxZoom, minZoom, width, zoom]);

  const projection = useMemo(
    () => createMapProjection(projectionName, width, mapHeight, features),
    [features, mapHeight, projectionName, width],
  );

  const regions = useMemo(
    () =>
      createMapRegions({
        features,
        projection,
        values,
        featureIdProperty,
        featureLabelProperty,
        width,
        height: mapHeight,
      }),
    [
      featureIdProperty,
      featureLabelProperty,
      features,
      mapHeight,
      projection,
      values,
      width,
    ],
  );

  const projectedMarkers = useMemo(
    () => createProjectedMapMarkers(markers, projection),
    [markers, projection],
  );

  const regionValueRange = useMemo(
    () => getMapValueRange(regions.map((region) => region.value)),
    [regions],
  );

  const tableRows = useMemo(
    () => createMapDataTableRows(regions, markers),
    [markers, regions],
  );

  const setTooltipFromClientPoint = (
    datum: Omit<MapTooltipDatum, "x" | "y">,
    clientX: number,
    clientY: number,
  ) => {
    const bounds = viewportRef.current?.getBoundingClientRect();
    if (!bounds) {
      return;
    }

    setTooltip({
      ...datum,
      x: clientX - bounds.left,
      y: clientY - bounds.top,
    });
  };

  const setTooltipFromMapPoint = (
    datum: Omit<MapTooltipDatum, "x" | "y">,
    point: readonly [number, number],
  ) => {
    const zoomedPoint = getZoomedMapPoint(
      point,
      zoom,
      width,
      mapHeight,
      pan,
    );
    setTooltip({
      ...datum,
      x: zoomedPoint[0],
      y: zoomedPoint[1],
    });
  };

  const handleRegionPointer = (
    event: ReactPointerEvent<SVGPathElement>,
    region: MapRegionDatum,
  ) => {
    if (dragRef.current) {
      return;
    }

    setActiveKey(`region-${region.key}`);
    setTooltipFromClientPoint(
      {
        label: region.label,
        value: region.value,
        tone: "brand",
      },
      event.clientX,
      event.clientY,
    );
  };

  const handleMarkerPointer = (
    event: ReactPointerEvent<SVGGElement>,
    marker: ProjectedMapMarker,
  ) => {
    if (dragRef.current) {
      return;
    }

    setActiveKey(`marker-${marker.id}`);
    setTooltipFromClientPoint(
      {
        label: marker.label,
        value: marker.value,
        description: marker.description,
        tone: marker.tone ?? "brand",
      },
      event.clientX,
      event.clientY,
    );
  };

  const handleMarkerFocus = (marker: ProjectedMapMarker) => {
    setActiveKey(`marker-${marker.id}`);
    setTooltipFromMapPoint(
      {
        label: marker.label,
        value: marker.value,
        description: marker.description,
        tone: marker.tone ?? "brand",
      },
      marker.point,
    );
  };

  const clearTooltip = () => {
    setActiveKey(undefined);
    setTooltip(undefined);
  };

  const updateZoom = (nextZoom: number) => {
    const boundedZoom = clamp(nextZoom, minZoom, maxZoom);
    setStoredZoom(boundedZoom);
    setStoredPan((currentPan) =>
      constrainMapPan(currentPan, boundedZoom, width, mapHeight),
    );
    clearTooltip();
  };

  const updatePan = (nextPan: MapPanOffset) => {
    setStoredPan(constrainMapPan(nextPan, zoom, width, mapHeight));
    clearTooltip();
  };

  const resetView = () => {
    setStoredZoom(resetZoom);
    setStoredPan(CENTERED_MAP_PAN);
    clearTooltip();
  };

  const handleMapKeyDown = (event: ReactKeyboardEvent<SVGSVGElement>) => {
    if (event.target !== event.currentTarget) {
      return;
    }

    if (event.key === "+" || event.key === "=") {
      event.preventDefault();
      updateZoom(zoom + 0.5);
    } else if (event.key === "-" || event.key === "_") {
      event.preventDefault();
      updateZoom(zoom - 0.5);
    } else if (event.key === "0" || event.key === "Home") {
      event.preventDefault();
      resetView();
    } else if (zoom > 1 && event.key === "ArrowLeft") {
      event.preventDefault();
      updatePan({ x: pan.x + KEYBOARD_PAN_STEP, y: pan.y });
    } else if (zoom > 1 && event.key === "ArrowRight") {
      event.preventDefault();
      updatePan({ x: pan.x - KEYBOARD_PAN_STEP, y: pan.y });
    } else if (zoom > 1 && event.key === "ArrowUp") {
      event.preventDefault();
      updatePan({ x: pan.x, y: pan.y + KEYBOARD_PAN_STEP });
    } else if (zoom > 1 && event.key === "ArrowDown") {
      event.preventDefault();
      updatePan({ x: pan.x, y: pan.y - KEYBOARD_PAN_STEP });
    } else if (event.key === "Escape") {
      clearTooltip();
    }
  };

  const handleMapPointerDown = (
    event: ReactPointerEvent<SVGSVGElement>,
  ) => {
    const target = event.target;
    if (
      zoom <= 1 ||
      !event.isPrimary ||
      event.button !== 0 ||
      (target instanceof Element && target.closest("[data-map-marker='true']"))
    ) {
      return;
    }

    const bounds = event.currentTarget.getBoundingClientRect();
    if (bounds.width <= 0 || bounds.height <= 0) {
      return;
    }

    dragRef.current = {
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      origin: pan,
      scaleX: width / bounds.width,
      scaleY: mapHeight / bounds.height,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
    event.preventDefault();
    setIsPanning(true);
    clearTooltip();
  };

  const handleMapPointerMove = (
    event: ReactPointerEvent<SVGSVGElement>,
  ) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) {
      return;
    }

    event.preventDefault();
    setStoredPan(
      constrainMapPan(
        {
          x:
            drag.origin.x +
            (event.clientX - drag.startClientX) * drag.scaleX,
          y:
            drag.origin.y +
            (event.clientY - drag.startClientY) * drag.scaleY,
        },
        zoom,
        width,
        mapHeight,
      ),
    );
  };

  const finishMapPointerDrag = (
    event: ReactPointerEvent<SVGSVGElement>,
  ) => {
    if (dragRef.current?.pointerId !== event.pointerId) {
      return;
    }

    dragRef.current = undefined;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    setIsPanning(false);
  };

  return (
    <>
      <div
        ref={viewportRef}
        className="relative isolate overflow-hidden rounded-2xl border border-line bg-canvas-subtle"
        style={{ height: mapHeight }}
      >
        <MapZoomControls
          zoom={zoom}
          initialZoom={resetZoom}
          minZoom={minZoom}
          maxZoom={maxZoom}
          isCentered={pan.x === 0 && pan.y === 0}
          onZoomChange={updateZoom}
          onReset={resetView}
        />
        <svg
          viewBox={`0 0 ${width} ${mapHeight}`}
          width={width}
          height={mapHeight}
          className={`block size-full rounded-2xl outline-none focus-visible:ring-[3px] focus-visible:ring-inset focus-visible:ring-[var(--focus-ring)] ${
            zoom > 1
              ? isPanning
                ? "touch-none cursor-grabbing"
                : "touch-none cursor-grab"
              : "touch-manipulation"
          }`}
          role="group"
          aria-labelledby={`${svgTitleId} ${svgDescriptionId}`}
          aria-keyshortcuts="+ - 0 Home ArrowUp ArrowDown ArrowLeft ArrowRight"
          tabIndex={0}
          onKeyDown={handleMapKeyDown}
          onPointerDown={handleMapPointerDown}
          onPointerMove={handleMapPointerMove}
          onPointerUp={finishMapPointerDrag}
          onPointerCancel={finishMapPointerDrag}
          onLostPointerCapture={finishMapPointerDrag}
        >
          <title id={svgTitleId}>{title}</title>
          <desc id={svgDescriptionId}>
            {description
              ? `${description} `
              : "Carte analytique interactive. "}
            Utilisez les touches plus et moins pour modifier le zoom, et la touche
            zéro ou Début pour le réinitialiser. Lorsque la carte est agrandie,
            faites-la glisser avec un pointeur ou utilisez les touches fléchées pour
            déplacer la vue. Les données sont aussi disponibles dans le tableau
            placé après la carte.
          </desc>
          <MapShadowFilter filterId={filterId} />
          <g
            transform={`translate(${pan.x} ${pan.y}) translate(${width / 2} ${
              mapHeight / 2
            }) scale(${zoom}) translate(${-width / 2} ${-mapHeight / 2})`}
          >
            <MapRegionLayer
              regions={regions}
              activeKey={activeKey}
              tooltipId={tooltipId}
              valueLabel={valueLabel}
              formatValue={valueFormatter}
              onPointerEnter={handleRegionPointer}
              onExit={clearTooltip}
            />
            {heatmap ? <MapHeatLayer markers={projectedMarkers} /> : null}
            <MapMarkerLayer
              markers={projectedMarkers}
              activeKey={activeKey}
              tooltipId={tooltipId}
              filterId={filterId}
              zoom={zoom}
              valueLabel={valueLabel}
              formatValue={valueFormatter}
              onPointerEnter={handleMarkerPointer}
              onExit={clearTooltip}
              onFocus={handleMarkerFocus}
            />
          </g>
        </svg>
        {tooltip ? (
          <MapTooltip
            datum={tooltip}
            tooltipId={tooltipId}
            width={width}
            height={mapHeight}
            valueLabel={valueLabel}
            formatValue={valueFormatter}
          />
        ) : null}
        {regionValueRange ? (
          <MapLegend
            range={regionValueRange}
            valueLabel={valueLabel}
            formatValue={valueFormatter}
          />
        ) : null}
        <p className="sr-only" aria-live="polite">
          Zoom de la carte : {zoom.toLocaleString("fr-FR")} fois.
        </p>
      </div>

      <AccessibleMapDataTable
        rows={tableRows}
        valueLabel={valueLabel}
        formatValue={valueFormatter}
      />
    </>
  );
}

export function AnalyticsMap({
  title,
  description,
  features,
  values,
  featureIdProperty,
  featureLabelProperty,
  markers,
  projection,
  heatmap,
  initialZoom,
  minZoom,
  maxZoom,
  valueLabel,
  valueFormat,
  state = DEFAULT_STATE,
  className,
  height,
}: AnalyticsMapProps) {
  const mapHeight = getMapHeight(height);

  return (
    <DataCard
      title={title}
      description={description}
      className={className}
      padding="compact"
    >
      {state.status === "loading" ? (
        <MapLoadingState
          label={state.label ?? "Chargement de la carte…"}
          height={mapHeight}
        />
      ) : null}

      {state.status === "empty" ? (
        <MapEmptyState
          title={state.title ?? "Aucune donnée géographique"}
          message={
            state.message ??
            "Modifiez la période ou les filtres pour afficher des zones sur la carte."
          }
          height={mapHeight}
        />
      ) : null}

      {state.status === "error" ? (
        <MapErrorState
          title={state.title ?? "Carte indisponible"}
          message={state.message}
          height={mapHeight}
        />
      ) : null}

      {state.status === "ready" && features.features.length === 0 ? (
        <MapEmptyState
          title="Aucune donnée géographique"
          message="La source ne contient aucune zone à représenter pour cette sélection."
          height={mapHeight}
        />
      ) : null}

      {state.status === "ready" && features.features.length > 0 ? (
        <MapVisualization
          title={title}
          description={description}
          features={features}
          values={values}
          featureIdProperty={featureIdProperty}
          featureLabelProperty={featureLabelProperty}
          markers={markers}
          projection={projection}
          heatmap={heatmap}
          initialZoom={initialZoom}
          minZoom={minZoom}
          maxZoom={maxZoom}
          valueLabel={valueLabel}
          valueFormat={valueFormat}
          height={height}
        />
      ) : null}
    </DataCard>
  );
}
