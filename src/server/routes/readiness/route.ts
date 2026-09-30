import { checkReadiness } from "@/features/readiness/server/service";
import { withApiRoute } from "@/lib/http/with-api-route";

export const GET = withApiRoute((_request, context) => checkReadiness(context.requestId));
