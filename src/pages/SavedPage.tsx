import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import type { VehicleWithRelations } from '@/lib/types';
import { VehicleCard } from '@/components/VehicleCard';
import { EmptyState } from '@/components/EmptyState';
import { Link } from 'react-router-dom';

export function SavedPage() {
  const { user } = useAuth();
  const [vehicles, setVehicles] = useState<VehicleWithRelations[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      if (!user) return;
      const { data: favs } = await supabase.from('favorites').select('vehicle_id').eq('user_id', user.id);
      const ids = (favs || []).map((f) => f.vehicle_id);
      if (ids.length === 0) { setVehicles([]); setLoading(false); return; }
      const { data: v } = await supabase
        .from('vehicles')
        .select('*, owner:profiles(*), photos:vehicle_photos(*), issues:vehicle_issues(*)')
        .in('id', ids)
        .order('created_at', { ascending: false });
      setVehicles((v as VehicleWithRelations[]) || []);
      setLoading(false);
    })();
  }, [user]);

  return (
    <div className="container-content py-8">
      <h1 className="font-display text-2xl font-bold text-ink-900">Saved listings</h1>
      <p className="mt-1 text-sm text-ink-500">Vehicles you've saved for later.</p>
      <div className="mt-6">
        {loading ? <div className="card h-48 animate-pulse" /> : vehicles.length === 0 ? (
          <EmptyState title="No saved listings" description="Tap the heart on any vehicle to save it here." action={<Link to="/browse-cars" className="btn-primary">Browse cars</Link>} />
        ) : (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{vehicles.map((v) => <VehicleCard key={v.id} vehicle={v} />)}</div>
        )}
      </div>
    </div>
  );
}
