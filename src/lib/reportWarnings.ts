import type { UserWarning } from './types';

// A unique report_id makes PostgREST embed this relation as an object, while
// older schemas returned an array. Keep a consistent shape for every report UI.
export function normalizeReportWarnings<T extends { warnings?: UserWarning | UserWarning[] | null }>(report: T) {
  const warnings = report.warnings;
  return { ...report, warnings: Array.isArray(warnings) ? warnings : warnings ? [warnings] : [] };
}
