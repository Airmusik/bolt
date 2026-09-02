import { Link } from 'react-router-dom';
import { ShieldAlert } from 'lucide-react';
import { useSiteSettings } from '@/lib/siteSettings';

export function MemberSafetyNotice() {
  const { settings } = useSiteSettings();
  return <aside className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs leading-5 text-amber-950 dark:bg-amber-950/25 dark:text-amber-100">
    <p className="flex items-center gap-2 font-bold"><ShieldAlert className="h-4 w-4 shrink-0" /> Check before you connect or hand over a car</p>
    <p className="mt-1">You are responsible for checking the other member, their information, documents, vehicle and insurance. {settings.site_name} only connects drivers and owners; platform-history approval is not identity verification or a safety guarantee. We do not insure vehicles or guarantee members' conduct. Agree written terms before paying or handing over a vehicle.</p>
    <Link to="/terms" target="_blank" rel="noopener noreferrer" className="mt-2 inline-block font-semibold underline">Read responsibilities and liability terms ↗</Link>
  </aside>;
}
