import { useEffect,useState } from 'react';
import { Download,History } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { type SiteSettings,useSiteSettings } from '@/lib/siteSettings';
import { ADMIN_CONTROL_GROUPS as groups } from '@/lib/adminControlFields';
import { useToast } from './useToast';


type Audit={id:number;key:string;old_value:string|null;new_value:string|null;changed_at:string;admin_id:string};
export function AdminControlCentre({ settings: draft, onChange: setDraft }: { settings: SiteSettings; onChange: React.Dispatch<React.SetStateAction<SiteSettings>> }) {
 const { settings: live } = useSiteSettings(); const { toast } = useToast(); const [audit,setAudit]=useState<Audit[]>([]);
 useEffect(() => {
   let active = true;
   void supabase.from('admin_settings_audit').select('*').order('changed_at',{ascending:false}).limit(50).then(({data,error}) => {
     if (active && !error) setAudit((data as Audit[]) || []);
   });
   return () => { active = false; };
 }, [live]);
 const csv=(rows:Record<string,unknown>[])=>{if(!rows.length)return '';const keys=Object.keys(rows[0]);const cell=(v:unknown)=>`"${String(v??'').replace(/"/g,'""')}"`;return [keys.map(cell).join(','),...rows.map(row=>keys.map(key=>cell(row[key])).join(','))].join('\n')};
 const exportData=async(kind:'members'|'vehicles'|'reports')=>{const query=kind==='members'?supabase.rpc('admin_list_members'):supabase.from(kind).select('*');const{data,error}=await query;if(error)return toast(error.message,'error');const content=csv((data as Record<string,unknown>[])||[]);const link=document.createElement('a');link.href=URL.createObjectURL(new Blob([content],{type:'text/csv'}));link.download=`11drive-${kind}-${new Date().toISOString().slice(0,10)}.csv`;link.click();setTimeout(()=>URL.revokeObjectURL(link.href),1000)};
 return <div className="space-y-5"><div><h3 className="text-lg font-bold text-ink-900">Platform controls</h3><p className="mt-1 text-sm text-ink-500">Operations, member requirements, notifications and data tools. Use Save changes above to apply edits.</p></div>
  <div className="grid gap-4 xl:grid-cols-2">{groups.map(group=><section key={group.title} className="card p-5"><h3 className="font-bold text-ink-900">{group.title}</h3><p className="mt-1 text-xs leading-5 text-ink-500">{group.description}</p><div className="mt-4 space-y-3">{group.fields.map(field=><div key={field.key}>{field.type==='toggle'?<label className="flex items-center justify-between gap-4 rounded-xl border border-ink-200 p-3 text-sm font-medium text-ink-800"><span>{field.label}</span><input type="checkbox" className="h-5 w-5 accent-orange-600" checked={draft[field.key]==='true'} onChange={event=>setDraft(current=>({...current,[field.key]:String(event.target.checked)}))}/></label>:<><label className="label" htmlFor={`control-${field.key}`}>{field.label}</label>{field.type==='textarea'?<textarea id={`control-${field.key}`} className="input min-h-24" value={draft[field.key]} onChange={event=>setDraft(current=>({...current,[field.key]:event.target.value}))}/>:<input id={`control-${field.key}`} type={field.type==='number'?'number':'text'} min={field.type==='number'?0:undefined} className="input" value={draft[field.key]} onChange={event=>setDraft(current=>({...current,[field.key]:event.target.value}))}/>} {field.hint&&<p className="mt-1 text-xs text-ink-400">{field.hint}</p>}</>}</div>)}</div></section>)}</div>
  <section className="card p-5"><h3 className="font-bold text-ink-900">Featured content</h3><p className="mt-1 text-sm text-ink-500">Choose individual featured vehicles from the Cars admin area. The homepage limits above control how many are shown. Approved drivers continue to be ranked by promotion and trust status.</p></section>
  <section className="card p-5"><h3 className="font-bold text-ink-900">Data exports</h3><p className="mt-1 text-sm text-ink-500">Download a current CSV for offline review.</p><div className="mt-3 flex flex-wrap gap-2">{(['members','vehicles','reports'] as const).map(kind=><button key={kind} className="btn-secondary capitalize" onClick={()=>void exportData(kind)}><Download className="h-4 w-4"/>{kind}</button>)}</div></section>
  <section className="card p-5"><h3 className="flex items-center gap-2 font-bold text-ink-900"><History className="h-4 w-4"/>Admin settings activity</h3><div className="mt-3 divide-y divide-ink-100">{audit.map(item=><div key={item.id} className="py-3 text-sm"><p className="font-medium text-ink-800">{item.key.replace(/_/g,' ')}</p><p className="break-words text-xs text-ink-500">{item.old_value||'empty'} → {item.new_value||'empty'} · {new Date(item.changed_at).toLocaleString()}</p></div>)}{!audit.length&&<p className="text-sm text-ink-500">No recorded setting changes yet.</p>}</div></section>
 </div>}
