// Keep administrator-entered assistant destinations inside this app.
export function isAssistantPagePath(value: string): boolean {
  const path = value.trim();
  return (
    !path ||
    (path.startsWith("/") &&
      !path.startsWith("//") &&
      !Array.from(path).some((character) => character.charCodeAt(0) <= 32 || character === "\\") &&
      !/%(?:2f|5c|0[0-9a-f]|1[0-9a-f]|20)/i.test(path))
  );
}

export function assistantDisplayOrder(value: string): number | null {
  if (!/^\d+$/.test(value.trim())) return null;
  const order = Number(value);
  return Number.isSafeInteger(order) && order <= 100000 ? order : null;
}
