import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { distanceKm, withinLocationRadius } from '../src/lib/locationRadius.ts';

test('location radius recognizes nearby and distant Kenyan areas',()=>{
  assert.ok((distanceKm('Westlands','Kilimani')||99)<10);
  assert.equal(withinLocationRadius('Kilimani','Westlands',10),true);
  assert.equal(withinLocationRadius('Mombasa','Westlands',50),false);
  assert.equal(withinLocationRadius('Unknown estate','Unknown',10),true);
});
test('installable site has manifest and safe navigation fallback',()=>{
  const manifest=JSON.parse(readFileSync('public/manifest.webmanifest','utf8'));
  assert.equal(manifest.display,'standalone');assert.equal(manifest.name,'11Drive');
  assert.ok(manifest.icons.some((icon:{src:string;sizes:string})=>icon.src==='/app-icon-192.png'&&icon.sizes==='192x192'));
  assert.ok(manifest.icons.some((icon:{src:string;sizes:string})=>icon.src==='/app-icon-512.png'&&icon.sizes==='512x512'));
  const worker=readFileSync('public/sw.js','utf8');assert.match(worker,/request\.mode==='navigate'/);
  const intro=readFileSync('src/components/LaunchIntro.tsx','utf8');assert.match(intro,/Opening \$\{siteName\}/);assert.doesNotMatch(intro,/launch-caret/);
  assert.match(intro,/setTimeout\(onComplete, 5400\)/);
  const styles=readFileSync('src/index.css','utf8');
  assert.match(styles,/launch-slide-away/);
  assert.match(styles,/translateY\(-100%\)/);
  assert.doesNotMatch(styles,/launch-fade/);
  assert.match(intro,/backgroundType === 'video' && allowVideo/);
  assert.match(intro,/objectPosition: backgroundPosition/);
  const app=readFileSync('src/App.tsx','utf8');
  assert.match(app,/11drive-launch-intro-seen/);
  assert.match(app,/!showLaunchIntro && <span aria-hidden="true"/);
  assert.match(app,/settings\.launch_intro_enabled === 'true'/);
  assert.match(app,/settings\.launch_intro_background_enabled === 'true'/);
  const admin=readFileSync('src/pages/AdminPage.tsx','utf8');
  assert.match(admin,/Animated 11Drive launch/);
  assert.match(admin,/Background during launch/);
  const installPrompt=readFileSync('src/components/InstallAppPrompt.tsx','utf8');
  assert.match(installPrompt,/2 \* 24 \* 60 \* 60 \* 1000/);
  assert.match(installPrompt,/beforeinstallprompt/);
  assert.match(readFileSync('src/components/Layout.tsx','utf8'),/<InstallAppPrompt/);
});
test('member tools include profile, report, connection, and calendar states',()=>{
  const checklist=readFileSync('src/components/ProfileCompletionChecklist.tsx','utf8');
  assert.match(checklist,/Complete your profile/);
  assert.match(checklist,/profile-health#about-you/);
  assert.match(checklist,/profile-health#platform-history/);
  assert.match(checklist,/!photoComplete\|\|!aboutComplete\?'\/settings\?from=profile-health#profile-details'/);
  assert.match(checklist,/Next: add \{nextStep\}/);
  const onboarding=readFileSync('src/pages/DriverOnboardingPage.tsx','utf8');
  assert.match(onboarding,/Save profile details/);
  assert.match(onboarding,/update your profile health immediately/);
  assert.match(onboarding,/fromProfileHealth.*navigate\('\/dashboard'/s);
  assert.match(readFileSync('src/pages/SettingsPage.tsx','utf8'),/fromProfileHealth.*navigate\('\/dashboard'/s);
  assert.match(readFileSync('src/components/ReportFollowUpTracker.tsx','utf8'),/Under review/);
  assert.match(readFileSync('src/components/ConnectionProgress.tsx','utf8'),/Awaiting reply/);
  assert.match(readFileSync('src/components/AvailabilityCalendar.tsx','utf8'),/Weekly availability/);
  assert.match(readFileSync('src/components/AvailabilityCalendar.tsx','utf8'),/Show on profile/);
  assert.match(readFileSync('src/components/WeeklyAvailabilityView.tsx','utf8'),/!enabled\|\|!slots\.length/);
  const migration=readFileSync('supabase/migrations/20260909006000_member_experience_tools.sql','utf8');
  assert.match(migration,/UNIQUE\(user_id, day_of_week\)/);assert.match(migration,/user_id=auth\.uid\(\)/);
});
test('suspensions are atomic and queue reasoned email notifications',()=>{
  const migration=readFileSync('supabase/migrations/20260909008000_suspension_email_notification.sql','utf8');
  const admin=readFileSync('src/pages/AdminPage.tsx','utf8');
  assert.match(admin,/rpc\('admin_suspend_member'/);
  assert.match(migration,/Reason: '\|\|reason/);
  assert.match(migration,/NEW\.type IN \('connection_accepted','message','suspension'\)/);
  assert.match(migration,/event_email_html\(heading,email_message/);
});
test('reinstated members refresh immediately without signing out',()=>{
  const auth=readFileSync('src/lib/auth.tsx','utf8');
  const page=readFileSync('src/pages/SuspendedPage.tsx','utf8');
  assert.match(auth,/is_suspended: next\.is_suspended/);
  assert.match(page,/if \(profile && !profile\.is_suspended\) navigate\('\/dashboard'/);
  assert.match(page,/Check access again/);
});
test('admin reinstatement supports an optional message and both delivery channels',()=>{
  const migration=readFileSync('supabase/migrations/20260909009000_reinstatement_email_notification.sql','utf8');
  const admin=readFileSync('src/pages/AdminPage.tsx','utf8');
  assert.match(admin,/Message <span[^>]*>\(optional\)/);
  assert.match(admin,/rpc\('admin_reinstate_member'/);
  assert.match(migration,/Message from support:/);
  assert.match(migration,/NEW\.type IN \('admin_announcement','reinstatement'\)/);
  assert.match(migration,/event_email_html\(NEW\.title,NEW\.body/);
});
test('footer contact details remain readable over a full-page background',()=>{
  const footer=readFileSync('src/components/Footer.tsx','utf8');
  assert.match(footer,/relative z-10/);
  assert.match(footer,/mailto:\$\{settings\.admin_contact_email\}/);
  assert.match(footer,/bg-ink-50\/90/);
});
test('assistant answers from only the signed-in account summary',()=>{
  const context=readFileSync('src/lib/assistantAccountContext.ts','utf8');
  const assistant=readFileSync('src/components/SiteAssistant.tsx','utf8');
  assert.match(context,/\.eq\('owner_id',userId\)/);
  assert.match(context,/do not inspect private message contents/);
  assert.match(context,/Suggested next steps/);
  assert.match(assistant,/loadAssistantAccountContext\(user\.id,profile\)/);
});
