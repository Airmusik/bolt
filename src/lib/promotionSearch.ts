export type LivePromotion = { id: string; kind: 'listing' | 'profile'; target_id: string; expires_at: string };

export function matchingPromotions(campaigns: LivePromotion[], kind: string, id: string, ownerId?: string, now = Date.now()) {
  return campaigns.filter(c => Date.parse(c.expires_at) > now && ((c.kind === kind && c.target_id === id) || (kind === 'listing' && c.kind === 'profile' && c.target_id === ownerId)));
}

// Only use records already returned by public discovery and eligible for promotion.
// Campaign IDs alone must never fetch or expose hidden records.
export function splitPromotedSearch<T extends { id: string; owner_id?: string }>(eligible: T[], matches: T[], campaigns: LivePromotion[], kind: string, now = Date.now()) {
  const matchIds = new Set(matches.map(item => item.id));
  const promoted = [...new Map(eligible
    .filter(item => matchingPromotions(campaigns, kind, item.id, item.owner_id, now).length > 0)
    .map(item => [item.id, item])).values()]
    .sort((a, b) => Number(matchIds.has(b.id)) - Number(matchIds.has(a.id)));
  const promotedIds = new Set(promoted.map(item => item.id));
  return {
    promoted,
    results: [...new Map(matches.filter(item => !promotedIds.has(item.id)).map(item => [item.id, item])).values()],
    matchingPromoted: promoted.filter(item => matchIds.has(item.id)).length,
  };
}
