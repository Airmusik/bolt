import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Search, MapPin, ShieldCheck, Car, Users, Star, ArrowRight,
  CheckCircle2, MessageSquare, Bell, BadgeCheck, TrendingUp, ChevronLeft, ChevronRight, Pause, Play,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/useAuth';
import type { VehicleWithRelations, Profile } from '@/lib/types';
import { VehicleCard } from '@/components/VehicleCard';
import { Avatar } from '@/components/Avatar';
import { Rating } from '@/components/Rating';
import { VerifiedBadge } from '@/components/VerifiedBadge';
import { titleCase } from '@/lib/utils';
import { useSiteSettings } from '@/lib/siteSettings';
import { PlaceAutocomplete } from '@/components/PlaceAutocomplete';

export function HomePage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { settings } = useSiteSettings();
  const [query, setQuery] = useState('');
  const [location, setLocation] = useState('');
  const [featured, setFeatured] = useState<VehicleWithRelations[]>([]);
  const [drivers, setDrivers] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [featuredPaused, setFeaturedPaused] = useState(false);
  const [featuredInteracting, setFeaturedInteracting] = useState(false);
  const featuredTrackRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    (async () => {
      const [{ data: v }, { data: d }] = await Promise.all([
        supabase.rpc('discover_vehicles', { p_limit: 6 }),
        supabase.rpc('discover_drivers', { p_limit: 4, p_verified_only: true }),
      ]);
      setFeatured((v as VehicleWithRelations[]) || []);
      setDrivers((d as Profile[]) || []);
      setLoading(false);
    })();
  }, []);

  const scrollFeatured = useCallback((direction: 1 | -1) => {
    const track = featuredTrackRef.current;
    const card = track?.querySelector<HTMLElement>('[data-featured-card]');
    if (!track || !card) return;
    const gap = 20;
    const amount = card.getBoundingClientRect().width + gap;
    const atEnd = track.scrollLeft + track.clientWidth >= track.scrollWidth - amount / 2;
    const atStart = track.scrollLeft <= amount / 2;
    if (direction > 0 && atEnd) track.scrollTo({ left: 0, behavior: 'smooth' });
    else if (direction < 0 && atStart) track.scrollTo({ left: track.scrollWidth, behavior: 'smooth' });
    else track.scrollBy({ left: direction * amount, behavior: 'smooth' });
  }, []);

  useEffect(() => {
    if (featured.length < 2 || featuredPaused || featuredInteracting || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const timer = window.setInterval(() => scrollFeatured(1), 4200);
    return () => window.clearInterval(timer);
  }, [featured.length, featuredInteracting, featuredPaused, scrollFeatured]);

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
      <section className="relative overflow-hidden bg-gradient-to-b from-brand-50/60 to-white dark:to-[#0b0b0d]">
        <div className="absolute inset-0 -z-10">
          <div className="absolute -top-24 left-1/2 h-72 w-[60rem] -translate-x-1/2 rounded-full bg-brand-100/50 blur-3xl" />
        </div>
        <div className="hero-road pointer-events-none hidden md:block" aria-hidden="true"><Car className="hero-car h-6 w-6" /></div>
        <div className="container-content py-16 md:py-24">
          <div className="mx-auto max-w-3xl text-center animate-slide-up">
            <span className="badge-brand mx-auto mb-5">
              <ShieldCheck className="h-3.5 w-3.5" /> Transparent driver Trust Passports across Kenya
            </span>
            <h1 className="font-display text-4xl font-extrabold leading-[1.1] text-ink-950 sm:text-5xl md:text-6xl">
              <span className="site-wordmark">{settings.site_name}</span>
              <br />
              <span className="text-ink-950">Find the Right Driver or the Right Car.</span>
            </h1>
            <p className="mt-5 font-display text-xl font-bold tracking-tight text-ink-800 sm:text-2xl">{settings.site_tagline}</p>
            <p className="mt-3 text-base text-ink-600">
              {settings.site_name} connects car owners and ride-hailing drivers through approved platform history, reviews, and transparent activity.
            </p>
          </div>

          {/* Search bar */}
          <form
            onSubmit={handleSearch}
            className="mx-auto mt-10 max-w-3xl animate-fade-in rounded-2xl bg-white p-3 shadow-card-hover ring-1 ring-ink-100 dark:bg-[#141416]"
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
              <div className="sm:w-64"><PlaceAutocomplete value={location} onChange={setLocation} placeholder="Any location" /></div>
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
        <div className="flex items-end justify-between gap-4">
          <div>
            <h2 className="font-display text-2xl font-bold text-ink-900 sm:text-3xl">Featured cars</h2>
            <p className="mt-1 text-sm text-ink-500">Available vehicles from trusted owners. Swipe or use the controls to explore.</p>
          </div>
          <div className="hidden items-center gap-2 sm:flex">
            {featured.length > 1 && <><button type="button" onClick={() => scrollFeatured(-1)} aria-label="Previous featured cars" className="flex h-10 w-10 items-center justify-center rounded-full bg-white text-ink-600 shadow-soft ring-1 ring-ink-100 hover:-translate-y-0.5 hover:shadow-card dark:bg-[#141416]"><ChevronLeft className="h-4 w-4" /></button><button type="button" onClick={() => setFeaturedPaused((value) => !value)} aria-label={featuredPaused ? 'Resume featured car scrolling' : 'Pause featured car scrolling'} className="flex h-10 w-10 items-center justify-center rounded-full bg-white text-ink-600 shadow-soft ring-1 ring-ink-100 hover:-translate-y-0.5 hover:shadow-card dark:bg-[#141416]">{featuredPaused ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}</button><button type="button" onClick={() => scrollFeatured(1)} aria-label="Next featured cars" className="flex h-10 w-10 items-center justify-center rounded-full bg-white text-ink-600 shadow-soft ring-1 ring-ink-100 hover:-translate-y-0.5 hover:shadow-card dark:bg-[#141416]"><ChevronRight className="h-4 w-4" /></button></>}
            <Link to="/browse-cars" className="ml-1 inline-flex items-center gap-1 text-sm font-semibold text-brand-700 hover:text-brand-800">View all <ArrowRight className="h-4 w-4" /></Link>
          </div>
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
          <div className="relative mt-8">
            <div ref={featuredTrackRef} onPointerEnter={() => setFeaturedInteracting(true)} onPointerLeave={() => setFeaturedInteracting(false)} onTouchStart={() => setFeaturedInteracting(true)} onTouchEnd={() => setFeaturedInteracting(false)} onFocusCapture={() => setFeaturedInteracting(true)} onBlurCapture={() => setFeaturedInteracting(false)} className="-mx-4 flex snap-x snap-mandatory gap-5 overflow-x-auto px-4 pb-5 pt-1 scroll-smooth sm:mx-0 sm:px-1" aria-label="Featured cars carousel">
              {featured.map((v) => <div key={v.id} data-featured-card className="min-w-[86vw] snap-start sm:min-w-[calc(50%-0.625rem)] lg:min-w-[calc(33.333%-0.875rem)]"><VehicleCard vehicle={v} /></div>)}
            </div>
            <div className="mt-1 flex items-center justify-between sm:hidden"><div className="flex items-center gap-2">{featured.length > 1 && <><button type="button" onClick={() => scrollFeatured(-1)} aria-label="Previous featured car" className="flex h-10 w-10 items-center justify-center rounded-full bg-white text-ink-600 shadow-soft ring-1 ring-ink-100 dark:bg-[#141416]"><ChevronLeft className="h-4 w-4" /></button><button type="button" onClick={() => setFeaturedPaused((value) => !value)} aria-label={featuredPaused ? 'Resume featured car scrolling' : 'Pause featured car scrolling'} className="flex h-10 w-10 items-center justify-center rounded-full bg-white text-ink-600 shadow-soft ring-1 ring-ink-100 dark:bg-[#141416]">{featuredPaused ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}</button><button type="button" onClick={() => scrollFeatured(1)} aria-label="Next featured car" className="flex h-10 w-10 items-center justify-center rounded-full bg-white text-ink-600 shadow-soft ring-1 ring-ink-100 dark:bg-[#141416]"><ChevronRight className="h-4 w-4" /></button></>}</div><Link to="/browse-cars" className="inline-flex items-center gap-1 text-sm font-semibold text-brand-700">View all <ArrowRight className="h-4 w-4" /></Link></div>
          </div>
        ) : (
          <div className="mt-8 rounded-2xl border border-dashed border-ink-200 bg-white p-12 text-center dark:bg-[#141416]">
            <Car className="mx-auto h-10 w-10 text-ink-300" />
            <p className="mt-3 font-medium text-ink-700">No listings yet</p>
            <p className="text-sm text-ink-500">Be the first to list a vehicle on {settings.site_name}.</p>
            <Link to="/register" className="btn-primary mt-5">List your car</Link>
          </div>
        )}
      </section>

      {/* STATS */}
      <section className="bg-ink-950 text-white">
        <div className="container-content py-14">
          <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { icon: MapPin, label: 'Built for Kenyan towns', value: 'Kenya only' },
              { icon: CheckCircle2, label: 'Vehicle photos and evidence', value: 'Admin reviewed' },
              { icon: ShieldCheck, label: 'Sensitive uploads', value: 'Kept private' },
              { icon: MessageSquare, label: 'Members arrange terms directly', value: 'Rental payments stay direct' },
            ].map((s) => (
              <div key={s.label} className="text-center">
                <s.icon className="mx-auto h-7 w-7 text-brand-400" />
                <p className="mt-3 font-display text-xl font-extrabold">{s.value}</p>
                <p className="text-sm text-ink-300">{s.label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section className="container-content py-16">
        <div className="text-center">
          <h2 className="font-display text-2xl font-bold text-ink-900 sm:text-3xl">How {settings.site_name} works</h2>
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
              { icon: BadgeCheck, text: 'Submit recent platform history and wait for admin approval before connecting' },
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
                    {d.sponsored && <span className="badge-accent ml-2">Sponsored</span>}
                  </p>
                  <p className="text-xs text-ink-500">{d.location || 'Location not provided'}</p>
                  <div className="mt-1"><VerifiedBadge verified={d.platform_history_approved} size={11} showLabel /></div>
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
              Trust is earned through account history, two-way reviews, recent platform activity, and optional evidence. Vehicle insurance and known issues are shown upfront. Report or block anyone, anytime.
            </p>
            <ul className="mt-6 space-y-3">
              {[
                'Transparent driver Trust Passport and account standing',
                'Vehicle listings and driver platform history reviewed by admins',
                'Insurance type and expiry visible on every listing',
                'Known vehicle issues disclosed by the owner',
                'Approved platform history and evidence shown as counts',
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
              { icon: BadgeCheck, title: 'Driver Trust Passports', text: 'Activity, reviews & platform evidence' },
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

      {/* MEMBER EXPECTATIONS */}
      <section className="bg-ink-50 py-16">
        <div className="container-content">
          <div className="text-center">
            <h2 className="font-display text-2xl font-bold text-ink-900 sm:text-3xl">Choose with more context</h2>
            <p className="mt-2 text-sm text-ink-500">No hidden scoring and no invented promises—just useful information for both sides.</p>
          </div>
          <div className="mt-10 grid gap-6 md:grid-cols-3">
            {[
              { icon: Users, title: 'Owners compare drivers', text: 'See location, experience, reviews, platform history, and whether trust evidence is approved.' },
              { icon: Car, title: 'Drivers compare cars', text: 'See targets, deposit, insurance status, required experience, approved photos, and disclosed issues.' },
              { icon: MessageSquare, title: 'Both sides stay in control', text: 'Chat after an accepted match, report concerns, block users, and leave reviews after completed work.' },
            ].map((item) => (
              <div key={item.title} className="card p-6">
                <item.icon className="h-7 w-7 text-brand-600" />
                <p className="mt-4 font-semibold text-ink-900">{item.title}</p>
                <p className="mt-2 text-sm text-ink-600">{item.text}</p>
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
              Join thousands of owners and drivers building trust on {settings.site_name}. It's free to get started.
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
