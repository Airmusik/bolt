import { useEffect, useState } from 'react';
import { Flag } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import type { Report } from '@/lib/types';
import { formatDateTime } from '@/lib/utils';

export function ReportFollowUpTracker({userId}:{userId:string}){const[reports,setReports]=useState<Report[]>([]);useEffect(()=>{const load=()=>void supabase.from('reports').select('*').eq('reporter_id',userId).order('created_at',{ascending:false}).limit(5).then(({data})=>setReports((data as Report[])||[]));load();const channel=supabase.channel(`my-report-status-${userId}`).on('postgres_changes',{event:'UPDATE',schema:'public',table:'reports',filter:`reporter_id=eq.${userId}`},load).subscribe();return()=>{void supabase.removeChannel(channel)}},[userId]);if(!reports.length)return null;return <section className="dashboard-panel"><h3 className="flex items-center gap-2 text-sm font-semibold text-ink-900"><Flag className="h-4 w-4"/>Your report follow-up</h3><div className="mt-3 space-y-2">{reports.map(report=><div key={report.id} className="flex items-start justify-between gap-3 rounded-xl bg-ink-50 p-3"><div><p className="text-xs font-semibold text-ink-800">{report.reason}</p><p className="mt-1 text-[11px] text-ink-400">Submitted {formatDateTime(report.created_at)}</p></div><span className={`badge capitalize ${report.status==='resolved'?'badge-brand':report.status==='dismissed'?'badge-neutral':'badge-warning'}`}>{report.status==='reviewing'?'Under review':report.status}</span></div>)}</div></section>}

