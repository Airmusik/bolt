import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { PUBLIC_PROFILE_FIELDS } from '@/lib/profileSelect';
import { useAuth } from '@/lib/useAuth';
import type { VehicleWithRelations } from '@/lib/types';
import { VehicleCard } from '@/components/VehicleCard';
import { EmptyState } from '@/components/EmptyState';
import { Link } from 'react-router-dom';
import { BackButton } from '@/components/BackButton';

export function SavedPage() {
  const { user } = useAuth();
  const [vehicles, setVehicles] = useState<VehicleWithRelations[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  const loadSaved = useCallback(async () => {
    if (!user) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setLoadError('');
    const { data: favs, error: favoritesError } = await supabase.from('favorites').select('vehicle_id').eq('user_id', user.id);
    if (favoritesError) {
      setLoadError(favoritesError.message);
      setLoading(false);
      return;
    }
    const ids = (favs || []).map((f) => f.vehicle_id);
    if (ids.length === 0) { setVehicles([]); setLoading(false); return; }
    const { data: vehiclesData, error: vehiclesError } = await supabase
      .from('vehicles')
      .select(`*, owner:profiles!vehicles_owner_id_fkey(${PUBLIC_PROFILE_FIELDS}), photos:vehicle_photos(*), issues:vehicle_issues(*)`)
      .in('id', ids)
      .order('created_at', { ascending: false });
    if (vehiclesError) {
      setLoadError(vehiclesError.message);
      setLoading(false);
      return;
    }
    setVehicles((vehiclesData as VehicleWithRelations[]) || []);
    setLoading(false);
  }, [user]);

  useEffect(() => { void loadSaved(); }, [loadSaved]);

  return (
    <div className="container-content py-8">
      <BackButton to="/dashboard" />
      <h1 className="mt-4 font-display text-2xl font-bold text-ink-900">Saved listings</h1>
      <p className="mt-1 text-sm text-ink-500">Vehicles you've saved for later.</p>
      <div className="mt-6">
        {loading ? <div className="card h-48 animate-pulse" /> : loadError ? (
          <EmptyState title="Could not load saved listings" description="Check your connection and try again." action={<button type="button" onClick={() => void loadSaved()} className="btn-primary">Try again</button>} />
        ) : vehicles.length === 0 ? (
          <EmptyState title="No saved listings" description="Tap the heart on any vehicle to save it here." action={<Link to="/browse-cars" className="btn-primary">Browse cars</Link>} />
        ) : (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{vehicles.map((v) => <VehicleCard key={v.id} vehicle={v} />)}</div>
        )}
      </div>
    </div>
  );
}
