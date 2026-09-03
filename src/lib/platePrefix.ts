export function normalizePlatePrefix(value: string) {
  return value.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 3);
}
export function validPlatePrefix(value: string) {
  return /^[A-Z]{3}$/.test(value);
}
