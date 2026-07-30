import { ShieldCheck, Users, Car, Heart } from 'lucide-react';
import { BackButton } from '@/components/BackButton';

export function AboutPage() {
  return (
    <div className="container-content py-12">
      <BackButton to="/" />
      <h1 className="mt-4 font-display text-3xl font-bold text-ink-900">About GariLink</h1>
      <p className="mt-3 max-w-2xl text-ink-600">
        GariLink is a Kenyan platform that connects verified car owners with trusted ride-hailing drivers.
        We believe in transparency: insurance status, known vehicle issues and document expiry are visible upfront,
        so both parties can make informed decisions. GariLink does not process payments — it simply brings the right people together.
      </p>
      <div className="mt-10 grid gap-6 sm:grid-cols-3">
        <div className="card p-6"><ShieldCheck className="h-7 w-7 text-brand-600" /><h3 className="mt-3 font-semibold text-ink-900">Safety first</h3><p className="mt-1 text-sm text-ink-500">Identity verification, insurance visibility and reporting tools.</p></div>
        <div className="card p-6"><Users className="h-7 w-7 text-brand-600" /><h3 className="mt-3 font-semibold text-ink-900">Two-way trust</h3><p className="mt-1 text-sm text-ink-500">Reviews from both owners and drivers after every match.</p></div>
        <div className="card p-6"><Car className="h-7 w-7 text-brand-600" /><h3 className="mt-3 font-semibold text-ink-900">Built for Kenya</h3><p className="mt-1 text-sm text-ink-500">Designed for Uber, Bolt, Faras and Little drivers across the country.</p></div>
      </div>
    </div>
  );
}
