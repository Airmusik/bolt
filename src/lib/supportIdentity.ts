import type { Conversation, Profile } from './types';

export function isSupportPartner(conversation: Pick<Conversation, 'admin_id' | 'driver_id' | 'owner_id'>, userId?: string, partner?: Pick<Profile, 'role'> | null) {
  return partner?.role === 'admin' || Boolean(conversation.admin_id && conversation.admin_id !== userId && !(conversation.driver_id && conversation.owner_id));
}
