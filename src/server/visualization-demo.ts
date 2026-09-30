import type { FeatureCollection, Geometry } from "geojson";
import { feature as toGeoJson } from "topojson-client";
import type { GeometryCollection, Topology } from "topojson-specification";
import countriesTopologyJson from "world-atlas/countries-110m.json" with { type: "json" };

const countryNames: Readonly<Record<string, string>> = {
  "040": "Autriche",
  "056": "Belgique",
  "203": "Tchéquie",
  "208": "Danemark",
  "250": "France",
  "276": "Allemagne",
  "372": "Irlande",
  "380": "Italie",
  "528": "Pays-Bas",
  "578": "Norvège",
  "616": "Pologne",
  "620": "Portugal",
  "724": "Espagne",
  "752": "Suède",
  "756": "Suisse",
  "826": "Royaume-Uni",
};
const europeIds = new Set(Object.keys(countryNames));
const topology = countriesTopologyJson as unknown as Topology<{ countries: GeometryCollection }>;
const world = toGeoJson(topology, topology.objects.countries);

export const europeFeatures: FeatureCollection<Geometry> = {
  type: "FeatureCollection",
  features: world.features
    .filter((country) => country.id !== undefined && europeIds.has(String(country.id)))
    .map((country) => {
      const geometry = country.id === "250" && country.geometry.type === "MultiPolygon"
        ? {
            ...country.geometry,
            coordinates: country.geometry.coordinates.filter((polygon) =>
              polygon.some((ring) => ring.some((coordinate) => coordinate[1] > 40)),
            ),
          }
        : country.geometry;

      return {
        ...country,
        geometry,
        properties: {
          ...country.properties,
          label: countryNames[String(country.id)] ?? String(country.id),
        },
      };
    }),
};
