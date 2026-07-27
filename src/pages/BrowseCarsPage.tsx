import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { SlidersHorizontal, X, Search, MapPin } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import type { VehicleWithRelations } from '@/lib/types';
import { VehicleCard } from '@/components/VehicleCard';
import { EmptyState } from '@/components/EmptyState';
import { ALL_LOCATIONS, VEHICLE_MAKES } from '@/lib/locations';

const FUELS = ['petrol', 'diesel', 'hybrid', 'electric'];
const TRANSMISSIONS = ['automatic', 'manual'];

interface Filters {
  q: string;
  location: string;
  make: string;
  transmission: string;
  fuel: string;
  maxWeekly: string;
  maxDeposit: string;
  verifiedOnly: boolean;
  availableNow: boolean;
}

export function BrowseCarsPage() {
  const [params] = useSearchParams();
  const [vehicles, setVehicles] = useState<VehicleWithRelations[]>([]);
  const [loading, setLoading] = useState(true);
  const [showFilters, setShowFilters] = useState(false);

  const [filters, setFilters] = useState<Filters>({
    q: params.get('q') || '',
    location: params.get('location') || '',
    make: '',
    transmission: '',
    fuel: '',
    maxWeekly: '',
    maxDeposit: '',
    verifiedOnly: false,
    availableNow: false,
  });

  useEffect(() => {
    (async () => {
      setLoading(true);
      const { data } = await supabase
        .from('vehicles')
        .select('*, owner:profiles(*), photos:vehicle_photos(*), issues:vehicle_issues(*)')
        .eq('status', 'active')
        .order('created_at', { ascending: false });
      setVehicles((data as VehicleWithRelations[]) || []);
      setLoading(false);
    })();
  }, []);

  const filtered = useMemo(() => {
    return vehicles.filter((v) => {
      if (filters.q) {
        const q = filters.q.toLowerCase();
        const hay = `${v.make} ${v.model} ${v.location}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (filters.location && v.location !== filters.location) return false;
      if (filters.make && v.make !== filters.make) return false;
      if (filters.transmission && v.transmission !== filters.transmission) return false;
      if (filters.fuel && v.fuel_type !== filters.fuel) return false;
      if (filters.maxWeekly && (v.weekly_target ?? 0) > Number(filters.maxWeekly)) return false;
      if (filters.maxDeposit && v.deposit > Number(filters.maxDeposit)) return false;
      if (filters.verifiedOnly && !v.owner?.is_verified) return false;
      if (filters.availableNow && v.availability !== 'available') return false;
      return true;
    });
  }, [vehicles, filters]);

  const activeCount = Object.entries(filters).filter(([k, val]) => k !== 'q' && val && val !== false && val !== '').length;

  return (
    <div className="container-content py-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-ink-900">Browse cars</h1>
          <p className="mt-1 text-sm text-ink-500">{filtered.length} vehicle{filtered.length !== 1 ? 's' : ''} available</p>
        </div>
        <button
          onClick={() => setShowFilters((v) => !v)}
          className="btn-secondary lg:hidden"
        >
          <SlidersHorizontal className="h-4 w-4" /> Filters {activeCount > 0 && <span className="badge-brand">{activeCount}</span>}
        </button>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[260px_1fr]">
        {/* Filters */}
        <aside className={`${showFilters ? 'block' : 'hidden'} lg:block`}>
          <div className="card sticky top-20 p-5">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-ink-900">Filters</h2>
              {activeCount > 0 && (
                <button onClick={() => setFilters({ q: filters.q, location: '', make: '', transmission: '', fuel: '', maxWeekly: '', maxDeposit: '', verifiedOnly: false, availableNow: false })} className="text-xs font-medium text-brand-700 hover:underline">
                  Clear all
                </button>
              )}
            </div>

            <div className="mt-4 space-y-4">
              <div>
                <label className="label">Search</label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
                  <input value={filters.q} onChange={(e) => setFilters({ ...filters, q: e.target.value })} placeholder="Make, model…" className="input pl-9 py-2" />
                </div>
              </div>
              <Select label="Location" value={filters.location} onChange={(v) => setFilters({ ...filters, location: v })} options={ALL_LOCATIONS} placeholder="All locations" icon />
              <Select label="Make" value={filters.make} onChange={(v) => setFilters({ ...filters, make: v })} options={VEHICLE_MAKES} placeholder="All makes" />
              <Select label="Transmission" value={filters.transmission} onChange={(v) => setFilters({ ...filters, transmission: v })} options={TRANSMISSIONS} placeholder="Any" />
              <Select label="Fuel" value={filters.fuel} onChange={(v) => setFilters({ ...filters, fuel: v })} options={FUELS} placeholder="Any" />
              <div>
                <label className="label">Max weekly target (KES)</label>
                <input type="number" value={filters.maxWeekly} onChange={(e) => setFilters({ ...filters, maxWeekly: e.target.value })} placeholder="No limit" className="input py-2" />
              </div>
              <div>
                <label className="label">Max deposit (KES)</label>
                <input type="number" value={filters.maxDeposit} onChange={(e) => setFilters({ ...filters, maxDeposit: e.target.value })} placeholder="No limit" className="input py-2" />
              </div>
              <label className="flex items-center gap-2 text-sm text-ink-700">
                <input type="checkbox" checked={filters.verifiedOnly} onChange={(e) => setFilters({ ...filters, verifiedOnly: e.target.checked })} className="h-4 w-4 rounded border-ink-300 text-brand-600 focus:ring-brand-500" />
                Verified owners only
              </label>
              <label className="flex items-center gap-2 text-sm text-ink-700">
                <input type="checkbox" checked={filters.availableNow} onChange={(e) => setFilters({ ...filters, availableNow: e.target.checked })} className="h-4 w-4 rounded border-ink-300 text-brand-600 focus:ring-brand-500" />
                Available immediately
              </label>
            </div>
          </div>
        </aside>

        {/* Results */}
        <div>
          {loading ? (
            <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="card overflow-hidden">
                  <div className="aspect-[16/10] bg-ink-100" />
                  <div className="space-y-3 p-4"><div className="h-4 w-2/3 rounded bg-ink-100" /><div className="h-3 w-1/2 rounded bg-ink-100" /></div>
                </div>
              ))}
            </div>
          ) : filtered.length > 0 ? (
            <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
              {filtered.map((v) => <VehicleCard key={v.id} vehicle={v} />)}
            </div>
          ) : (
            <EmptyState
              title="No vehicles match your filters"
              description="Try widening your search or clearing some filters."
              action={<button onClick={() => setFilters({ q: '', location: '', make: '', transmission: '', fuel: '', maxWeekly: '', maxDeposit: '', verifiedOnly: false, availableNow: false })} className="btn-secondary">Clear filters</button>}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function Select({ label, value, onChange, options, placeholder, icon }: { label: string; value: string; onChange: (v: string) => void; options: string[]; placeholder: string; icon?: boolean }) {
  return (
    <div>
      <label className="label">{label}</label>
      <div className="relative">
        {icon && <MapPin className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />}
        <select value={value} onChange={(e) => onChange(e.target.value)} className={`input py-2 ${icon ? 'pl-9' : ''} appearance-none`}>
          <option value="">{placeholder}</option>
          {options.map((o) => <option key={o} value={o}>{o.charAt(0).toUpperCase() + o.slice(1)}</option>)}
        </select>
      </div>
    </div>
  );
}
