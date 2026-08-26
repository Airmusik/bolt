import { Link } from 'react-router-dom';
import { Car, Users, BadgeCheck, Bell, CheckCircle2, Search, TrendingUp, ArrowRight } from 'lucide-react';
import { BackButton } from '@/components/BackButton';

export function HowItWorksPage() {
  return (
    <div className="container-content py-12">
      <BackButton to="/" />
      <h1 className="mt-4 font-display text-3xl font-bold text-ink-900">How GariLink works</h1>
      <p className="mt-2 text-ink-600">Two simple paths to earning or renting out your car.</p>

      <div className="mt-10 grid gap-8 lg:grid-cols-2">
        <Path title="For car owners" color="brand" steps={[
          { icon: Users, text: 'Register and create your owner profile.' },
          { icon: Car, text: 'Add your vehicle; admins approve its photos before they are public.' },
          { icon: Bell, text: 'Compare applications using reviews, activity and approved trust signals.' },
          { icon: CheckCircle2, text: 'Choose your driver and start earning.' },
        ]} cta="List your car" />
        <Path title="For drivers" color="accent" steps={[
          { icon: Users, text: 'Register and complete your profile—no identity document is required.' },
          { icon: BadgeCheck, text: 'Add references, platform history and optional evidence for admin approval.' },
          { icon: Search, text: 'Browse cars that match your needs and location.' },
          { icon: TrendingUp, text: 'Apply and start earning.' },
        ]} cta="Find a car" />
      </div>

      <div className="mt-12 rounded-2xl bg-brand-700 p-8 text-center text-white">
        <h2 className="font-display text-2xl font-bold">Ready to get started?</h2>
        <Link to="/register" className="btn mt-4 bg-white text-brand-700 hover:bg-brand-50">Create your account <ArrowRight className="h-4 w-4" /></Link>
      </div>
    </div>
  );
}

function Path({ title, color, steps, cta }: { title: string; color: 'brand' | 'accent'; steps: { icon: React.ComponentType<{ className?: string }>; text: string }[]; cta: string }) {
  return (
    <div className="card p-6">
      <h2 className="font-display text-xl font-bold text-ink-900">{title}</h2>
      <ol className="mt-6 space-y-5">
        {steps.map((s, i) => (
          <li key={i} className="flex items-start gap-4">
            <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-bold ${color === 'brand' ? 'bg-brand-100 text-brand-700' : 'bg-accent-100 text-accent-600'}`}>{i + 1}</span>
            <div className="flex items-center gap-2 pt-1"><s.icon className={`h-5 w-5 ${color === 'brand' ? 'text-brand-600' : 'text-accent-500'}`} /><span className="text-sm text-ink-700">{s.text}</span></div>
          </li>
        ))}
      </ol>
      <Link to="/register" className={`mt-7 ${color === 'brand' ? 'btn-primary' : 'btn bg-accent-500 text-white hover:bg-accent-600'}`}>{cta} <ArrowRight className="h-4 w-4" /></Link>
    </div>
  );
}
