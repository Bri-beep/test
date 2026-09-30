import type { Application } from "express";
import { AppError } from "@/lib/errors/app-error";
import { expressErrorHandler, withApiRoute } from "@/lib/http/with-api-route";
import { parseAppDisplayConfig } from "@/lib/config/server-config";
import { userStateEnabled } from "@/features/user-state/server/config";
import { publicAppConfigSchema } from "@/shared/app-config";
import { GET as health } from "./routes/health/route";
import { GET as connectionCheck } from "./routes/connection-check/route";
import { GET as readiness } from "./routes/readiness/route";
import { POST as genie } from "./routes/genie/[alias]/messages/route";
import { GET as savedAnalyses } from "./routes/saved-analyses/route";
import { GET as getAnalysis, PUT as putAnalysis, DELETE as deleteAnalysis } from "./routes/saved-analyses/[id]/route";
import { GET as preferences, PUT as putPreferences } from "./routes/user-preferences/route";
import { europeFeatures } from "./visualization-demo";
import { GET as comparisonDemo } from "./routes/period-comparison/route";
import { GET as genieSession } from "./routes/genie/[alias]/session/route";
// feature:new inserts imports above this line.

export function registerRoutes(app: Application) {
  app.disable("x-powered-by");
  app.get("/api/health", health);
  app.get("/api/config", withApiRoute(() => publicAppConfigSchema.parse({
    ...parseAppDisplayConfig(), personalStateEnabled: userStateEnabled(),
    personalStateDemo: process.env.APP_MODE === "demo" && !process.env.DATABRICKS_APP_NAME
      && ["development", "test"].includes(process.env.NODE_ENV ?? ""),
  })));
  app.get("/api/visualizations", withApiRoute(() => europeFeatures));
  app.get("/api/period-comparison/demo", comparisonDemo);
  app.get("/api/connection-check", connectionCheck);
  app.get("/api/readiness", readiness);
  app.post("/api/genie/:alias/messages", genie);
  app.get("/api/genie/:alias/session", genieSession);
  app.get("/api/saved-analyses", savedAnalyses);
  app.get("/api/saved-analyses/:id", getAnalysis);
  app.put("/api/saved-analyses/:id", putAnalysis);
  app.delete("/api/saved-analyses/:id", deleteAnalysis);
  app.get("/api/user-preferences", preferences);
  app.put("/api/user-preferences", putPreferences);
  // feature:new inserts routes above this line.
  app.use("/api", withApiRoute(() => {
    throw new AppError("Unknown feature route", "NOT_FOUND", 404, "Cette route n’existe pas.");
  }));
  app.use(expressErrorHandler);
}
