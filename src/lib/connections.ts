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
  _requesterId: string,
  recipientId: string,
  message?: string,
  vehicleId?: string,
): Promise<{ connection: Connection | null; error: string | null }> {
  const { data, error } = await supabase.rpc('request_connection', {
    p_recipient_id: recipientId,
    p_message: message || null,
    p_vehicle_id: vehicleId || null,
  });
  if (error) {
    return { connection: null, error: error.message };
  }
  return { connection: data as Connection, error: null };
}

export async function endConnection(connectionId: string): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('end_connection', { p_connection_id: connectionId });
  return { error: error?.message ?? null };
}

export async function updateConnectionStatus(
  connectionId: string,
  status: 'accepted' | 'rejected' | 'withdrawn',
): Promise<{ conversationId: string | null; error: string | null }> {
  const { data, error } = await supabase.rpc('transition_connection', {
    p_connection_id: connectionId,
    p_status: status,
  });
  return {
    conversationId: (data as string | null) ?? null,
    error: error?.message ?? null,
  };
}
