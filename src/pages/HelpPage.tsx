import { useState } from 'react';
import { ChevronDown, LifeBuoy } from 'lucide-react';
import { BackButton } from '@/components/BackButton';

const FAQS = [
  { q: 'Does GariLink process payments between users?', a: 'No. GariLink only connects car owners with drivers. Any payments (targets, deposits) are arranged directly between you.' },
  { q: 'How does the Trust Passport work?', a: 'No identity document is required. Your passport combines account age, activity, completed matches, reviews, approved references, optional evidence and account standing.' },
  { q: 'Are uploads reviewed?', a: 'Yes. Profile photos, vehicle photos, work-history proofs and other evidence remain pending until an admin approves them. Private proof files are not shown to other members.' },
  { q: 'Can I see a vehicle\'s insurance status?', a: 'Yes. Every listing shows the insurance type (third party or comprehensive) and its expiry date, along with any known issues the owner has disclosed.' },
  { q: 'How does the chat work?', a: 'A chat opens automatically once an owner accepts a driver\'s application. You can send text and emojis, see read receipts, and block or report a user. File uploads are disabled so they cannot bypass moderation.' },
  { q: 'How do reviews work?', a: 'Both parties can leave a star rating and written review after an application is accepted. This keeps reviews genuine.' },
];

export function HelpPage() {
  const [open, setOpen] = useState<number | null>(0);
  return (
    <div className="container-content py-12">
      <BackButton to="/" />
      <div className="mt-4 flex items-center gap-3">
        <LifeBuoy className="h-7 w-7 text-brand-600" />
        <h1 className="font-display text-3xl font-bold text-ink-900">Help center</h1>
      </div>
      <p className="mt-2 text-ink-600">Frequently asked questions about GariLink.</p>
      <div className="mt-8 max-w-2xl space-y-3">
        {FAQS.map((f, i) => (
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
