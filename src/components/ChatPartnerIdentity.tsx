import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import type { Profile } from '@/lib/types';
import { useSiteSettings } from '@/lib/siteSettings';
import { SiteLogo } from './SiteLogo';
import { Avatar } from './Avatar';
import { VerifiedBadge } from './VerifiedBadge';

export function ChatPartnerIdentity({ member, support, children }: { member: Profile; support: boolean; children?: ReactNode }) {
  const { settings } = useSiteSettings();
  return <>
    {support ? <SiteLogo size={40} /> : <Link to={`/members/${member.id}`} title={`View ${member.full_name}'s profile`} aria-label={`View ${member.full_name}'s profile`} className="shrink-0 rounded-full focus:outline-none focus:ring-2 focus:ring-brand-400"><Avatar name={member.full_name} src={member.avatar_url} size={40} verified={member.role === 'driver' && member.platform_history_approved} /></Link>}
    <div className="min-w-0">
      {support ? <p className="break-words text-sm font-semibold text-ink-900">Official {settings.site_name} Support</p> : <Link to={`/members/${member.id}`} className="flex items-center gap-1 truncate font-semibold text-ink-900 hover:underline">{member.full_name}<VerifiedBadge verified={member.role === 'driver' && member.platform_history_approved} size={12} /></Link>}
      {children}
    </div>
  </>;
}
