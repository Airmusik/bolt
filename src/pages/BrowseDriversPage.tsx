import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { MapPin, Languages, Briefcase } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import type { Profile } from '@/lib/types';
import { Avatar } from '@/components/Avatar';
import { Rating } from '@/components/Rating';
import { VerifiedBadge } from '@/components/VerifiedBadge';
import { EmptyState } from '@/components/EmptyState';
import { ALL_LOCATIONS } from '@/lib/locations';
import { titleCase } from '@/lib/utils';

const PLATFORMS = ['uber', 'bolt', 'little', 'faras'];

export function BrowseDriversPage() {
  const [drivers, setDrivers] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [location, setLocation] = useState('');
  const [platform, setPlatform] = useState('');
  const [verifiedOnly, setVerifiedOnly] = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from('profiles')
        .select('*')
        .eq('role', 'driver')
        .order('is_verified', { ascending: false })
        .order('rating', { ascending: false })
        .order('created_at', { ascending: false });
      setDrivers((data as Profile[]) || []);
      setLoading(false);
    })();
  }, []);

  const filtered = useMemo(() => {
    return drivers.filter((d) => {
      if (location && d.location !== location) return false;
      if (platform && !(d.platforms_worked || []).includes(platform)) return false;
      if (verifiedOnly && !d.is_verified) return false;
      return true;
    });
  }, [drivers, location, platform, verifiedOnly]);

  return (
    <div className="container-content py-8">
      <h1 className="font-display text-2xl font-bold text-ink-900">Browse drivers</h1>
      <p className="mt-1 text-sm text-ink-500">{filtered.length} driver{filtered.length !== 1 ? 's' : ''}</p>

      <div className="mt-6 flex flex-wrap gap-3">
        <select value={location} onChange={(e) => setLocation(e.target.value)} className="input w-auto py-2">
          <option value="">All locations</option>
          {ALL_LOCATIONS.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        <select value={platform} onChange={(e) => setPlatform(e.target.value)} className="input w-auto py-2">
          <option value="">All platforms</option>
          {PLATFORMS.map((p) => <option key={p} value={p}>{titleCase(p)}</option>)}
        </select>
        <label className="flex items-center gap-2 rounded-xl bg-white px-4 py-2 text-sm text-ink-700 ring-1 ring-ink-200">
          <input type="checkbox" checked={verifiedOnly} onChange={(e) => setVerifiedOnly(e.target.checked)} className="h-4 w-4 rounded border-ink-300 text-brand-600 focus:ring-brand-500" />
          Verified only
        </label>
      </div>

      <div className="mt-6">
        {loading ? (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {Array.from({ length: 8 }).map((_, i) => <div key={i} className="card h-48" />)}
          </div>
        ) : filtered.length > 0 ? (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {filtered.map((d) => (
              <Link key={d.id} to={`/drivers/${d.id}`} className="card card-hover p-5">
                <div className="flex items-center gap-3">
                  <Avatar name={d.full_name} src={d.avatar_url} size={56} verified={d.is_verified} />
                  <div className="min-w-0">
                    <p className="flex items-center gap-1 truncate font-semibold text-ink-900">
                      {d.full_name} <VerifiedBadge verified={d.is_verified} size={13} />
                    </p>
                    <p className="flex items-center gap-1 text-xs text-ink-500"><MapPin className="h-3 w-3" /> {d.location || 'Kenya'}</p>
                  </div>
                </div>
                <Rating value={d.rating} size={13} showValue count={d.rating_count} className="mt-3" />
                <div className="mt-3 space-y-1.5 text-xs text-ink-500">
                  <p className="flex items-center gap-1.5"><Briefcase className="h-3.5 w-3.5" /> {d.driving_experience_years} yrs experience</p>
                  {d.languages?.length > 0 && (
                    <p className="flex items-center gap-1.5"><Languages className="h-3.5 w-3.5" /> {d.languages.slice(0, 3).join(', ')}</p>
                  )}
                </div>
                <div className="mt-3 flex flex-wrap gap-1">
                  {(d.platforms_worked || []).slice(0, 4).map((p) => (
                    <span key={p} className="badge-neutral">{titleCase(p)}</span>
                  ))}
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <EmptyState title="No drivers found" description="Try adjusting your filters." />
        )}
      </div>
    </div>
  );
}
