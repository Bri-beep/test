import { demoComparison } from "../demo";
import type { PeriodSelection } from "../periods";
import { comparisonLimits } from "./limits";

// This showcase is always synthetic, including when other features use Databricks.
export function getComparisonDemo(selection: PeriodSelection) {
  return comparisonLimits(() => demoComparison(selection));
}
