import { z } from "zod";
import { quoteQualifiedIdentifier } from "@/lib/databricks/identifiers";
import type { SqlExecutor } from "@/lib/databricks/types";
import { APPEND_STATE, GET_STATE, LIST_STATE } from "./queries";
import { unavailable } from "./errors";

export type StateKind = "analyses" | "preferences";
export const rowSchema = z.object({
  entity_id: z.string(), payload_json: z.string(), updated_at: z.string().datetime(), deleted: z.boolean(),
});
export type StateRow = z.infer<typeof rowSchema>;
export type StateWrite = StateRow & { version_id: string };
export interface UserStateRepository {
  list(owner: string, cursor: string): Promise<StateRow[]>;
  get(kind: StateKind, owner: string, id: string): Promise<StateRow | null>;
  append(kind: StateKind, owner: string, row: StateWrite): Promise<void>;
}

export class SqlUserStateRepository implements UserStateRepository {
  constructor(
    private readonly executor: SqlExecutor,
    private readonly appId: string,
    private readonly tables: Record<StateKind, string>,
    private readonly requestId?: string,
  ) {}

  async list(owner: string, cursor: string): Promise<StateRow[]> {
    return this.executor.query({
      name: "user-state-list-analyses", statement: LIST_STATE,
      parameters: { table: quoteQualifiedIdentifier(this.tables.analyses), appId: this.appId, owner, cursor },
      rowSchema, requestId: this.requestId, maxRows: 51,
    });
  }

  async get(kind: StateKind, owner: string, id: string): Promise<StateRow | null> {
    const rows = await this.executor.query({
      name: `user-state-get-${kind}`, statement: GET_STATE,
      parameters: { table: quoteQualifiedIdentifier(this.tables[kind]), appId: this.appId, owner, id },
      rowSchema, requestId: this.requestId, maxRows: 1,
    });
    return rows[0] ?? null;
  }

  async append(kind: StateKind, owner: string, row: StateWrite): Promise<void> {
    try {
      await this.executor.query({
        name: `user-state-write-${kind}`, statement: APPEND_STATE,
        parameters: { table: quoteQualifiedIdentifier(this.tables[kind]), appId: this.appId, owner,
          id: row.entity_id, version: row.version_id, updatedAt: row.updated_at, deleted: row.deleted, payload: row.payload_json },
        rowSchema: z.unknown(), requestId: this.requestId, maxRows: 1,
      });
    } catch {
      // A timeout may follow a commit. Do not claim success or automatically retry.
      throw unavailable();
    }
  }
}

// Demo only. Runtime configuration never selects this store inside Databricks Apps.
export class MemoryUserStateRepository implements UserStateRepository {
  private readonly rows = new Map<string, StateWrite>();
  private key(kind: StateKind, owner: string, id: string): string {
    return JSON.stringify([kind, owner, id]);
  }
  async list(owner: string, cursor: string): Promise<StateRow[]> {
    return [...this.rows.entries()].filter(([key, row]) => {
      const [kind, rowOwner] = JSON.parse(key);
      return kind === "analyses" && rowOwner === owner && !row.deleted && row.entity_id > cursor;
    }).map(([, row]) => structuredClone(row))
      .sort((a, b) => a.entity_id < b.entity_id ? -1 : 1).slice(0, 51);
  }
  async get(kind: StateKind, owner: string, id: string): Promise<StateRow | null> {
    return structuredClone(this.rows.get(this.key(kind, owner, id)) ?? null);
  }
  async append(kind: StateKind, owner: string, row: StateWrite): Promise<void> {
    const key = this.key(kind, owner, row.entity_id);
    const current = this.rows.get(key);
    if (!current || `${row.updated_at}:${row.version_id}` > `${current.updated_at}:${current.version_id}`) {
      this.rows.set(key, structuredClone(row));
    }
  }
}
