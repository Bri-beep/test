import { z } from "zod";
import { civilDateSchema } from "./periods";

export const MAX_COMPARISON_ROWS = 1_000;
export const MAX_COMPARISON_SEGMENTS = 50;
export const aggregationSchema = z.enum(["count", "sum", "avg"]);
export type ComparisonAggregation = z.infer<typeof aggregationSchema>;

const numericValue = z.union([z.number(), z.string().regex(/^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/)])
  .transform((value) => Number(value)).pipe(z.number().finite());

// Sufficient statistics preserve weighted averages across days and segments.
export const comparisonRowSchema = z.object({
  period: z.enum(["current", "reference"]),
  day: civilDateSchema,
  segment: z.string().max(200).nullable(),
  value_sum: numericValue.nullable(),
  row_count: numericValue.pipe(z.number().int().positive().max(Number.MAX_SAFE_INTEGER)),
  value_count: numericValue.pipe(z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER)),
}).strict().refine((row) =>
  row.value_count <= row.row_count && (row.value_count === 0 ? row.value_sum === null : row.value_sum !== null),
"Invalid aggregated measure counts.");
export type ComparisonRow = z.infer<typeof comparisonRowSchema>;

const periodSchema = z.object({ start: civilDateSchema, end: civilDateSchema, days: z.number().int().min(1).max(366) }).strict();
const measureSchema = z.object({
  value: z.number().finite().nullable(), rowCount: z.number().int().nonnegative(), missingValues: z.number().int().nonnegative(),
}).strict();
export const completeCoverageSchema = z.object({ start: civilDateSchema, end: civilDateSchema }).strict()
  .refine((value) => value.start <= value.end, "Invalid complete coverage interval.");
export type CompleteCoverage = z.infer<typeof completeCoverageSchema>;

export const comparisonResultSchema = z.object({
  status: z.enum(["demo", "ok"]),
  label: z.string().min(1).max(100),
  unit: z.string().min(1).max(30),
  aggregation: aggregationSchema,
  sourceLabel: z.string().min(1).max(200),
  availableSegments: z.array(z.object({ id: z.string(), label: z.string() }).strict()).max(MAX_COMPARISON_SEGMENTS),
  filterLabel: z.string().nullable(),
  periods: z.object({ current: periodSchema, reference: periodSchema }).strict(),
  current: measureSchema,
  reference: measureSchema,
  change: z.object({
    absolute: z.number().finite().nullable(), percent: z.number().finite().nullable(),
    reason: z.enum(["ok", "missing", "zero-reference", "negative-reference"]),
  }).strict(),
  series: z.array(z.object({
    position: z.string(), currentDate: civilDateSchema.nullable(), referenceDate: civilDateSchema.nullable(),
    current: z.number().finite().nullable(), reference: z.number().finite().nullable(),
  }).strict()).max(366),
  segments: z.array(z.object({
    id: z.string(), label: z.string(), current: z.number().finite().nullable(), reference: z.number().finite().nullable(),
    delta: z.number().finite().nullable(),
  }).strict()).max(MAX_COMPARISON_SEGMENTS),
  waterfall: z.object({
    start: z.number().finite(), end: z.number().finite(),
    contributions: z.array(z.object({ id: z.string(), label: z.string(), value: z.number().finite() }).strict()).max(MAX_COMPARISON_SEGMENTS),
  }).strict().nullable(),
  warnings: z.array(z.string()).max(12),
  completeCoverage: completeCoverageSchema.nullable(),
}).strict();
export type ComparisonResult = z.infer<typeof comparisonResultSchema>;
