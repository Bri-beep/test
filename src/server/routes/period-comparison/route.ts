import { getComparisonDemo } from "@/features/period-comparison/server/service";
import { parseComparisonRequest } from "@/features/period-comparison/server/request";
import { withApiRoute } from "@/lib/http/with-api-route";

export const GET = withApiRoute((request) => getComparisonDemo(parseComparisonRequest(request.query)));
