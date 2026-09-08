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
  const worker=readFileSync('public/sw.js','utf8');assert.match(worker,/request\.mode==='navigate'/);
});
test('member tools include profile, report, connection, and calendar states',()=>{
  assert.match(readFileSync('src/components/ProfileCompletionChecklist.tsx','utf8'),/Complete your profile/);
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
