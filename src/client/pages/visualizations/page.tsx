import { useEffect, useState } from "react";
import type { FeatureCollection, Geometry } from "geojson";
import { LoadingState } from "@/components/states/loading-state";
import { ErrorState } from "@/components/states/error-state";
import { VisualizationsDemo } from "./visualizations-demo";

export default function VisualizationsPage() {
  const [features, setFeatures] = useState<FeatureCollection<Geometry> | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/visualizations", { signal: controller.signal, cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("Visualization data unavailable");
        return response.json();
      })
      .then((data) => { if (!controller.signal.aborted) setFeatures(data); })
      .catch(() => { if (!controller.signal.aborted) setFailed(true); });
    return () => controller.abort();
  }, []);
  if (failed) return <ErrorState title="Démonstration indisponible" message="Les données de démonstration n’ont pas pu être chargées." />;
  if (!features) return <LoadingState label="Chargement des visualisations…" />;
  return <VisualizationsDemo europeFeatures={features} />;
}
