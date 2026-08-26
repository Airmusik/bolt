export const NOTIFICATIONS_CHANGED_EVENT = 'garilink:notifications-changed';

export function notifyUnreadCountChanged() {
  window.dispatchEvent(new Event(NOTIFICATIONS_CHANGED_EVENT));
}
