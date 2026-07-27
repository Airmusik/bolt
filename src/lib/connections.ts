import { supabase } from './supabase';
import type { Connection } from './types';

export async function getConnectionBetween(userId: string, otherId: string): Promise<Connection | null> {
  const { data } = await supabase
    .from('connections')
    .select('*')
    .or(`and(requester_id.eq.${userId},recipient_id.eq.${otherId}),and(requester_id.eq.${otherId},recipient_id.eq.${userId})`)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as Connection) || null;
}

export async function sendConnectionRequest(
  requesterId: string,
  recipientId: string,
  message?: string,
  vehicleId?: string,
): Promise<{ connection: Connection | null; error: string | null }> {
  const { data, error } = await supabase
    .from('connections')
    .insert({
      requester_id: requesterId,
      recipient_id: recipientId,
      message: message || null,
      vehicle_id: vehicleId || null,
    })
    .select()
    .maybeSingle();
  if (error) {
    if (error.code === '23505') {
      return { connection: null, error: 'You already have a pending connection with this member.' };
    }
    return { connection: null, error: error.message };
  }
  const conn = data as Connection;
  // notify recipient
  await supabase.from('notifications').insert({
    user_id: recipientId,
    type: 'connection_request',
    title: 'New connection request',
    body: 'You have a new connection request on GariLink.',
    data: { connection_id: conn.id },
  });
  return { connection: conn, error: null };
}

export async function updateConnectionStatus(
  connectionId: string,
  status: 'accepted' | 'rejected' | 'withdrawn',
): Promise<{ conversationId: string | null; error: string | null }> {
  const { data: conn, error } = await supabase
    .from('connections')
    .update({ status })
    .eq('id', connectionId)
    .select()
    .maybeSingle();
  if (error) return { conversationId: null, error: error.message };
  if (!conn) return { conversationId: null, error: 'Connection not found.' };

  const c = conn as Connection;
  if (status === 'accepted') {
    // determine driver/owner ordering
    const requesterId = c.requester_id;
    const recipientId = c.recipient_id;
    // fetch roles to assign driver_id / owner_id correctly
    const { data: req } = await supabase.from('profiles').select('role').eq('id', requesterId).maybeSingle();
    const { data: rec } = await supabase.from('profiles').select('role').eq('id', recipientId).maybeSingle();
    const reqRole = (req as any)?.role;
    const recRole = (rec as any)?.role;
    let driverId = requesterId;
    let ownerId = recipientId;
    if (reqRole === 'owner' && recRole === 'driver') { ownerId = requesterId; driverId = recipientId; }
    else if (reqRole === 'driver' && recRole === 'owner') { driverId = requesterId; ownerId = recipientId; }

    const { data: existingConv } = await supabase
      .from('conversations')
      .select('id')
      .eq('connection_id', c.id)
      .maybeSingle();
    if (existingConv) return { conversationId: (existingConv as any).id, error: null };

    const { data: conv, error: convErr } = await supabase
      .from('conversations')
      .insert({
        connection_id: c.id,
        vehicle_id: c.vehicle_id,
        driver_id: driverId,
        owner_id: ownerId,
      })
      .select()
      .maybeSingle();
    if (convErr) return { conversationId: null, error: convErr.message };
    // notify requester
    await supabase.from('notifications').insert({
      user_id: requesterId,
      type: 'connection_accepted',
      title: 'Connection accepted',
      body: 'Your connection request was accepted. You can now chat.',
      data: { connection_id: c.id, conversation_id: (conv as any)?.id },
    });
    return { conversationId: (conv as any)?.id ?? null, error: null };
  }
  return { conversationId: null, error: null };
}
