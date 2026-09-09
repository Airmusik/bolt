export function mergeSettingsDraft<T extends Record<string, string>>(draft: T, previous: T, current: T): T {
  const merged = { ...current };
  for (const key of Object.keys(draft) as (keyof T)[]) {
    if (draft[key] !== previous[key]) merged[key] = draft[key];
  }
  return merged;
}

export function changedSettings<T extends Record<string, string>>(draft: T, baseline: T, keys: readonly string[]) {
  return Object.entries(draft).filter(([key, value]) => keys.includes(key) && baseline[key] !== value);
}
