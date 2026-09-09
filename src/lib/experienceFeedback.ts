export type FeedbackKind = 'site' | 'chat';
export const FEEDBACK_SUBMITTED_EVENT = '11drive:feedback-submitted';
export const feedbackStorageKey = (userId: string, kind: FeedbackKind) => `11drive:feedback:${userId}:${kind}`;
export const feedbackCooldownMs = (kind: FeedbackKind) => (kind === 'chat' ? 7 : 30) * 86400000;
export function feedbackIsRecent(submittedAt: string | null | undefined, kind: FeedbackKind, now = Date.now()) {
  if (!submittedAt) return false;
  const timestamp = Date.parse(submittedAt);
  return Number.isFinite(timestamp) && timestamp <= now && now - timestamp < feedbackCooldownMs(kind);
}
export function feedbackRoute(pathname: string): { allowed: boolean; conversationId?: string } {
  const conversationId = /^\/chat\/([0-9a-f-]{36})$/i.exec(pathname)?.[1];
  return { allowed: !!conversationId || ['/', '/dashboard', '/notifications', '/chat', '/help', '/updates', '/browse-cars', '/browse-drivers'].includes(pathname), conversationId };
}
