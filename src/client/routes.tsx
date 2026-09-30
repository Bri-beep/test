import { lazy } from "react";
import type { RouteObject } from "react-router-dom";

const HomePage = lazy(() => import("./pages/page"));
const VisualizationsPage = lazy(() => import("./pages/visualizations/page"));
const GeniePage = lazy(() => import("./pages/genie/page"));
const SavedAnalysesPage = lazy(() => import("./pages/saved-analyses/page"));
const ExamplePage = lazy(() => import("./pages/saved-analyses/example/page"));
// feature:new inserts imports above this line.

export const appRoutes: RouteObject[] = [
  { path: "/", element: <HomePage /> },
  { path: "/visualizations", element: <VisualizationsPage /> },
  { path: "/genie", element: <GeniePage /> },
  { path: "/saved-analyses", element: <SavedAnalysesPage /> },
  { path: "/saved-analyses/example", element: <ExamplePage /> },
  // feature:new inserts routes above this line.
  { path: "*", element: <p>Cette page n’existe pas.</p> },
];
