export function matchesLocation(actual: string | null | undefined, query: string): boolean {
  const wanted = query.trim().toLowerCase();
  if (!wanted) return true;
  const location = actual?.trim().toLowerCase();
  return Boolean(location && (location.includes(wanted) || wanted.includes(location)));
}

export function withinBudget(amount: number | null | undefined, maximum: string): boolean {
  if (!maximum.trim()) return true;
  const limit = Number(maximum);
  return Number.isFinite(limit) && limit >= 0 && amount != null && amount <= limit;
}

export function matchesPlatform(platforms: string[] | null | undefined, query: string): boolean {
  return !query || Boolean(platforms?.some(platform => platform.toLowerCase() === query.toLowerCase()));
}
