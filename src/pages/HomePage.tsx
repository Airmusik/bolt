import { PromotionLink as Link, PromotionBadge } from '@/components/PromotionLink';
import { usePromotionLive, usePromotionRanking } from '@/lib/promotionLive';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Search, MapPin, ShieldCheck, Car, Users, Star, ArrowRight,
  CheckCircle2, MessageSquare, Bell, BadgeCheck, TrendingUp, ChevronLeft, ChevronRight, Pause, Play,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/useAuth';
import type { VehicleWithRelations, Profile } from '@/lib/types';
import { VehicleCard } from '@/components/VehicleCard';
import { RoadHandoff } from '@/components/RoadHandoff';
import { AdSlot } from '@/components/AdSlot';
import { Avatar } from '@/components/Avatar';
import { Rating } from '@/components/Rating';
import { VerifiedBadge } from '@/components/VerifiedBadge';
import { titleCase } from '@/lib/utils';
import { useSiteSettings } from '@/lib/siteSettings';
import { PlaceAutocomplete } from '@/components/PlaceAutocomplete';
import { buildDiscoveryUrl, type DiscoveryIntent } from '@/lib/discoverySearch';

export function HomePage() {
  const { revision } = usePromotionLive();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { settings } = useSiteSettings();
  const [query, setQuery] = useState('');
  const [searchIntent, setSearchIntent] = useState<DiscoveryIntent>('car');
  const [location, setLocation] = useState('');
  const [featuredRaw, setFeatured] = useState<VehicleWithRelations[]>([]);
  const featured = usePromotionRanking(featuredRaw, 'listing');
  const [driversRaw, setDrivers] = useState<Profile[]>([]);
  const drivers = usePromotionRanking(driversRaw, 'profile');
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
  }, [revision]);

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
    navigate(buildDiscoveryUrl(searchIntent, query, location));
  };

  return (
    <div>
      {/* HERO */}
      {!user && (
      <section className="relative z-10 bg-gradient-to-b from-accent-50/60 to-white dark:from-brand-50/40 dark:to-[#0b0b0d]">
        <div className="container-content relative py-9 sm:py-14 lg:py-16">
          <div className="mx-auto max-w-3xl text-center animate-slide-up">
            <span className="mb-4 inline-flex items-center gap-2 rounded-full border border-ink-200 bg-white/80 px-3 py-1.5 text-xs font-medium text-ink-700 dark:bg-[#141416]">
              <ShieldCheck className="h-4 w-4 shrink-0 text-accent-600 dark:text-accent-400" /> Admin-reviewed driver history
            </span>
            <h1 className="font-display text-[clamp(1.75rem,7.8vw,3.75rem)] font-extrabold leading-[1.12] tracking-tight text-ink-950">
              <span className="block">Find the right driver.</span>
              <span className="block">Find the right car.</span>
            </h1>
            <p className="mx-auto mt-4 max-w-lg text-sm leading-6 text-ink-600 sm:text-base">
              Connect with car owners and ride-hailing drivers across Kenya. Compare platform history and reviews, then find your match.
            </p>
          </div>

          {/* Search bar */}
          <form
            onSubmit={handleSearch}
            role="search"
            aria-label="Find a driver or car"
            className="landing-search relative mx-auto mt-6 max-w-3xl rounded-2xl border border-ink-200 bg-white p-4 shadow-card sm:mt-8 sm:p-5 dark:bg-[#141416]"
          >
            <div role="group" aria-label="What are you looking for?" className="mb-4 grid grid-cols-2 gap-1 rounded-xl bg-ink-50 p-1 ring-1 ring-inset ring-ink-100">
              {(['driver', 'car'] as const).map((intent) => (
                <button key={intent} type="button" aria-pressed={searchIntent === intent} onClick={() => setSearchIntent(intent)} className={`flex min-h-11 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg px-1.5 py-2.5 text-[13px] font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 sm:gap-2 sm:px-2 sm:text-sm ${searchIntent === intent ? 'bg-white text-ink-900 shadow-soft ring-1 ring-ink-200 dark:bg-[#242426]' : 'text-ink-500 hover:text-ink-900'}`}>
                  {intent === 'driver' ? <Users className={`h-4 w-4 shrink-0 ${searchIntent === intent ? 'text-accent-600 dark:text-accent-400' : ''}`} /> : <Car className={`h-4 w-4 shrink-0 ${searchIntent === intent ? 'text-accent-600 dark:text-accent-400' : ''}`} />}
                  I need a {intent}
                </button>
              ))}
            </div>
            <div className={`grid gap-3 sm:items-end ${searchIntent === 'car' ? 'sm:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)_auto]' : 'sm:grid-cols-[minmax(0,1fr)_auto]'}`}>
              {searchIntent === 'car' && <div>
                <label htmlFor="home-car-query" className="label">Car or keyword</label>
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-500" />
                  <input id="home-car-query" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="e.g. Toyota Axio" className="input pl-10" />
                </div>
              </div>}
              <div>
                <label htmlFor="home-location" className="label">{searchIntent === 'driver' ? 'Driver location' : 'Car location'}</label>
                <PlaceAutocomplete id="home-location" ariaLabel={searchIntent === 'driver' ? 'Driver location' : 'Car location'} value={location} onChange={setLocation} placeholder="Any town in Kenya" />
              </div>
              <button type="submit" className="btn-primary min-h-12 sm:px-6" aria-label={`Search ${searchIntent === 'car' ? 'cars' : 'drivers'}`}>
                <Search className="h-4 w-4" /> Search
              </button>
            </div>
            <p className="mt-3 text-xs leading-5 text-ink-500">{searchIntent === 'car' ? 'Search by car, location, or both. Leave fields blank to explore all cars.' : 'Find drivers near you, then filter by platform or approved history.'}</p>
          </form>

          <div className="mx-auto mt-5 grid max-w-3xl grid-cols-2 gap-x-3 gap-y-3 text-xs font-medium leading-5 text-ink-600 sm:grid-cols-4">
            {[
              { icon: BadgeCheck, label: 'Driver Trust Passports' },
              { icon: ShieldCheck, label: 'Insurance visible' },
              { icon: MessageSquare, label: 'Real-time chat' },
              { icon: Star, label: 'Two-way reviews' },
            ].map(({ icon: Icon, label }) => <span key={label} className="flex items-center gap-2 sm:justify-center"><Icon className="h-4 w-4 shrink-0 text-ink-500" />{label}</span>)}
          </div>
          <RoadHandoff />
        </div>
      </section>
      )}

      {/* FEATURED LISTINGS */}
      <section className="container-content py-10 sm:py-16">
        <div className="flex items-end justify-between gap-4">
          <div>
            <h2 className="font-display text-2xl font-bold text-ink-900 sm:text-3xl">Featured cars</h2>
            <p className="mt-2 text-sm leading-6 text-ink-500">Explore available cars. Swipe or use the arrows to see more.</p>
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
              {featured.map((v) => <div key={v.id} data-featured-card className="min-w-0 flex-[0_0_88%] snap-start sm:basis-[calc(50%-0.625rem)] lg:basis-[calc(33.333%-0.875rem)]"><VehicleCard vehicle={v} /></div>)}
            </div>
            <div className="mt-1 flex items-center justify-between sm:hidden"><div className="flex items-center gap-2">{featured.length > 1 && <><button type="button" onClick={() => scrollFeatured(-1)} aria-label="Previous featured car" className="flex h-10 w-10 items-center justify-center rounded-full bg-white text-ink-600 shadow-soft ring-1 ring-ink-100 dark:bg-[#141416]"><ChevronLeft className="h-4 w-4" /></button><button type="button" onClick={() => setFeaturedPaused((value) => !value)} aria-label={featuredPaused ? 'Resume featured car scrolling' : 'Pause featured car scrolling'} className="flex h-10 w-10 items-center justify-center rounded-full bg-white text-ink-600 shadow-soft ring-1 ring-ink-100 dark:bg-[#141416]">{featuredPaused ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}</button><button type="button" onClick={() => scrollFeatured(1)} aria-label="Next featured car" className="flex h-10 w-10 items-center justify-center rounded-full bg-white text-ink-600 shadow-soft ring-1 ring-ink-100 dark:bg-[#141416]"><ChevronRight className="h-4 w-4" /></button></>}</div><Link to="/browse-cars" className="inline-flex items-center gap-1 text-sm font-semibold text-brand-700">View all <ArrowRight className="h-4 w-4" /></Link></div>
          </div>
        ) : (
          <div className="mt-6 rounded-2xl border border-dashed border-ink-200 bg-white px-5 py-8 text-center dark:bg-[#141416]">
            <Car className="mx-auto h-10 w-10 text-ink-300" />
            <p className="mt-3 font-medium text-ink-700">No listings yet</p>
            <p className="text-sm text-ink-500">Be the first to list a vehicle on {settings.site_name}.</p>
            <Link to="/register" className="btn-primary mt-5">List your car</Link>
          </div>
        )}
      </section>

      {/* STATS */}
      <AdSlot placement="inline" className="mx-4 sm:mx-6 lg:mx-auto lg:max-w-5xl" />
      <section className="bg-[#141416] text-white">
        <div className="container-content py-8 sm:py-10">
          <div className="grid grid-cols-2 gap-x-5 gap-y-7 lg:grid-cols-4">
            {[
              { icon: MapPin, label: 'Built for Kenyan towns', value: 'Kenya only' },
              { icon: CheckCircle2, label: 'Driver platform history', value: 'Admin reviewed' },
              { icon: ShieldCheck, label: 'Platform-history uploads', value: 'Kept private' },
              { icon: MessageSquare, label: 'Agree rental terms directly', value: 'You stay in control' },
            ].map((s) => (
              <div key={s.label} className="text-center">
                <s.icon className="mx-auto h-5 w-5 text-accent-400" />
                <p className="mt-3 font-display text-sm font-semibold sm:text-base">{s.value}</p>
                <p className="mt-1 text-xs leading-5 text-neutral-400">{s.label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section className="container-content py-10 sm:py-16">
        <div className="text-center">
          <h2 className="font-display text-2xl font-bold text-ink-900 sm:text-3xl">How {settings.site_name} works</h2>
          <p className="mt-1 text-sm text-ink-500">Two simple paths to earning or renting out your car.</p>
        </div>

        <div className="mt-6 grid gap-5 sm:mt-8 lg:grid-cols-2">
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
        <section className="bg-ink-50 py-10 sm:py-16">
          <div className="container-content">
            <div className="flex items-end justify-between">
              <div>
                <h2 className="font-display text-2xl font-bold text-ink-900 sm:text-3xl">Trusted drivers</h2>
                <p className="mt-2 text-sm text-ink-500">Meet drivers with reviewed platform history.</p>
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
                    <PromotionBadge kind="profile" id={d.id} />
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
            <Link to="/browse-drivers" className="btn-ghost mt-4 w-full sm:hidden">View all drivers <ArrowRight className="h-4 w-4" /></Link>
          </div>
        </section>
      )}

      {/* SAFETY */}
      <section className="container-content py-10 sm:py-16">
        <div className="grid items-center gap-7 lg:grid-cols-2 lg:gap-10">
          <div>
            <span className="badge-brand mb-4"><ShieldCheck className="h-3.5 w-3.5" /> Safety first</span>
            <h2 className="font-display text-2xl font-bold text-ink-900 sm:text-3xl">
              Built for trust, end to end
            </h2>
            <p className="mt-3 text-sm leading-6 text-ink-600 sm:text-base">
              Compare recent platform activity, reviews, and owner-provided vehicle details. Check the other member and their information before agreeing terms—history approval is not identity verification or a safety guarantee.
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
              { icon: Bell, title: 'Stay informed', text: 'Messages and account updates' },
            ].map((c) => (
              <div key={c.title} className="card p-4 sm:p-5">
                <c.icon className="h-6 w-6 text-ink-600" />
                <p className="mt-3 text-sm font-semibold text-ink-900">{c.title}</p>
                <p className="mt-1 text-xs leading-5 text-ink-500">{c.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* MEMBER EXPECTATIONS */}
      <section className="bg-ink-50 py-10 sm:py-16">
        <div className="container-content">
          <div className="text-center">
            <h2 className="font-display text-2xl font-bold text-ink-900 sm:text-3xl">Choose with more context</h2>
            <p className="mt-2 text-sm text-ink-500">No hidden scoring and no invented promises—just useful information for both sides.</p>
          </div>
          <div className="mt-6 grid gap-5 sm:mt-8 md:grid-cols-3">
            {[
              { icon: Users, title: 'Owners compare drivers', text: 'See location, experience, reviews, platform history, and whether trust evidence is approved.' },
              { icon: Car, title: 'Drivers compare cars', text: 'See targets, deposit, insurance status, required experience, approved photos, and disclosed issues.' },
              { icon: MessageSquare, title: 'Both sides stay in control', text: 'Chat after an accepted match, report concerns, block users, and leave reviews after completed work.' },
            ].map((item) => (
              <div key={item.title} className="card p-6">
                <item.icon className="h-7 w-7 text-brand-600" />
                <p className="mt-4 font-semibold text-ink-900">{item.title}</p>
                <p className="mt-2 text-sm leading-6 text-ink-600">{item.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="container-content py-10 sm:py-16">
        <div className="relative overflow-hidden rounded-3xl bg-[#141416] px-5 py-9 text-center text-white sm:py-12 md:px-12">
          <div className="absolute -right-20 -top-20 h-64 w-64 rounded-full bg-brand-500/40 blur-3xl" />
          <div className="absolute -bottom-24 -left-16 h-64 w-64 rounded-full bg-brand-400/30 blur-3xl" />
          <div className="relative">
            <h2 className="font-display text-2xl font-bold sm:text-3xl">Ready to get moving?</h2>
            <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-neutral-300 sm:text-base">
              Find your next working partnership on {settings.site_name}. It's free to get started.
            </p>
            <div className="mt-7 flex flex-wrap justify-center gap-3">
              <Link to="/register" className="btn bg-white text-neutral-900 hover:bg-neutral-100">
                Create your account <ArrowRight className="h-4 w-4" />
              </Link>
              <Link to="/browse-cars" className="btn border border-neutral-600 text-white hover:bg-white/10">
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
    <div className="card flex flex-col p-5 sm:p-6">
      <h3 className="font-display text-xl font-bold text-ink-900">{title}</h3>
      <ol className="mt-5 flex-1 space-y-4">
        {steps.map((s, i) => (
          <li key={i} className="flex items-start gap-3">
            <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-bold ${color === 'brand' ? 'bg-brand-100 text-brand-700' : 'bg-accent-100 text-accent-600'}`}>
              {i + 1}
            </span>
            <div className="flex items-start gap-2 pt-1.5">
              <s.icon className={`mt-0.5 h-4 w-4 shrink-0 ${color === 'brand' ? 'text-brand-600' : 'text-accent-500'}`} />
              <span className="text-sm leading-6 text-ink-700">{s.text}</span>
            </div>
          </li>
        ))}
      </ol>
      <Link to={cta.to} className={`mt-6 sm:self-start ${color === 'brand' ? 'btn-primary' : 'btn-secondary'}`}>
        {cta.label} <ArrowRight className="h-4 w-4" />
      </Link>
    </div>
  );
}
