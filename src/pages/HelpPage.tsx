import { useState } from 'react';
import { ChevronDown, LifeBuoy } from 'lucide-react';

const FAQS = [
  { q: 'Does GariLink process payments between users?', a: 'No. GariLink only connects car owners with drivers. Any payments (targets, deposits) are arranged directly between you.' },
  { q: 'How do I get verified?', a: 'Upload your National ID and driving licence (drivers) or ID (owners) in your onboarding. Our admin team reviews and approves verification, which adds a verified badge to your profile.' },
  { q: 'What documents do drivers need?', a: 'National ID, driving licence, and optionally a PSV badge and certificate of good conduct. You can also add your platform history (Uber, Bolt, Little, Faras) for the last 5 months.' },
  { q: 'Can I see a vehicle\'s insurance status?', a: 'Yes. Every listing shows the insurance type (third party or comprehensive) and its expiry date, along with any known issues the owner has disclosed.' },
  { q: 'How does the chat work?', a: 'A chat opens automatically once an owner accepts a driver\'s application. You can send text, images and emojis, see read receipts, and block or report a user.' },
  { q: 'How do reviews work?', a: 'Both parties can leave a star rating and written review after an application is accepted. This keeps reviews genuine.' },
];

export function HelpPage() {
  const [open, setOpen] = useState<number | null>(0);
  return (
    <div className="container-content py-12">
      <div className="flex items-center gap-3">
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
