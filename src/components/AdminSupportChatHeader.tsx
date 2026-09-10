import { ArrowLeft, Check, Eye, Headphones, LockKeyhole, UserMinus, UserPlus } from 'lucide-react';
import type { Profile } from '@/lib/types';
import { Avatar } from './Avatar';

export function AdminSupportChatHeader({ driver, owner, closed, supportSessionActive, joined, canLeave, joining, leaving, onBack, onViewUser, onJoin, onLeave, onCloseChat }: {
  driver?: Profile; owner?: Profile; closed: boolean; supportSessionActive: boolean; joined: boolean;
  canLeave: boolean; joining: boolean; leaving: boolean; onBack: () => void;
  onViewUser: (profile: Profile) => void; onJoin: () => void; onLeave: () => void; onCloseChat: () => void;
}) {
  return <header className="admin-support-chat-header shrink-0 space-y-2 border-b border-ink-100 p-3 sm:p-4">
    <div className="flex items-center justify-between gap-3">
      <button type="button" onClick={onBack} className="inline-flex min-h-10 items-center gap-1 rounded-lg px-2 text-xs font-semibold text-ink-600 hover:bg-ink-100"><ArrowLeft className="h-4 w-4 shrink-0" /> Back to support chats</button>
      {joined && !closed && <span className="badge-success shrink-0"><Check className="h-3.5 w-3.5" /> Joined</span>}
    </div>
    <div className="grid min-w-0 grid-cols-2 gap-2">
      {([['Driver', driver], ['Car owner', owner]] as const).map(([role, member]) => member && <button key={role} type="button" onClick={() => onViewUser(member)} aria-label={role === 'Driver' ? 'View driver' : 'View owner'} className="flex min-w-0 items-center gap-2 rounded-lg border border-ink-200 p-2 text-left hover:bg-ink-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500">
        <span className="hidden shrink-0 sm:block"><Avatar name={member.full_name} src={member.avatar_url} size={32} verified={member.role === 'driver' && member.is_verified} /></span>
        <span className="min-w-0 flex-1"><span className="block text-[11px] text-ink-500">{role}</span><span className="block break-words text-sm font-semibold leading-5 text-ink-900">{member.full_name}</span></span>
        <Eye className="h-4 w-4 shrink-0 text-ink-400" />
      </button>)}
    </div>
    <p className="text-xs leading-5 text-ink-600">{closed ? 'Ended · preserved history' : supportSessionActive ? 'Reopened support session · members can chat' : 'Active driver and car-owner chat · support invited'}</p>
    {(closed || !joined || canLeave || (driver && owner)) && <div className="flex flex-wrap gap-2 [&>button]:min-h-10 [&>button]:flex-1 [&>button]:whitespace-nowrap sm:[&>button]:flex-none">
      {closed ? <button type="button" onClick={onJoin} disabled={joining} className="btn-primary text-xs"><Headphones className="h-4 w-4 shrink-0" />{joining ? 'Reopening…' : 'Reopen with support'}</button> : !joined && <button type="button" onClick={onJoin} disabled={joining} className="btn-primary text-xs"><UserPlus className="h-4 w-4 shrink-0" />{joining ? 'Joining…' : 'Join chat'}</button>}
      {canLeave && <button type="button" onClick={onLeave} disabled={leaving} className="btn-secondary text-xs"><UserMinus className="h-4 w-4 shrink-0" />Leave chat</button>}
      {driver && owner && !closed && <button type="button" onClick={onCloseChat} className="btn-secondary text-xs"><LockKeyhole className="h-4 w-4 shrink-0" />{supportSessionActive ? 'End support chat' : 'Close chat'}</button>}
    </div>}
  </header>;
}
