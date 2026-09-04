export const SPECIFIC_LOCATION_MESSAGE = 'Please choose a more specific area';

export function isBroadNairobi(value: string): boolean {
  const parts = value.toLowerCase().replace(/[.]/g, '').split(',').map(part => part.trim()).filter(Boolean);
  return parts.some(part => /^(nairobi|nairobi city|nairobi county|nairobi city county|city of nairobi)$/.test(part))
    && parts.every(part => /^(nairobi|nairobi city|nairobi county|nairobi city county|city of nairobi|kenya)$/.test(part));
}
