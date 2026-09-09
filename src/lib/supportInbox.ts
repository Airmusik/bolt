/** A single member-facing inbox. Old support links keep their message/topic. */
export function supportInboxPath(search: string | URLSearchParams = '') {
  const previous = new URLSearchParams(search);
  const next = new URLSearchParams({ view: 'support' });
  for (const key of ['message', 'topic']) {
    const value = previous.get(key);
    if (value) next.set(key, value);
  }
  return `/chat?${next}`;
}
