// DEV-ONLY integration fixture. All network calls and mutations are isolated.
/* eslint-disable @typescript-eslint/no-explicit-any -- Dynamic fluent Supabase mock, never included in the production build. */
import { createRoot } from 'react-dom/client';
import { useState } from 'react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { AuthContext, type AuthContextValue } from '../../src/lib/authContext';
import { ToastContext } from '../../src/components/toastContext';
import '../../src/index.css';
import '../../src/styles/site-palette.css';
import '../../src/styles/admin.css';
window.fetch = async () => { throw new Error('Network disabled in the inbox fixture'); };
const { supabase } = await import('../../src/lib/supabase');
const { SiteSettingsProvider } = await import('../../src/lib/siteSettings');
const { ChatPage } = await import('../../src/pages/ChatPage');
const { AdminMessageInbox } = await import('../../src/pages/AdminPage');
const params = new URLSearchParams(window.location.search);
const scenario = params.get('scenario');
const adminView = scenario === 'admin';
const me = { id: 'member', full_name: 'Test Owner', role: scenario === 'driver' ? 'driver' : 'owner', email: 'test@example.test' };
const peer = { id: 'peer', full_name: 'Test Partner', role: 'driver' };
const admin = { id: 'admin', full_name: 'Support Agent', role: 'admin' };
const date = (day: number) => `2026-09-${String(day).padStart(2, '0')}T12:00:00Z`;
const conv = (id: string, support = false, closed = false) => ({ id, driver_id: support ? null : 'peer', owner_id: 'member', admin_id: support ? 'admin' : null, driver: support ? null : peer, owner: me, admin: support ? admin : null, created_at: date(1), last_message_at: date(closed ? 1 : 3), closed_at: closed ? date(2) : null });
const entry = (id: string, thread: string, body: string, day: number, role = 'user') => ({ id, contact_message_id: thread, sender_id: role === 'admin' ? 'admin' : 'member', sender_role: role, body, created_at: date(day), sender: role === 'admin' ? admin : me });
const copied = entry('copied', 'old-request', 'Original support reply', 1, 'admin');
const contacts = scenario === 'legacy-only' || scenario === 'empty' ? [] : [
  { id: 'new-request', user_id: 'member', user: me, name: me.full_name, email: me.email, status: 'new', message: 'Current request', created_at: date(2), updated_at: date(3), entries: [entry('current', 'new-request', 'Current request', 3)] },
  { id: 'old-request', user_id: 'member', user: me, name: me.full_name, email: me.email, status: 'open', legacy_conversation_id: 'legacy-support', message: copied.body, created_at: date(1), updated_at: date(1), entries: [copied] },
];
const db: Record<string, any[]> = {
  conversations: scenario === 'empty' ? [] : [conv('legacy-support', true), conv('current-member'), conv('ended-member', false, true), conv('second-admin', true)],
  contact_messages: contacts,
  messages: scenario === 'empty' ? [] : [
    { id: 'original', conversation_id: 'legacy-support', sender_id: 'admin', content: copied.body, type: 'text', read: true, created_at: date(1), sender: admin },
    { id: 'original-new', conversation_id: 'legacy-support', sender_id: 'member', content: 'Reply after the old migration', type: 'text', read: true, created_at: date(2), sender: me },
    { id: 'peer-old', conversation_id: 'ended-member', sender_id: 'peer', content: 'Earlier connection history', type: 'text', read: true, created_at: date(1), sender: peer },
    { id: 'peer-new', conversation_id: 'current-member', sender_id: 'member', content: 'Continued conversation', type: 'text', read: true, created_at: date(3), sender: me },
  ],
  site_settings: [{ key: 'site_name', value: '11Drive' }],
};
supabase.from = ((table: string) => {
  let rows = [...(db[table] || [])], single = false;
  const query: any = {
    select: () => query, order: () => query, or: () => query, is: () => query,
    eq: (key: string, value: unknown) => { rows = rows.filter(row => row[key] === value); return query; },
    neq: (key: string, value: unknown) => { rows = rows.filter(row => row[key] !== value); return query; },
    in: (key: string, values: unknown[]) => { rows = rows.filter(row => values.includes(row[key])); return query; },
    range: (start: number, end: number) => { rows = rows.slice(start, end + 1); return query; },
    limit: (count: number) => { rows = rows.slice(0, count); return query; },
    maybeSingle: () => { single = true; return query; }, update: () => query,
    insert: (value: any) => {
      if (table !== 'contact_message_entries') throw new Error('Unexpected fixture write');
      const thread = contacts.find(item => item.id === value.contact_message_id);
      if (thread) thread.entries.push({ ...entry(crypto.randomUUID(), thread.id, value.body, 4, value.sender_role), ...value });
      return query;
    },
    then: (resolve: any, reject: any) => Promise.resolve({ data: single ? rows[0] || null : rows, error: null }).then(resolve, reject),
  };
  return query;
}) as typeof supabase.from;
supabase.rpc = ((name: string, args: any) => {
  if (name === 'send_member_support_message') {
    const thread = { id: 'created-request', user_id: 'member', user: me, name: me.full_name, email: me.email, status: 'new', message: args.p_message, created_at: date(4), updated_at: date(4), entries: [entry('created-entry', 'created-request', args.p_message, 4)] };
    contacts.unshift(thread); db.contact_messages = contacts;
    return Promise.resolve({ data: thread.id, error: null });
  }
  return Promise.resolve({ data: null, error: null });
}) as typeof supabase.rpc;
supabase.channel = (() => { const channel: any = { on: () => channel, subscribe: () => channel, send: async () => 'ok' }; return channel; }) as typeof supabase.channel;
supabase.removeChannel = (async () => 'ok') as typeof supabase.removeChannel;
export function LocationLabel() { const location = useLocation(); return <p className="p-2 text-xs" data-testid="route">{location.pathname}{location.search}</p>; }
export function Fixture() {
  const [revision, setRevision] = useState(0);
  const actor = adminView ? admin : me;
  return <AuthContext.Provider value={{ user: { id: actor.id, email: me.email }, profile: actor, loading: false, refreshProfile: async () => {} } as AuthContextValue}>
    <ToastContext.Provider value={{ toast: () => {} }}><SiteSettingsProvider><MemoryRouter initialEntries={[adminView ? '/admin?tab=contact&message=old-request' : scenario === 'legacy-link' ? '/chat/legacy-support' : '/chat']}>
      <p className="bg-ink-50 p-2 text-xs">Isolated inbox test · no real data or messages</p><LocationLabel />
      <button className="btn-secondary m-2" onClick={() => document.documentElement.classList.toggle('dark')}>Toggle test theme</button>
      {adminView ? <main className="admin-portal container-content" data-revision={revision}><AdminMessageInbox messages={contacts as any} adminId="admin" siteName="11Drive" onRefresh={() => setRevision(value => value + 1)} onResolve={() => {}} onDelete={() => {}} onViewUser={() => {}} /></main>
        : <Routes><Route path="/chat/:conversationId?" element={<ChatPage />} /></Routes>}
    </MemoryRouter></SiteSettingsProvider></ToastContext.Provider>
  </AuthContext.Provider>;
}
createRoot(document.getElementById('root')!).render(<Fixture />);
