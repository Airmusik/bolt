import { supabase } from './supabase';
import type { Profile } from './types';

type Row={status?:string;approval_status?:string;read?:boolean;verified?:boolean;rejected?:boolean;expiry_date?:string|null;enabled?:boolean};
export type AssistantAccountContext={profile:Profile;vehicles:Row[];applications:Row[];connections:Row[];conversations:Row[];notifications:Row[];reports:Row[];documents:Row[];promotions:Row[];availabilityEnabled:boolean};
const count=(rows:Row[],field:keyof Row,value:unknown)=>rows.filter(row=>row[field]===value).length;
const includesAny=(query:string,terms:string[])=>terms.some(term=>query.includes(term));

export async function loadAssistantAccountContext(userId:string,profile:Profile):Promise<AssistantAccountContext>{
  const [vehicles,applications,connections,conversations,notifications,reports,documents,promotions,availability]=await Promise.all([
    supabase.from('vehicles').select('status,approval_status').eq('owner_id',userId).is('deleted_at',null),
    supabase.from('applications').select('status').or(`driver_id.eq.${userId},owner_id.eq.${userId}`),
    supabase.from('connections').select('status').or(`requester_id.eq.${userId},recipient_id.eq.${userId}`),
    supabase.from('conversations').select('id').or(`driver_id.eq.${userId},owner_id.eq.${userId}`),
    supabase.from('notifications').select('read').eq('user_id',userId),
    supabase.from('reports').select('status').eq('reporter_id',userId),
    supabase.from('documents').select('verified,rejected,expiry_date').eq('user_id',userId),
    supabase.from('promotion_requests').select('status').eq('user_id',userId),
    supabase.from('availability_settings').select('enabled').eq('user_id',userId).maybeSingle(),
  ]);
  return {profile,vehicles:(vehicles.data||[]) as Row[],applications:(applications.data||[]) as Row[],connections:(connections.data||[]) as Row[],conversations:(conversations.data||[]) as Row[],notifications:(notifications.data||[]) as Row[],reports:(reports.data||[]) as Row[],documents:(documents.data||[]) as Row[],promotions:(promotions.data||[]) as Row[],availabilityEnabled:Boolean(availability.data?.enabled)};
}

export function answerAccountQuestion(raw:string,c:AssistantAccountContext):{text:string;path?:string;label?:string}|null{
  const q=raw.toLowerCase();
  const p=c.profile;
  const asksAboutOwnAccount=/\b(my|me|mine|account|pending|unread|status|how many|do i|am i|i have)\b/.test(q);
  if(!asksAboutOwnAccount)return null;
  if(includesAny(q,['my name','my email','my phone','my location','my profile','profile status'])) return {text:`Your account is registered as ${p.full_name} (${p.role}). Email: ${p.email||'not set'}. Phone: ${p.phone||'not set'}. Location: ${p.location||'not set'}. Profile status: ${p.onboarding_completed?'complete':'needs completion'}${p.is_suspended?' and suspended':''}.`,path:p.role==='driver'?'/onboarding':'/settings',label:'Manage profile'};
  if(includesAny(q,['vehicle','vehicles','car listing','my cars','my listings'])) return {text:`You have ${c.vehicles.length} vehicle listing${c.vehicles.length===1?'':'s'}: ${count(c.vehicles,'approval_status','approved')} approved, ${count(c.vehicles,'approval_status','pending')} awaiting review, and ${count(c.vehicles,'approval_status','rejected')} rejected.`,path:'/dashboard?tab=vehicles',label:'View vehicles'};
  if(includesAny(q,['application','applications'])) return {text:`You have ${c.applications.length} application record${c.applications.length===1?'':'s'}: ${count(c.applications,'status','pending')} pending, ${count(c.applications,'status','accepted')} accepted, ${count(c.applications,'status','completed')} completed, and ${count(c.applications,'status','rejected')+count(c.applications,'status','withdrawn')} closed or withdrawn.`,path:'/dashboard?tab=applications',label:'View applications'};
  if(includesAny(q,['connection','connections','request sent','request received'])) return {text:`Your account has ${c.connections.length} connection record${c.connections.length===1?'':'s'}: ${count(c.connections,'status','pending')} pending and ${count(c.connections,'status','accepted')} accepted.`,path:'/dashboard?tab=connections',label:'View connections'};
  if(includesAny(q,['chat','chats','conversation','messages'])) return {text:`You currently have ${c.conversations.length} conversation${c.conversations.length===1?'':'s'}. I only use conversation counts here and do not inspect private message contents.`,path:'/chat',label:'Open chats'};
  if(includesAny(q,['notification','notifications','unread'])) return {text:`You have ${count(c.notifications,'read',false)} unread notification${count(c.notifications,'read',false)===1?'':'s'} out of ${c.notifications.length} total.`,path:'/notifications',label:'View notifications'};
  if(includesAny(q,['report','reports','complaint'])) return {text:`You have submitted ${c.reports.length} report${c.reports.length===1?'':'s'}: ${count(c.reports,'status','open')} open, ${count(c.reports,'status','reviewing')} under review, and ${count(c.reports,'status','resolved')} resolved.`,path:'/dashboard',label:'View follow-up'};
  if(includesAny(q,['document','documents','proof','verification'])) return {text:`You have ${c.documents.length} document record${c.documents.length===1?'':'s'}: ${count(c.documents,'verified',true)} approved and ${count(c.documents,'rejected',true)} rejected. Review your account documents for any pending or expiring items.`,path:p.role==='driver'?'/onboarding':'/dashboard?tab=vehicles',label:'Review documents'};
  if(includesAny(q,['promotion','promotions','promoted'])) return {text:`You have ${c.promotions.length} promotion record${c.promotions.length===1?'':'s'}, including ${count(c.promotions,'status','active')} active and ${count(c.promotions,'status','pending')} pending.`,path:'/dashboard',label:'View promotions'};
  if(includesAny(q,['availability','calendar','schedule'])) return {text:`Your optional weekly availability calendar is ${c.availabilityEnabled?'visible on your profile':'currently hidden'}.`,path:'/settings',label:'Manage availability'};
  if(includesAny(q,['my activity','account activity','account overview','how is my account','what should i do next'])){const actions=[];if(!p.onboarding_completed)actions.push('complete your profile');if(count(c.notifications,'read',false))actions.push(`review ${count(c.notifications,'read',false)} unread notifications`);if(count(c.connections,'status','pending'))actions.push(`check ${count(c.connections,'status','pending')} pending connections`);if(count(c.applications,'status','pending'))actions.push(`check ${count(c.applications,'status','pending')} pending applications`);return {text:`Account summary: ${c.vehicles.length} vehicles, ${c.applications.length} applications, ${c.connections.length} connections, ${c.conversations.length} chats, and ${count(c.notifications,'read',false)} unread notifications.${actions.length?` Suggested next steps: ${actions.join(', ')}.`:' There are no obvious pending actions right now.'}`,path:'/dashboard',label:'Open dashboard'};}
  return null;
}
