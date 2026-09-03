import { PromotionLink as Link, PromotionBadge } from '@/components/PromotionLink';
import { usePromotionLive, usePromotionRanking } from '@/lib/promotionLive';
import { Fragment, useEffect, useMemo, useState } from 'react';
import { AdSlot } from '@/components/AdSlot';
import { useSearchParams } from 'react-router-dom';
import { MapPin, Languages, Briefcase } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import type { Profile } from '@/lib/types';
import { Avatar } from '@/components/Avatar';
import { Rating } from '@/components/Rating';
import { VerifiedBadge } from '@/components/VerifiedBadge';
import { EmptyState } from '@/components/EmptyState';
import { AvailabilityBadge } from '@/components/AvailabilityBadge';
import { ConnectionButton } from '@/components/ConnectionButton';
import { titleCase } from '@/lib/utils';
import { BackButton } from '@/components/BackButton';
import { useToast } from '@/components/useToast';
import { PlaceAutocomplete } from '@/components/PlaceAutocomplete';
import { matchesLocation, matchesPlatform } from '@/lib/searchMatching';

const PLATFORMS = ['uber', 'bolt', 'little', 'faras'];

export function BrowseDriversPage() {
  const { revision } = usePromotionLive();
  const { toast } = useToast();
  const [params] = useSearchParams();
  const [driversRaw, setDrivers] = useState<Profile[]>([]);
  const drivers = usePromotionRanking(driversRaw, 'profile');
  const [loading, setLoading] = useState(true);
  const [location, setLocation] = useState(() => params.get('location') || '');
  const [platform, setPlatform] = useState('');
  const [verifiedOnly, setVerifiedOnly] = useState(false);
  const [name, setName] = useState(() => params.get('q') || '');
  const [availableOnly, setAvailableOnly] = useState(false);

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase.rpc('discover_drivers');
      if (error) toast('Could not load drivers: ' + error.message, 'error');
      setDrivers((data as Profile[]) || []);
      setLoading(false);
    })();
  }, [toast, revision]);

  const filtered = useMemo(() => {
    return drivers.filter((d) => {
      if (name.trim() && !d.full_name.toLowerCase().includes(name.trim().toLowerCase())) return false;
      if (availableOnly && d.availability !== 'available') return false;
      if (!matchesLocation(d.location, location)) return false;
      if (!matchesPlatform(d.platforms_worked, platform)) return false;
      if (verifiedOnly && !d.platform_history_approved) return false;
      return true;
    });
  }, [drivers, location, platform, verifiedOnly, name, availableOnly]);

  return (
    <div className="container-content py-8">
      <BackButton to="/" />
      <h1 className="mt-4 font-display text-2xl font-bold text-ink-900">Browse drivers</h1>
      <p aria-live="polite" className="mt-1 text-sm text-ink-500">{loading ? 'Finding drivers…' : `${filtered.length} matching driver${filtered.length !== 1 ? 's' : ''}`}</p>

      <div className="mt-6 flex flex-wrap gap-3">
        <input aria-label="Search driver name" className="input w-full sm:w-60" placeholder="Driver name" value={name} onChange={e => setName(e.target.value)} />
        <div className="w-full sm:w-72"><PlaceAutocomplete value={location} onChange={setLocation} placeholder="All locations" className="py-2" /></div>
        <select aria-label="Driver platform" value={platform} onChange={(e) => setPlatform(e.target.value)} className="input w-auto py-2">
          <option value="">All platforms</option>
          {PLATFORMS.map((p) => <option key={p} value={p}>{titleCase(p)}</option>)}
        </select>
        <label className="flex items-center gap-2 rounded-xl bg-white px-4 py-2 text-sm text-ink-700 ring-1 ring-ink-200 dark:bg-[#141416]">
          <input type="checkbox" checked={verifiedOnly} onChange={(e) => setVerifiedOnly(e.target.checked)} className="h-4 w-4 rounded border-ink-300 text-brand-600 focus:ring-brand-500" />
          Approved history only
        </label>
        <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" checked={availableOnly} onChange={e => setAvailableOnly(e.target.checked)} />Available now</label>
        {(name || location || platform || verifiedOnly || availableOnly) && <button type="button" className="btn-secondary" onClick={() => { setName(''); setLocation(''); setPlatform(''); setVerifiedOnly(false); setAvailableOnly(false); }}>Clear filters</button>}
      </div>

      <div className="mt-6">
        {loading ? (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {Array.from({ length: 8 }).map((_, i) => <div key={i} className="card h-48" />)}
          </div>
        ) : filtered.length > 0 ? (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {filtered.map((d, index) => (
              <Fragment key={d.id}><div className="card card-hover flex h-full flex-col overflow-hidden border-t-2 border-t-emerald-400 p-4 sm:p-5">
                <Link to={`/drivers/${d.id}`}>
                  <div className="flex flex-wrap items-start gap-3">
                    <Avatar name={d.full_name} src={d.avatar_url} size={56} verified={d.platform_history_approved} />
                    <div className="min-w-0 flex-1">
                      <p className="break-words font-display text-base font-bold leading-snug text-ink-900">{d.full_name}</p>
                      <p className="flex items-center gap-1 text-xs text-ink-500"><MapPin className="h-3 w-3" /> {d.location || 'Location not provided'}</p>
                <p className="mt-1 text-xs text-ink-500">{d.age != null ? `${d.age} years old` : 'Age not provided'}</p>
                    </div>
                    <div className="flex w-full flex-wrap gap-2"><AvailabilityBadge availability={d.availability} profile={d} /><PromotionBadge kind="profile" id={d.id} /></div>
                  </div>
                  <Rating value={d.rating} size={13} showValue count={d.rating_count} className="mt-3" />
                  <div className="mt-3 space-y-2 rounded-xl bg-ink-50 p-3 text-xs leading-5 text-ink-600">
                    <p className="flex items-start gap-2"><Briefcase className="mt-0.5 h-4 w-4 shrink-0" /> {d.driving_experience_years != null ? `${d.driving_experience_years} ${d.driving_experience_years === 1 ? 'year' : 'years'} experience` : 'Experience not provided'}</p>
                    {d.languages?.length > 0 && (
                      <p className="flex items-start gap-2"><Languages className="mt-0.5 h-4 w-4 shrink-0" /><span className="break-words">{d.languages.join(', ')}</span></p>
                    )}
                  </div>
                  <div className="mt-3 flex flex-wrap gap-1">
                    {(d.platforms_worked || []).slice(0, 4).map((p) => (
                      <span key={p} className="badge-neutral">{titleCase(p)}</span>
                    ))}
                  </div>
                </Link>
                <div className="mt-3"><VerifiedBadge verified={d.platform_history_approved} size={12} showLabel /></div>
                <div className="mt-auto grid grid-cols-2 gap-2 border-t border-ink-100 pt-4">
                  <Link to={`/members/${d.id}`} className="btn-secondary justify-center px-2 text-xs">View driver</Link>
                  <ConnectionButton otherUserId={d.id} size="sm" className="w-full" />
                </div>
              </div>
              {index === 5 && filtered.length > 6 && <AdSlot placement="inline" className="col-span-full" />}</Fragment>
            ))}
          </div>
        ) : (
          <EmptyState
            title={(location || platform || verifiedOnly) ? 'No drivers match your filters' : 'No driver profiles are available yet'}
            description={(location || platform || verifiedOnly) ? 'Try adjusting your filters.' : 'Drivers with approved or pending platform history will appear here after they complete their profile.'}
          />
        )}
      </div>
    </div>
  );
}
