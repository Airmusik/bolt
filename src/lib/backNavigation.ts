/** Full-page same-site links may reset React Router's index to zero. */
export function hasPreviousSitePage(index: unknown, historyLength: number, referrer: string, currentUrl: string): boolean {
  if (typeof index === 'number' && index > 0) return true;
  if (historyLength < 2 || !referrer) return false;
  try {
    const previous = new URL(referrer);
    const current = new URL(currentUrl);
    return previous.origin === current.origin && previous.href !== current.href;
  } catch { return false; }
}
