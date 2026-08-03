import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Car, Facebook, Instagram, Linkedin, Mail, MapPin, ChevronDown } from 'lucide-react';

export function Footer() {
  const [expanded, setExpanded] = useState(false);

  return (
    <footer className="border-t border-ink-100 bg-white">
      <div className="container-content py-6">
        {/* Mobile: collapsed behind a button */}
        <button
          onClick={() => setExpanded((v) => !v)}
          className="flex w-full items-center justify-between md:hidden"
        >
          <Link to="/" className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-600 text-white">
              <Car className="h-5 w-5" />
            </span>
            <span className="font-display text-lg font-extrabold tracking-tight">
              Gari<span className="text-brand-600">Link</span>
            </span>
          </Link>
          <ChevronDown className={`h-5 w-5 text-ink-400 transition-transform ${expanded ? 'rotate-180' : ''}`} />
        </button>

        {/* Desktop: always visible grid; Mobile: only when expanded */}
        <div className={`mt-0 md:mt-0 ${expanded ? 'mt-6 grid' : 'hidden'} gap-10 md:grid md:grid-cols-4`}>
          <div>
            <Link to="/" className="hidden items-center gap-2 md:flex">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-600 text-white">
                <Car className="h-5 w-5" />
              </span>
              <span className="font-display text-lg font-extrabold tracking-tight">
                Gari<span className="text-brand-600">Link</span>
              </span>
            </Link>
            <p className="mt-3 text-sm text-ink-500">
              Connecting verified car owners with trusted ride-hailing drivers across Kenya — safely and simply.
            </p>
            <div className="mt-4 flex gap-3">
              <a href="#" aria-label="Facebook" className="rounded-full bg-ink-100 p-2 text-ink-600 hover:bg-ink-200"><Facebook className="h-4 w-4" /></a>
              <a href="#" aria-label="Instagram" className="rounded-full bg-ink-100 p-2 text-ink-600 hover:bg-ink-200"><Instagram className="h-4 w-4" /></a>
              <a href="#" aria-label="LinkedIn" className="rounded-full bg-ink-100 p-2 text-ink-600 hover:bg-ink-200"><Linkedin className="h-4 w-4" /></a>
            </div>
          </div>

          <FooterCol title="Company" links={[
            { to: '/about', label: 'About' },
            { to: '/contact', label: 'Contact' },
            { to: '/help', label: 'FAQ' },
            { to: '/how-it-works', label: 'How it works' },
          ]} />

          <FooterCol title="Legal" links={[
            { to: '/terms', label: 'Terms of Service' },
            { to: '/privacy', label: 'Privacy Policy' },
            { to: '/contact', label: 'Contact Us' },
          ]} />

          <div>
            <h4 className="text-sm font-semibold text-ink-900">Get in touch</h4>
            <ul className="mt-3 space-y-2 text-sm text-ink-500">
              <li className="flex items-center gap-2"><Mail className="h-4 w-4" /> airmusikinc@gmail.com</li>
              <li className="flex items-center gap-2"><MapPin className="h-4 w-4" /> Nairobi, Kenya</li>
            </ul>
          </div>
        </div>

        <div className="mt-6 border-t border-ink-100 pt-4 text-center text-xs text-ink-400 md:mt-10 md:pt-6">
          © {new Date().getFullYear()} GariLink. All rights reserved. GariLink does not process payments between users.
        </div>
      </div>
    </footer>
  );
}

function FooterCol({ title, links }: { title: string; links: { to: string; label: string }[] }) {
  return (
    <div>
      <h4 className="text-sm font-semibold text-ink-900">{title}</h4>
      <ul className="mt-3 space-y-2">
        {links.map((l) => (
          <li key={l.to}>
            <Link to={l.to} className="text-sm text-ink-500 hover:text-brand-700">{l.label}</Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
