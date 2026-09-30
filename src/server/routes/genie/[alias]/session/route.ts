import { getGenieSession } from "@/features/genie/server/session";
import { withApiRoute } from "@/lib/http/with-api-route";

export const GET = withApiRoute((request) => getGenieSession(request, request.params.alias));
