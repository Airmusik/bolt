import { useState } from 'react';
import { Trash2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useToast } from './useToast';
import { ConfirmDialog } from './ConfirmDialog';

export function DeleteListingButton({ id, onDeleted }: { id: string; onDeleted: () => void }) {
  const [confirm, setConfirm] = useState(false);
  const { toast } = useToast();
  const remove = async () => {
    try {
      const { error } = await supabase.rpc('delete_my_vehicle', { p_vehicle_id: id });
      if (error) throw error;
      toast('Listing removed. Existing chat and application history have been preserved.');
      onDeleted();
    } catch (error) { toast(error instanceof Error ? error.message : (error as { message?: string }).message || 'Could not delete listing. Please try again.', 'error'); }
  };
  return <>
    <button type="button" className="btn-ghost px-3 py-1.5 text-xs text-danger" onClick={() => setConfirm(true)}><Trash2 className="h-3.5 w-3.5" /> Delete listing</button>
    {confirm && <ConfirmDialog title="Delete this listing?" message="The car will no longer appear in searches or accept applications. Pending applications will be declined. Chat and application history stay saved for disputes. An active connection must be ended first. Any paid promotion is not automatically refunded; contact support about it." confirmLabel="Delete listing" danger onClose={() => setConfirm(false)} onConfirm={remove} />}
  </>;
}
