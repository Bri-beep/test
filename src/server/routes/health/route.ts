import { withApiRoute } from "@/lib/http/with-api-route";

export const GET = withApiRoute(() => ({ status: "ok" as const }));
