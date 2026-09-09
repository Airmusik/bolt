import { useEffect, useState } from 'react';
import { Send } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { Modal } from './Modal';

export function ConnectionRequestDialog({ ownerId, vehicleId, sending, onSend, onClose }: {
  ownerId: string; vehicleId?: string; sending: boolean;
  onSend: (message: string, vehicleId: string) => Promise<void>; onClose: () => void;
}) {
  const [cars, setCars] = useState<{ id: string; make: string; model: string; year: number }[]>([]);
  const [selected, setSelected] = useState(vehicleId || '');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        let query = supabase.from('vehicles').select('id,make,model,year').eq('owner_id', ownerId)
          .eq('status', 'active').eq('availability', 'available').eq('approval_status', 'approved')
          .eq('document_listing_visibility', 'public').is('deleted_at', null).order('created_at', { ascending: false });
        if (vehicleId) query = query.eq('id', vehicleId);
        const { data, error: failure } = await query;
        if (failure) throw failure;
        if (!active) return;
        setCars(data || []);
        if (data?.length === 1) setSelected(data[0].id);
      } catch {
        if (active) setError('Could not load live cars. Close this window and try again.');
      } finally { if (active) setLoading(false); }
    };
    void load();
    return () => { active = false; };
  }, [ownerId, vehicleId]);
  const validSelection = cars.some(car => car.id === selected);
  return <Modal title="Send connection request" onClose={onClose}>
    <label className="label" htmlFor="connection-car">Car for this connection</label>
    <select id="connection-car" className="input" value={selected} onChange={e => setSelected(e.target.value)} disabled={loading || sending || !!vehicleId}>
      <option value="">{loading ? 'Loading live cars…' : 'Choose a live car'}</option>
      {cars.map(car => <option key={car.id} value={car.id}>{car.make} {car.model} · {car.year}</option>)}
    </select>
    <p className="mb-4 mt-1 text-xs text-ink-500">A connection is for one car. Other live cars from this owner remain open to other drivers.</p>
    {error && <p role="alert" className="mb-3 text-sm text-danger">{error}</p>}
    {!loading && !error && cars.length === 0 && <p role="status" className="mb-3 text-sm text-ink-600">There are no live cars available for this request. The owner must make an approved listing live first.</p>}
    <label className="label" htmlFor="connection-introduction">Introduction (optional)</label>
    <textarea id="connection-introduction" value={message} onChange={e => setMessage(e.target.value)} rows={3} maxLength={1000} placeholder="Introduce yourself…" className="input" disabled={sending} />
    <button type="button" onClick={() => void onSend(message, selected)} disabled={sending || loading || !validSelection || !!error} className="btn-primary mt-4 w-full">
      {sending ? 'Sending…' : 'Send request'} <Send className="h-4 w-4" />
    </button>
  </Modal>;
}
