import { parseGenieMessageRequest } from "@/features/genie/server/request";
import { sendGenieMessage } from "@/features/genie/server/runtime";
import { withApiRoute } from "@/lib/http/with-api-route";

export const POST = withApiRoute((request, context, response) =>
  sendGenieMessage(request, response, request.params.alias, parseGenieMessageRequest(request), context));
