export function normalizePersonName(value: string) {
  return value.trim().replace(/\s+/g, ' ');
}

// Existing profiles store one display name. Keep all remaining names together
// when prefilling the second field so editing never discards a middle name.
export function splitPersonName(value: string) {
  const [firstName = '', ...remainingNames] = normalizePersonName(value).split(' ');
  return { firstName, secondName: remainingNames.join(' ') };
}

export function hasValidNameFields(firstName: string, secondName: string) {
  return normalizePersonName(firstName).length >= 2
    && normalizePersonName(secondName).length >= 2
    && hasFirstAndSecondName(`${firstName} ${secondName}`);
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
