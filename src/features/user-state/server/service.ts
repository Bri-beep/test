import { randomUUID } from "node:crypto";
import { z } from "zod";
import {
  analysisInputSchema, analysisSchema, DEFAULT_PREFERENCES, PAGE_SIZE, preferencesSchema,
  type AnalysisPage, type Preferences, type SavedAnalysis,
} from "../contract";
import { parseInput } from "./request";
import { notFound, unavailable } from "./errors";
import type { StateKind, StateRow, UserStateRepository } from "./repository";

function decode<T>(row: StateRow, schema: z.ZodType<T>): T {
  try { return schema.parse(JSON.parse(row.payload_json)); } catch { throw unavailable(); }
}
function toAnalysis(row: StateRow): SavedAnalysis {
  return analysisSchema.parse({ ...decode(row, analysisInputSchema), id: row.entity_id, updatedAt: row.updated_at });
}

export class UserStateService {
  constructor(private readonly repository: UserStateRepository, private readonly now = () => new Date()) {}

  async list(owner: string, cursor = ""): Promise<AnalysisPage> {
    if (cursor) parseInput(z.string().uuid(), cursor);
    const rows = await this.repository.list(owner, cursor);
    const items = rows.slice(0, PAGE_SIZE).map(toAnalysis);
    return { items, nextCursor: rows.length > PAGE_SIZE ? items.at(-1)!.id : null };
  }
  async get(owner: string, id: string): Promise<SavedAnalysis> {
    parseInput(z.string().uuid(), id);
    const row = await this.repository.get("analyses", owner, id);
    if (!row || row.deleted) throw notFound();
    return toAnalysis(row);
  }
  private async write(kind: StateKind, owner: string, id: string, payload: unknown, deleted = false): Promise<void> {
    await this.repository.append(kind, owner, {
      entity_id: id, version_id: randomUUID(), updated_at: this.now().toISOString(),
      deleted, payload_json: JSON.stringify(payload),
    });
  }
  async put(owner: string, id: string, input: unknown): Promise<SavedAnalysis> {
    parseInput(z.string().uuid(), id);
    const analysis = parseInput(analysisInputSchema, input);
    await this.write("analyses", owner, id, analysis);
    // Return the current winner, including a concurrent update; never infer a
    // successful mutation from an affected-row count returned by the driver.
    return this.get(owner, id);
  }
  async remove(owner: string, id: string): Promise<void> {
    await this.get(owner, id);
    await this.write("analyses", owner, id, {}, true);
  }
  async preferences(owner: string): Promise<Preferences> {
    const row = await this.repository.get("preferences", owner, "settings");
    return row && !row.deleted ? decode(row, preferencesSchema) : { ...DEFAULT_PREFERENCES };
  }
  async putPreferences(owner: string, input: unknown): Promise<Preferences> {
    const preferences = parseInput(preferencesSchema, input);
    await this.write("preferences", owner, "settings", preferences);
    return this.preferences(owner);
  }
}
