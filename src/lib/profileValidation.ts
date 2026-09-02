export function normalizePersonName(value: string) {
  return value.trim().replace(/\s+/g, ' ');
}

export function hasFirstAndSecondName(value: string) {
  const parts = normalizePersonName(value).split(' ').filter(Boolean);
  return parts.length >= 2 && parts.every((part) => part.length >= 2);
}

export function parseLanguages(value: string) {
  const seen = new Set<string>();
  return value
    .split(',')
    .map((language) => language.trim())
    .filter((language) => {
      const key = language.toLocaleLowerCase();
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}
