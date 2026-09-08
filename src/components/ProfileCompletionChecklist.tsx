import { CheckCircle2, Circle, UserRoundCheck } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { Profile } from '@/lib/types';

export function ProfileCompletionChecklist({profile}:{profile:Profile}){
 const items=[['Profile photo',!!profile.avatar_url],['Specific residential area',!!profile.location],['At least two languages',(profile.languages||[]).length>=2],['Helpful introduction',(profile.bio||'').trim().length>=20],...(profile.role==='driver'?[['Age and experience',!!profile.age&&profile.driving_experience_years>=0],['Platform history submitted',!!profile.platform_history_submitted]]:[]) ] as [string,boolean][];
 const done=items.filter(([,complete])=>complete).length, percent=Math.round(done/items.length*100);
 if(percent===100)return null;
 return <section className="dashboard-panel"><div className="flex items-center justify-between gap-3"><div><p className="flex items-center gap-2 font-semibold text-ink-900"><UserRoundCheck className="h-4 w-4"/>Complete your profile</p><p className="mt-1 text-xs text-ink-500">Complete profiles are easier for other members to understand.</p></div><strong className="text-sm text-brand-700">{percent}%</strong></div><div className="mt-3 h-2 overflow-hidden rounded-full bg-ink-100"><div className="h-full rounded-full bg-emerald-500 transition-all" style={{width:`${percent}%`}}/></div><ul className="mt-3 grid gap-2 sm:grid-cols-2">{items.map(([label,complete])=><li key={label} className={`flex items-center gap-2 text-xs ${complete?'text-emerald-700':'text-ink-600'}`}>{complete?<CheckCircle2 className="h-4 w-4"/>:<Circle className="h-4 w-4"/>}{label}</li>)}</ul><Link to={profile.role==='driver'?'/onboarding':'/settings'} className="btn-secondary mt-4 text-xs">Finish profile</Link></section>
}

