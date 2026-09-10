export type CommunityMessage = {
  id: string;
  alias: string;
  member_role: "driver" | "owner" | "admin" | "member";
  body: string;
  created_at: string;
  removed: boolean;
  filtered: boolean;
  reply_to?: string | null;
  reactions?: Record<string, number>;
  pinned?: boolean;
  revision?: number;
};
export type CommunitySession = {
  enabled: boolean;
  alias: string;
  member_alias?: string;
  role: "driver" | "owner" | "admin";
  muted: boolean;
  muted_until?: string | null;
  muted_reason?: string | null;
  rules_accepted?: boolean;
  rules_version?: string;
  pinned_message?: CommunityMessage | null;
};
export type CommunityReport = CommunityMessage & {
  reports: number;
  reasons: string[];
};
export type CommunityModeration = {
  reports: CommunityReport[];
  muted: {
    alias: string;
    muted_until?: string | null;
    muted_reason?: string | null;
  }[];
};
export const COMMUNITY_LIMIT = 1000;
export const COMMUNITY_RULES_VERSION = "2026-09-10";
export const COMMUNITY_REACTIONS = ["👍", "💡", "👏", "❤️"] as const;

// Convenience preview only. PostgreSQL applies the same rules before storing
// or broadcasting a message, including clients that bypass this JavaScript.
export function filterCommunityText(value: string): string {
  let clean = value
    .normalize("NFKC")
    .replace(/[٠-٩۰-۹०-९]/g, (char) =>
      String("٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹०१२३४५६७८९".indexOf(char) % 10),
    )
    // Strip each formatting/combining code point independently, not graphemes.
    // eslint-disable-next-line no-misleading-character-class
    .replace(/[\u200B-\u200F\u202A-\u202E\u2060-\u206F\uFEFF\uFE0F\u20E3]/g, "")
    .replace(/(?:https?:\/\/|www\.)\S+/gi, "[Link removed]")
    .replace(
      /[\p{L}\p{N}_.+%-]+@[\p{L}\p{N}.-]+\.[\p{L}]{2,}/gu,
      "[Email removed]",
    );
  let words = clean.toLowerCase();
  [
    "zero|oh|sifuri",
    "one|moja",
    "two|mbili",
    "three|tatu",
    "four|nne",
    "five|tano",
    "six|sita",
    "seven|saba",
    "eight|nane",
    "nine|tisa",
  ].forEach((word, digit) => {
    words = words.replace(new RegExp(`\\b(${word})\\b`, "g"), String(digit));
  });
  if (
    words !== clean.toLowerCase() &&
    /[0-9](?:[^\p{L}\p{N}]*[0-9]){6,}/u.test(words)
  )
    return "[Phone number removed]";
  clean = clean.replace(
    /\+?[0-9](?:[^\p{L}\p{N}]*[0-9]){6,}/gu,
    "[Phone number removed]",
  );
  if (clean.replace(/[^0-9]/g, "").length >= 4)
    clean = clean.replace(
      /(?<![\p{L}\p{N}])\+?[0-9OoIlL](?:[^\p{L}\p{N}]*[0-9OoIlL]){6,}/gu,
      "[Phone number removed]",
    );
  return clean.trim();
}
export function validCommunityDraft(value: string) {
  const safe = filterCommunityText(value);
  return (
    value.length <= COMMUNITY_LIMIT &&
    safe.length > 0 &&
    !["[Phone number removed]", "[Link removed]", "[Email removed]"].includes(
      safe,
    )
  );
}
export function mergeCommunityMessages(
  previous: CommunityMessage[],
  incoming: CommunityMessage[],
) {
  const rows = new Map(previous.map((row) => [row.id, row]));
  incoming.forEach((row) => {
    if ((rows.get(row.id)?.revision || 0) > (row.revision || 0)) return;
    if (!rows.get(row.id)?.removed || row.removed) rows.set(row.id, row);
  });
  return [...rows.values()].sort(
    (a, b) =>
      a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id),
  );
}
export function communityError(error: unknown) {
  const raw =
    typeof error === "object" && error && "message" in error
      ? String(error.message)
      : "";
  for (const message of [
    "Community chat is paused by the administrator.",
    "Community chat is unavailable.",
    "You are muted in community chat. Contact support for help.",
    "Please slow down. Wait a few seconds before sending again.",
    "Phone numbers, email addresses and links are not allowed. Write a message without contact details.",
    "Report limit reached. Please contact support.",
    "This message cannot be reported.",
    "This member cannot be banned.",
    "Read and accept the community guidelines before posting.",
    "Please reload and read the latest community guidelines.",
    "That message is no longer available to reply to.",
    "That message is no longer available to react to.",
    "That message is no longer available to pin.",
    "Please wait a moment before reacting again.",
  ])
    if (raw.includes(message)) return message;
  return "Could not complete that action. Check your connection and try again. Your draft is still here.";
}
