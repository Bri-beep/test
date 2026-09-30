import { userStateRoutes } from "@/features/user-state/server/route";
import { userStateRuntime } from "@/features/user-state/server/runtime";

const routes = userStateRoutes(userStateRuntime);
export const GET = routes.preferences;
export const PUT = routes.putPreferences;
