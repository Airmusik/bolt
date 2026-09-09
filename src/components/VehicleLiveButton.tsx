import { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import type { Vehicle } from '@/lib/types';
import { supabase } from '@/lib/supabase';
import { isVehicleLive } from '@/lib/vehicleAvailability';
import { useToast } from './useToast';
import { ConfirmDialog } from './ConfirmDialog';

export function VehicleLiveButton({ vehicle, onChanged }: { vehicle: Vehicle; onChanged: () => void }) {
  const [confirming, setConfirming] = useState(false);
  const { toast } = useToast();
  const live = isVehicleLive(vehicle);
  const canGoLive = vehicle.approval_status === 'approved' && (!vehicle.document_listing_visibility || vehicle.document_listing_visibility === 'public') && !vehicle.deleted_at;
  const change = async () => {
    try {
      const { error } = await supabase.rpc('set_my_vehicle_live', { p_vehicle_id: vehicle.id, p_live: !live });
      if (error) throw error;
      toast(live ? 'Listing is now not live. Existing chats are unchanged.' : 'Listing is live and can receive requests.');
      onChanged();
    } catch (error) {
      toast(error instanceof Error ? error.message : (error as { message?: string })?.message || 'Could not change listing status. Please try again.', 'error');
    }
  };
  return <>
    <button type="button" onClick={() => setConfirming(true)} disabled={!live && !canGoLive} className="btn-secondary px-3 py-1.5 text-xs" title={!canGoLive ? 'Admin approval and public listing access are required to go live.' : undefined}>
      {live ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />} {live ? 'Set not live' : 'Set live'}
    </button>
    {confirming && <ConfirmDialog title={live ? 'Set this listing not live?' : 'Set this listing live?'} confirmLabel={live ? 'Set not live' : 'Set live'}
      message={live ? 'This car will be removed from browsing and cannot receive new requests. Existing chats and your other listings are not affected.' : 'This approved car will appear in browsing and can receive connection requests. A car with an active connection cannot be made live until that connection ends.'}
      onConfirm={change} onClose={() => setConfirming(false)} />}
  </>;
}
