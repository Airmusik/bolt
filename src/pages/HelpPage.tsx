import { useState } from 'react';
import { ChevronDown, LifeBuoy } from 'lucide-react';
import { BackButton } from '@/components/BackButton';
import { useSiteSettings } from '@/lib/siteSettings';

const getFaqs = (siteName: string) => [
  { q: `Does ${siteName} process payments between users?`, a: `No. ${siteName} only connects car owners with drivers. Any payments (targets, deposits) are arranged directly between you.` },
  { q: 'How does the Trust Passport work?', a: 'No identity document is required. Your passport combines account age, completed matches, reviews, recent admin-approved platform history, optional evidence and account standing.' },
  { q: 'Are uploads reviewed?', a: 'Vehicle photos, work-history proofs and other trust evidence remain pending until an admin approves them. Profile photos appear immediately. Private proof files are not shown to other members.' },
  { q: 'Can I see a vehicle\'s insurance status?', a: 'Yes. Every listing shows the insurance type (third party or comprehensive) and its expiry date, along with any known issues the owner has disclosed.' },
  { q: 'How does the chat work?', a: 'A chat opens after a connection is accepted. Ending the connection makes that chat read-only but keeps its history for support and dispute resolution. An administrator can join when support is needed. File uploads are disabled so they cannot bypass moderation.' },
  { q: 'How do ratings and reports work?', a: 'Every member starts at 5.0 stars. Reviews from completed matches form the base rating, and each report upheld by an admin subtracts 0.1 star—so 10 upheld reports reduce a 5.0 rating to 4.0. Open or dismissed reports do not affect a rating.' },
];

export function HelpPage() {
  const [open, setOpen] = useState<number | null>(0);
  const { settings } = useSiteSettings();
  const faqs = getFaqs(settings.site_name);
  return (
    <div className="container-content py-12">
      <BackButton to="/" />
      <div className="mt-4 flex items-center gap-3">
        <LifeBuoy className="h-7 w-7 text-brand-600" />
        <h1 className="font-display text-3xl font-bold text-ink-900">Help center</h1>
      </div>
      <p className="mt-2 text-ink-600">Frequently asked questions about {settings.site_name}.</p>
      <div className="mt-8 max-w-2xl space-y-3">
        {faqs.map((f, i) => (
          <div key={i} className="card overflow-hidden">
            <button onClick={() => setOpen(open === i ? null : i)} className="flex w-full items-center justify-between p-4 text-left">
              <span className="font-medium text-ink-900">{f.q}</span>
              <ChevronDown className={`h-5 w-5 text-ink-400 transition ${open === i ? 'rotate-180' : ''}`} />
            </button>
            {open === i && <p className="px-4 pb-4 text-sm text-ink-600">{f.a}</p>}
          </div>
        ))}
      </div>
    </div>
  );
}
