export type DiscoveryIntent = 'car' | 'driver';

export function buildDiscoveryUrl(intent: DiscoveryIntent, query: string, location: string) {
  const params = new URLSearchParams();
  if (location.trim()) params.set('location', location.trim());
  // A make/model query must never leak into driver filters when switching intent.
  if (intent === 'car' && query.trim()) params.set('q', query.trim());
  const destination = intent === 'driver' ? '/browse-drivers' : '/browse-cars';
  return params.size ? `${destination}?${params.toString()}` : destination;
}
