import { Link } from 'react-router-dom';
import { ShieldAlert } from 'lucide-react';
import { useSiteSettings } from '@/lib/siteSettings';

export function MemberSafetyNotice() {
  const { settings } = useSiteSettings();
  return <aside aria-label="Before you connect" className="mt-4 rounded-lg border border-ink-100 bg-ink-50 p-4 text-[13px] leading-6 text-ink-600 sm:p-5">
    <p className="flex items-start gap-2 font-semibold text-ink-900"><ShieldAlert aria-hidden="true" className="mt-1 h-4 w-4 shrink-0 text-ink-500" /> Check before you connect or hand over a car</p>
    <p className="mt-2">You are responsible for checking the other member, their information, documents, vehicle and insurance. {settings.site_name} only connects drivers and owners; platform-history approval is not identity verification or a safety guarantee. We do not insure vehicles or guarantee members' conduct. Agree written terms before paying or handing over a vehicle.</p>
    <Link to="/terms" target="_blank" rel="noopener noreferrer" className="mt-2 inline-block rounded-sm py-1 font-medium text-ink-800 underline decoration-ink-300 underline-offset-4 hover:text-ink-950 hover:decoration-ink-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ink-600">Read responsibilities and liability terms ↗</Link>
  </aside>;
}
