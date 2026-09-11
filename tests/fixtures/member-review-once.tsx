/* eslint-disable @typescript-eslint/no-explicit-any -- Isolated fluent mock; never part of production. */
import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { AuthContext, type AuthContextValue } from '../../src/lib/authContext';
import { ToastContext } from '../../src/components/toastContext';
import type { Conversation } from '../../src/lib/types';
import '../../src/index.css';
window.fetch = async () => { throw new Error('Network disabled in the review fixture'); };
const { supabase } = await import('../../src/lib/supabase');
const { MemberReviewButton } = await import('../../src/components/MemberReviewButton');
const reviews: {id: string; reviewer_id: string; reviewee_id: string}[] = [];
if (new URLSearchParams(location.search).has('reviewed')) reviews.push({id:'existing',reviewer_id:'me',reviewee_id:'peer'});
supabase.from = (() => {
  let rows = reviews;
  const query: any = { select: () => query, eq: (key: 'reviewer_id'|'reviewee_id', value: string) => { rows = rows.filter(row => row[key] === value); return query; }, limit: () => query, maybeSingle: async () => ({data:rows[0] || null,error:null}) };
  return query;
}) as typeof supabase.from;
supabase.rpc = (async () => { const data={id:'saved',reviewer_id:'me',reviewee_id:'peer'}; if (!reviews.length) reviews.push(data); return {data,error:null}; }) as any;
supabase.channel = (() => { const channel: any = {on:()=>channel,subscribe:()=>channel}; return channel; }) as typeof supabase.channel;
supabase.removeChannel = (async () => 'ok') as typeof supabase.removeChannel;
export function Fixture() {
  const [chat,setChat]=useState(1);
  const [notice,setNotice]=useState('');
  return <AuthContext.Provider value={{user:{id:'me'},profile:{id:'me',role:'owner'},loading:false} as AuthContextValue}><ToastContext.Provider value={{toast:message=>setNotice(message)}}>
    <main className="p-5"><h1>Isolated member rating test</h1><p>No real ratings are sent.</p><p role="status">{notice}</p>
      <MemberReviewButton key={chat} memberName="Test Driver" conversation={{id:`chat-${chat}`,connection_id:`connection-${chat}`,driver_id:'peer',owner_id:'me'} as Conversation} />
      <button className="btn-secondary mt-5" onClick={()=>setChat(chat+1)}>Reopen different chat with same member</button>
    </main>
  </ToastContext.Provider></AuthContext.Provider>;
}
createRoot(document.getElementById('root')!).render(<Fixture />);
