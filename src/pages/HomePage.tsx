import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Search, MapPin, ShieldCheck, Car, Users, Star, ArrowRight,
  CheckCircle2, MessageSquare, Bell, BadgeCheck, TrendingUp,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/useAuth';
import type { VehicleWithRelations, Profile } from '@/lib/types';
import { VehicleCard } from '@/components/VehicleCard';
import { Avatar } from '@/components/Avatar';
import { Rating } from '@/components/Rating';
import { VerifiedBadge } from '@/components/VerifiedBadge';
import { ALL_LOCATIONS } from '@/lib/locations';
import { titleCase } from '@/lib/utils';
import { PUBLIC_PROFILE_FIELDS } from '@/lib/profileSelect';

export function HomePage() {
  const navigate = useNavigate();
  const { user, profile } = useAuth();
  const [query, setQuery] = useState('');
  const [location, setLocation] = useState('');
  const [featured, setFeatured] = useState<VehicleWithRelations[]>([]);
  const [drivers, setDrivers] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user && profile?.role === 'admin') {
      navigate('/admin', { replace: true });
    }
  }, [user, profile, navigate]);

  useEffect(() => {
    (async () => {
      const [{ data: v }, { data: d }] = await Promise.all([
        supabase
          .from('vehicles')
          .select(`*, owner:profiles(${PUBLIC_PROFILE_FIELDS}), photos:vehicle_photos(*), issues:vehicle_issues(*)`)
          .eq('status', 'active')
          .order('created_at', { ascending: false })
          .limit(6),
        supabase
          .from('profiles')
          .select(PUBLIC_PROFILE_FIELDS)
          .eq('role', 'driver')
          .eq('is_verified', true)
          .order('rating', { ascending: false })
          .limit(4),
      ]);
      setFeatured((v as VehicleWithRelations[]) || []);
      setDrivers((d as Profile[]) || []);
      setLoading(false);
    })();
  }, []);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const params = new URLSearchParams();
    if (location) params.set('location', location);
    if (query) params.set('q', query);
    navigate(`/browse-cars?${params.toString()}`);
  };

  return (
    <div>
      {/* HERO */}
      {!user && (
      <section className="relative overflow-hidden bg-gradient-to-b from-brand-50/60 to-white">
        <div className="absolute inset-0 -z-10">
          <div className="absolute -top-24 left-1/2 h-72 w-[60rem] -translate-x-1/2 rounded-full bg-brand-100/50 blur-3xl" />
        </div>
        <div className="container-content py-16 md:py-24">
          <div className="mx-auto max-w-3xl text-center animate-slide-up">
            <span className="badge-brand mx-auto mb-5">
              <ShieldCheck className="h-3.5 w-3.5" /> Transparent driver Trust Passports across Kenya
            </span>
            <h1 className="font-display text-4xl font-extrabold leading-[1.1] text-ink-950 sm:text-5xl md:text-6xl">
              <span className="text-brand-600">GariLink</span>
              <br />
              <span className="text-ink-950">Find the Right Driver or the Right Car.</span>
            </h1>
            <p className="mt-5 text-lg text-ink-600">
              GariLink connects car owners and ride-hailing drivers through approved evidence, references, reviews, and transparent activity.
            </p>
          </div>

          {/* Search bar */}
          <form
            onSubmit={handleSearch}
            className="mx-auto mt-10 max-w-3xl animate-fade-in rounded-2xl bg-white p-3 shadow-card-hover ring-1 ring-ink-100"
          >
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-ink-400" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Make, model, or keyword"
                  className="w-full rounded-xl border-0 bg-ink-50 pl-10 pr-4 py-3 text-sm ring-1 ring-transparent focus:ring-brand-500 focus:outline-none"
                />
              </div>
              <div className="relative sm:w-56">
                <MapPin className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-ink-400" />
                <select
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  className="w-full appearance-none rounded-xl border-0 bg-ink-50 pl-10 pr-4 py-3 text-sm ring-1 ring-transparent focus:ring-brand-500 focus:outline-none"
                >
                  <option value="">All locations</option>
                  {ALL_LOCATIONS.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <button type="submit" className="btn-primary sm:px-7">
                <Search className="h-4 w-4" /> Search
              </button>
            </div>
          </form>

          <div className="mx-auto mt-5 flex max-w-3xl flex-wrap items-center justify-center gap-x-6 gap-y-2 text-xs text-ink-500">
            <span className="inline-flex items-center gap-1.5"><BadgeCheck className="h-4 w-4 text-brand-600" /> Driver Trust Passports</span>
            <span className="inline-flex items-center gap-1.5"><ShieldCheck className="h-4 w-4 text-brand-600" /> Insurance visible</span>
            <span className="inline-flex items-center gap-1.5"><MessageSquare className="h-4 w-4 text-brand-600" /> Real-time chat</span>
            <span className="inline-flex items-center gap-1.5"><Star className="h-4 w-4 text-brand-600" /> Two-way reviews</span>
          </div>
        </div>
      </section>
      )}

      {/* FEATURED LISTINGS */}
      <section className="container-content py-16">
        <div className="flex items-end justify-between">
          <div>
            <h2 className="font-display text-2xl font-bold text-ink-900 sm:text-3xl">Featured cars</h2>
            <p className="mt-1 text-sm text-ink-500">Available vehicles from trusted owners.</p>
          </div>
          <Link to="/browse-cars" className="hidden items-center gap-1 text-sm font-semibold text-brand-700 hover:text-brand-800 sm:flex">
            View all <ArrowRight className="h-4 w-4" />
          </Link>
        </div>

        {loading ? (
          <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="card overflow-hidden">
                <div className="aspect-[16/10] bg-ink-100" />
                <div className="space-y-3 p-4">
                  <div className="h-4 w-2/3 rounded bg-ink-100" />
                  <div className="h-3 w-1/2 rounded bg-ink-100" />
                  <div className="h-3 w-3/4 rounded bg-ink-100" />
                </div>
              </div>
            ))}
          </div>
        ) : featured.length > 0 ? (
          <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {featured.map((v) => <VehicleCard key={v.id} vehicle={v} />)}
          </div>
        ) : (
          <div className="mt-8 rounded-2xl border border-dashed border-ink-200 bg-white p-12 text-center">
            <Car className="mx-auto h-10 w-10 text-ink-300" />
            <p className="mt-3 font-medium text-ink-700">No listings yet</p>
            <p className="text-sm text-ink-500">Be the first to list a vehicle on GariLink.</p>
            <Link to="/register" className="btn-primary mt-5">List your car</Link>
          </div>
        )}
      </section>

      {/* STATS */}
      <section className="bg-ink-950 text-white">
        <div className="container-content py-14">
          <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { icon: Users, label: 'Trusted members', value: '2,400+' },
              { icon: Car, label: 'Active listings', value: '850+' },
              { icon: CheckCircle2, label: 'Successful matches', value: '1,200+' },
              { icon: Star, label: 'Avg. rating', value: '4.8/5' },
            ].map((s) => (
              <div key={s.label} className="text-center">
                <s.icon className="mx-auto h-7 w-7 text-brand-400" />
                <p className="mt-3 font-display text-3xl font-extrabold">{s.value}</p>
                <p className="text-sm text-ink-300">{s.label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section className="container-content py-16">
        <div className="text-center">
          <h2 className="font-display text-2xl font-bold text-ink-900 sm:text-3xl">How GariLink works</h2>
          <p className="mt-1 text-sm text-ink-500">Two simple paths to earning or renting out your car.</p>
        </div>

        <div className="mt-12 grid gap-8 lg:grid-cols-2">
          <HowItWorksCard
            title="For car owners"
            color="brand"
            steps={[
              { icon: Users, text: 'Register and create your owner profile' },
              { icon: Car, text: 'Add your vehicle; photos are admin-approved' },
              { icon: Bell, text: 'Receive applications from drivers' },
              { icon: CheckCircle2, text: 'Choose your driver and start earning' },
            ]}
            cta={{ to: '/register', label: 'List your car' }}
          />
          <HowItWorksCard
            title="For drivers"
            color="accent"
            steps={[
              { icon: Users, text: 'Register and build your Trust Passport' },
              { icon: BadgeCheck, text: 'Add references, history & optional evidence' },
              { icon: Search, text: 'Browse cars that match your needs' },
              { icon: TrendingUp, text: 'Apply and start earning' },
            ]}
            cta={{ to: '/register', label: 'Find a car' }}
          />
        </div>
      </section>

      {/* VERIFIED DRIVERS */}
      {drivers.length > 0 && (
        <section className="bg-ink-50 py-16">
          <div className="container-content">
            <div className="flex items-end justify-between">
              <div>
                <h2 className="font-display text-2xl font-bold text-ink-900 sm:text-3xl">Trusted drivers</h2>
                <p className="mt-1 text-sm text-ink-500">Top-rated drivers ready to work.</p>
              </div>
              <Link to="/browse-drivers" className="hidden items-center gap-1 text-sm font-semibold text-brand-700 hover:text-brand-800 sm:flex">
                View all <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
            <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
              {drivers.map((d) => (
                <Link key={d.id} to={`/drivers/${d.id}`} className="card card-hover p-5 text-center">
                  <Avatar name={d.full_name} src={d.avatar_url} size={72} verified className="mx-auto" />
                  <p className="mt-3 flex items-center justify-center gap-1 font-semibold text-ink-900">
                    {d.full_name}
                  </p>
                  <p className="text-xs text-ink-500">{d.location || 'Location not provided'}</p>
                  <div className="mt-1"><VerifiedBadge verified={d.is_verified} size={11} showLabel /></div>
                  <Rating value={d.rating} size={13} showValue count={d.rating_count} className="mt-2 justify-center" />
                  <div className="mt-3 flex flex-wrap justify-center gap-1">
                    {d.platforms_worked?.slice(0, 3).map((p) => (
                      <span key={p} className="badge-neutral">{titleCase(p)}</span>
                    ))}
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* SAFETY */}
      <section className="container-content py-16">
        <div className="grid items-center gap-10 lg:grid-cols-2">
          <div>
            <span className="badge-brand mb-4"><ShieldCheck className="h-3.5 w-3.5" /> Safety first</span>
            <h2 className="font-display text-2xl font-bold text-ink-900 sm:text-3xl">
              Built for trust, end to end
            </h2>
            <p className="mt-3 text-ink-600">
              Trust is earned through account history, completed matches, two-way reviews, approved references, and optional evidence. Vehicle insurance and known issues are shown upfront. Report or block anyone, anytime.
            </p>
            <ul className="mt-6 space-y-3">
              {[
                'Transparent driver Trust Passport and account standing',
                'All user-uploaded photos and proofs reviewed by admins',
                'Insurance type and expiry visible on every listing',
                'Known vehicle issues disclosed by the owner',
                'Approved references and work history shown as counts',
                'Real-time chat with read receipts and block / report',
              ].map((t) => (
                <li key={t} className="flex items-start gap-2 text-sm text-ink-700">
                  <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-brand-600" /> {t}
                </li>
              ))}
            </ul>
          </div>
          <div className="grid grid-cols-2 gap-4">
            {[
              { icon: BadgeCheck, title: 'Driver Trust Passports', text: 'Activity, reviews, references & evidence' },
              { icon: ShieldCheck, title: 'Insurance shown', text: 'Third party or comprehensive' },
              { icon: MessageSquare, title: 'Secure chat', text: 'Only after a match is accepted' },
              { icon: Bell, title: 'Stay informed', text: 'Notifications for every action' },
            ].map((c) => (
              <div key={c.title} className="card p-5">
                <c.icon className="h-7 w-7 text-brand-600" />
                <p className="mt-3 font-semibold text-ink-900">{c.title}</p>
                <p className="mt-1 text-xs text-ink-500">{c.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* TESTIMONIALS */}
      <section className="bg-ink-50 py-16">
        <div className="container-content">
          <div className="text-center">
            <h2 className="font-display text-2xl font-bold text-ink-900 sm:text-3xl">What members say</h2>
          </div>
          <div className="mt-10 grid gap-6 md:grid-cols-3">
            {[
              { name: 'James M.', role: 'Car owner, Nairobi', text: 'Found a trusted driver in two days. The insurance and issue disclosures gave me real peace of mind.' },
              { name: 'Aisha W.', role: 'Driver, Mombasa', text: 'I could see which cars had comprehensive insurance and which had minor issues before applying. No surprises.' },
              { name: 'Kevin O.', role: 'Car owner, Eldoret', text: 'The chat is fast and I can see when my driver reads my messages. GariLink just works.' },
            ].map((t) => (
              <div key={t.name} className="card p-6">
                <Rating value={5} size={15} />
                <p className="mt-3 text-sm text-ink-700">"{t.text}"</p>
                <div className="mt-4 flex items-center gap-2 border-t border-ink-100 pt-4">
                  <Avatar name={t.name} size={36} />
                  <div>
                    <p className="text-sm font-semibold text-ink-900">{t.name}</p>
                    <p className="text-xs text-ink-500">{t.role}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="container-content py-16">
        <div className="relative overflow-hidden rounded-3xl bg-brand-700 px-6 py-14 text-center text-white md:px-12">
          <div className="absolute -right-20 -top-20 h-64 w-64 rounded-full bg-brand-500/40 blur-3xl" />
          <div className="absolute -bottom-24 -left-16 h-64 w-64 rounded-full bg-brand-400/30 blur-3xl" />
          <div className="relative">
            <h2 className="font-display text-3xl font-extrabold sm:text-4xl">Ready to get moving?</h2>
            <p className="mx-auto mt-3 max-w-xl text-brand-50">
              Join thousands of owners and drivers building trust on GariLink. It's free to get started.
            </p>
            <div className="mt-7 flex flex-wrap justify-center gap-3">
              <Link to="/register" className="btn bg-white text-brand-700 hover:bg-brand-50">
                Create your account <ArrowRight className="h-4 w-4" />
              </Link>
              <Link to="/browse-cars" className="btn border border-brand-400 text-white hover:bg-brand-600">
                Browse cars
              </Link>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

function HowItWorksCard({
  title, steps, cta, color,
}: {
  title: string;
  color: 'brand' | 'accent';
  steps: { icon: React.ComponentType<{ className?: string }>; text: string }[];
  cta: { to: string; label: string };
}) {
  return (
    <div className="card p-6 md:p-8">
      <h3 className="font-display text-xl font-bold text-ink-900">{title}</h3>
      <ol className="mt-6 space-y-5">
        {steps.map((s, i) => (
          <li key={i} className="flex items-start gap-4">
            <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-bold ${color === 'brand' ? 'bg-brand-100 text-brand-700' : 'bg-accent-100 text-accent-600'}`}>
              {i + 1}
            </span>
            <div className="flex items-center gap-2 pt-1">
              <s.icon className={`h-5 w-5 ${color === 'brand' ? 'text-brand-600' : 'text-accent-500'}`} />
              <span className="text-sm text-ink-700">{s.text}</span>
            </div>
          </li>
        ))}
      </ol>
      <Link to={cta.to} className={`mt-7 ${color === 'brand' ? 'btn-primary' : 'btn bg-accent-500 text-white hover:bg-accent-600'}`}>
        {cta.label} <ArrowRight className="h-4 w-4" />
      </Link>
    </div>
  );
}
