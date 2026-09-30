import type { Request } from "express";
import { z } from "zod";
import { withApiRoute } from "@/lib/http/with-api-route";
import { parseInput, readMutation, resolveOwner } from "./request";
import type { UserStateConfig } from "./config";
import type { UserStateService } from "./service";

type Runtime = (requestId: string) => { config: UserStateConfig; service: UserStateService };
export function userStateRoutes(runtime: Runtime) {
  const resolve = (request: Request, requestId: string) => {
    const { config, service } = runtime(requestId);
    return { config, service, owner: resolveOwner(request, config) };
  };
  return {
    list: withApiRoute(async (request, context) => {
      const { service, owner } = resolve(request, context.requestId);
      return service.list(owner, parseInput(z.string(), request.query.cursor ?? ""));
    }),
    get: withApiRoute(async (request, context) => {
      const { service, owner } = resolve(request, context.requestId);
      return service.get(owner, request.params.id);
    }),
    put: withApiRoute(async (request, context) => {
      const { config, service, owner } = resolve(request, context.requestId);
      return service.put(owner, request.params.id, await readMutation(request, config));
    }),
    remove: withApiRoute(async (request, context) => {
      const { config, service, owner } = resolve(request, context.requestId);
      parseInput(z.object({}).strict(), await readMutation(request, config));
      await service.remove(owner, request.params.id);
      return { deleted: true };
    }),
    preferences: withApiRoute(async (request, context) => {
      const { service, owner } = resolve(request, context.requestId);
      return service.preferences(owner);
    }),
    putPreferences: withApiRoute(async (request, context) => {
      const { config, service, owner } = resolve(request, context.requestId);
      return service.putPreferences(owner, await readMutation(request, config));
    }),
  };
}
