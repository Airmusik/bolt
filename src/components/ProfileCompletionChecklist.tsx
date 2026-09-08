import { CheckCircle2, Circle, UserRoundCheck } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { Profile } from '@/lib/types';

export function ProfileCompletionChecklist({profile}:{profile:Profile}){
 const photoComplete=!!profile.avatar_url;
 const aboutComplete=!!profile.location&&(profile.languages||[]).length>=2&&(profile.bio||'').trim().length>=20;
 const driverDetailsComplete=profile.role!=='driver'||(!!profile.age&&profile.age>=18&&profile.driving_experience_years>=1);
 const historyComplete=profile.role!=='driver'||!!profile.platform_history_submitted;
 const items=[['Profile photo',photoComplete],['Specific residential area',!!profile.location],['At least two languages',(profile.languages||[]).length>=2],['Helpful introduction',(profile.bio||'').trim().length>=20],...(profile.role==='driver'?[['Age and experience',driverDetailsComplete],['Platform history submitted',historyComplete]]:[]) ] as [string,boolean][];
 const done=items.filter(([,complete])=>complete).length, percent=Math.round(done/items.length*100);
 const finishPath=!photoComplete||!aboutComplete?'/settings?from=profile-health#profile-details':profile.role==='driver'&&!driverDetailsComplete?'/onboarding?from=profile-health#about-you':profile.role==='driver'&&!historyComplete?'/onboarding?from=profile-health#platform-history':'/settings?from=profile-health#profile-details';
 const nextStep=!photoComplete?'profile photo':!aboutComplete?'profile details':profile.role==='driver'&&!driverDetailsComplete?'age and driving experience':profile.role==='driver'&&!historyComplete?'platform history':'remaining profile information';
 if(percent===100)return null;
 return <section className="dashboard-panel"><div className="flex items-center justify-between gap-3"><div><p className="flex items-center gap-2 font-semibold text-ink-900"><UserRoundCheck className="h-4 w-4"/>Complete your profile</p><p className="mt-1 text-xs text-ink-500">Complete profiles are easier for other members to understand.</p></div><strong className="text-sm text-brand-700">{percent}%</strong></div><div className="mt-3 h-2 overflow-hidden rounded-full bg-ink-100"><div className="h-full rounded-full bg-emerald-500 transition-all" style={{width:`${percent}%`}}/></div><ul className="mt-3 grid gap-2 sm:grid-cols-2">{items.map(([label,complete])=><li key={label} className={`flex items-center gap-2 text-xs ${complete?'text-emerald-700':'text-ink-600'}`}>{complete?<CheckCircle2 className="h-4 w-4"/>:<Circle className="h-4 w-4"/>}{label}</li>)}</ul><Link to={finishPath} aria-label={`Finish profile: add ${nextStep}`} className="btn-secondary mt-4 text-xs">Finish profile</Link><p className="mt-2 text-[11px] text-ink-500">Next: add {nextStep}.</p></section>
}
