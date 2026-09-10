/** Only a notification UUID is accepted from the update-email URL. */
export function updateFromSearch(search: string) {
  const id = new URLSearchParams(search).get('update');
  return id && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id) ? id : null;
}
