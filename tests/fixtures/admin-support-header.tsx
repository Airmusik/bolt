// Isolated layout and button checks. No real chats are changed.
import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { AdminSupportChatHeader } from '../../src/components/AdminSupportChatHeader';
import { AutoGrowTextarea } from '../../src/components/AutoGrowTextarea';
import { ConfirmDialog } from '../../src/components/ConfirmDialog';
import { Send } from 'lucide-react';
import type { Profile } from '../../src/lib/types';
import { applySiteTheme } from '../../src/lib/siteTheme';
import '../../src/index.css';
import '../../src/styles/site-palette.css';
const driver={id:'sample-driver',full_name:'Sample Driver With A Longer Name',role:'driver',avatar_url:null} as Profile;
const owner={id:'sample-owner',full_name:'Sample Car Owner',role:'owner',avatar_url:null} as Profile;
applySiteTheme('cyan');
function Fixture() {
  const [notice,setNotice]=useState('Local preview');
  const [closed,setClosed]=useState(false);
  const [confirm,setConfirm]=useState(false);
  const [text,setText]=useState('');
  const [messages,setMessages]=useState(Array.from({length:20},(_,i)=>`Saved message ${i+1}`));
  return <main className="p-3"><div className="mb-2 flex items-center justify-between gap-2"><p role="status" className="text-xs">{notice}</p><button type="button" className="btn-secondary text-xs" onClick={()=>document.documentElement.classList.toggle('dark')}>Theme</button></div><div style={{height:590}} className="card flex min-h-0 min-w-0 flex-col overflow-hidden">
    <AdminSupportChatHeader driver={driver} owner={owner} closed={closed} supportSessionActive={!closed} joined={!closed} canLeave={false} joining={false} leaving={false} onBack={()=>setNotice('Back to support chats')} onViewUser={p=>setNotice(`View ${p.role}: ${p.full_name}`)} onJoin={()=>setClosed(false)} onLeave={()=>setNotice('Leave selected')} onCloseChat={()=>setConfirm(true)} />
    <div role="region" aria-label="Preview message history" tabIndex={0} className="min-h-0 flex-1 space-y-2 overflow-y-auto overscroll-contain bg-ink-50 p-3">{messages.map((m,i)=><p key={i} className="card rounded-lg p-3 text-sm text-ink-900">{m}</p>)}</div>
    {!closed && <div className="flex shrink-0 items-end gap-2 border-t border-ink-100 p-3"><AutoGrowTextarea value={text} onChange={e=>setText(e.target.value)} className="input min-h-10 min-w-0 flex-1 py-2.5" aria-label="Preview message" placeholder="Type a message…"/><button type="button" aria-label="Send preview message" className="btn-primary px-3" disabled={!text.trim()} onClick={()=>{setMessages(v=>[...v,text]);setText('');setNotice('Preview message sent');}}><Send className="h-4 w-4"/></button></div>}
    {closed && <p className="shrink-0 p-3 text-xs">Read-only · history preserved</p>}
  </div>{confirm && <ConfirmDialog title="End this support session?" message="Preview only. Message history remains saved." confirmLabel="End support chat" onConfirm={()=>{setClosed(true);setNotice('Preview session ended');}} onClose={()=>setConfirm(false)}/>}</main>;
}
createRoot(document.getElementById('root')!).render(<Fixture/>);
