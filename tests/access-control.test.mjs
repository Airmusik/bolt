import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { auditIsolatedPolicies } from '../scripts/audit-isolated-policies.mjs';

// Schema/policies/functions only, captured before the fix. No real member rows.
const snapshot = JSON.parse(await readFile(new URL('./fixtures/access-control-baseline.json',import.meta.url),'utf8'));
const migration = await readFile(new URL('../supabase/migrations/20260902210000_access_control_audit_fixes.sql',import.meta.url),'utf8');

test('launch-audit access controls against the deployed schema and synthetic users',async t => {
  await auditIsolatedPolicies(snapshot,{migrations:[migration],onlyVerify:true,verify:async(db,ids)=>{
    const {owner,driver,other,admin,vehicle,pendingVehicle,application,connection,unusedConnection,thread,conversation}=ids;
    const denied = async fn => {
      await db.exec('SAVEPOINT expected_denial');
      try { await assert.rejects(fn,error=>['42501','P0001'].includes(error.code)); }
      finally { await db.exec('ROLLBACK TO SAVEPOINT expected_denial; RELEASE SAVEPOINT expected_denial'); }
    };
    async function asUser(id,role='authenticated') {
      await db.exec('RESET ROLE');
      await db.query("SELECT set_config('request.jwt.claim.sub',$1,true),set_config('request.jwt.claim.role',$2,true)",[id,role]);
      await db.exec(`SET LOCAL ROLE ${role}`);
    }
    async function check(name,id,fn,setup) {
      await t.test(name,async()=>{
        await db.exec('BEGIN');
        try { if(setup) await setup(); await asUser(id,id?'authenticated':'anon'); await fn(); }
        finally { await db.exec('ROLLBACK'); }
      });
    }
    const count = async(sql,args=[]) => Number((await db.query(sql,args)).rows[0].count);
    const requestSupport = async()=> {
      await asUser(owner);
      return (await db.query('SELECT public.request_conversation_support($1,$2) AS id',[conversation,'Please help with this synthetic dispute'])).rows[0].id;
    };
    await check('anonymous public discovery works but private contacts are denied','',async()=>{
      assert.ok(await count('SELECT count(id) FROM public.profiles')>0);
      for(const column of ['email','phone','licence_number']) await denied(()=>db.query(`SELECT ${column} FROM public.profiles`));
      assert.ok(Array.isArray((await db.query('SELECT discover_drivers() AS drivers')).rows[0].drivers));
      assert.ok(Array.isArray((await db.query('SELECT discover_vehicles() AS vehicles')).rows[0].vehicles));
    });
    await check('private contacts remain available to their owner through the self RPC',owner,async()=>{
      const self=(await db.query('SELECT id,email FROM public.get_my_profile()')).rows;
      assert.equal(self.length,1); assert.equal(self[0].id,owner); assert.ok(self[0].email.endsWith('@example.test'));
      await denied(()=>db.query('SELECT email,phone FROM public.profiles'));
      await denied(()=>db.query('SELECT * FROM public.admin_list_profiles()'));
    });
    await check('members cannot self-promote or edit another account/listing',owner,async()=>{
      await denied(()=>db.query("UPDATE profiles SET role='admin' WHERE id=$1",[owner]));
      await denied(()=>db.query('UPDATE profiles SET rating=1 WHERE id=$1',[owner]));
      assert.equal((await db.query("UPDATE profiles SET bio='bad edit' WHERE id=$1 RETURNING id",[other])).rows.length,0);
      assert.equal((await db.query("UPDATE vehicles SET model='bad edit' WHERE id=$1 RETURNING id",[vehicle])).rows.length,1,'own listing remains editable');
      assert.equal((await db.query("UPDATE vehicles SET approval_status='approved' WHERE id=$1 RETURNING approval_status",[pendingVehicle])).rows[0].approval_status,'pending');
    });
    await check('administrators retain profile lookup and vehicle approval',admin,async()=>{
      assert.equal(await count('SELECT count(*) FROM public.admin_list_profiles()'),4);
      assert.equal((await db.query("UPDATE vehicles SET approval_status='approved' WHERE id=$1 RETURNING approval_status",[pendingVehicle])).rows[0].approval_status,'approved');
    });
    await check('report status cannot be forged to reduce a rating',owner,async()=>{
      for(const status of ['resolved','reviewing','dismissed']) await denied(()=>db.query("INSERT INTO reports(reporter_id,reported_id,target_type,target_id,reason,status) VALUES($1,$2,'user',$2,'Test report',$3)",[owner,other,status]));
      assert.equal(Number((await db.query('SELECT rating FROM profiles WHERE id=$1',[other])).rows[0].rating),5);
    });
    await check('valid report starts open, uses server time, and admin moderation still works',owner,async()=>{
      const report=(await db.query("INSERT INTO reports(reporter_id,reported_id,target_type,target_id,reason,created_at) VALUES($1,$2,'user',$2,'Test report','2000-01-01') RETURNING id,status,created_at",[owner,other])).rows[0];
      assert.equal(report.status,'open'); assert.ok(new Date(report.created_at).getFullYear()>2020);
      assert.equal(Number((await db.query('SELECT rating FROM profiles WHERE id=$1',[other])).rows[0].rating),5);
      assert.equal((await db.query("UPDATE reports SET status='resolved' WHERE id=$1 RETURNING id",[report.id])).rows.length,0);
      await asUser(admin);
      await db.query("UPDATE reports SET status='resolved' WHERE id=$1",[report.id]);
      assert.equal(Number((await db.query('SELECT rating FROM profiles WHERE id=$1',[other])).rows[0].rating),4.9);
    });
    await check('outsiders cannot manufacture a support invitation',other,async()=>{
      await denied(()=>db.query("INSERT INTO reports(reporter_id,reported_id,target_type,target_id,reason) VALUES($1,$2,'conversation',$3,'Support requested')",[other,driver,conversation]));
      await denied(()=>db.query('SELECT request_conversation_support($1,$2)',[conversation,'This outsider has no connection to the chat']));
    });
    await check('direct conversation inserts cannot forge relationships or support groups',driver,async()=>{
      await denied(()=>db.query('INSERT INTO conversations(application_id,vehicle_id,driver_id,owner_id) VALUES($1,$2,$3,$4)',[application,vehicle,driver,other]));
      await denied(()=>db.query('INSERT INTO conversations(connection_id,driver_id,owner_id) VALUES($1,$2,$3)',[unusedConnection,driver,other]));
      await denied(()=>db.query('INSERT INTO conversations(driver_id,owner_id,admin_id) VALUES($1,$2,$3)',[driver,other,admin]));
    });
    async function prepareAcceptance(kind) {
      // Synthetic fixture setup as the local engine owner, before role switching.
      await db.query("SELECT set_config('request.jwt.claim.sub',$1,true)",[admin]);
      await db.query("INSERT INTO driver_platform_history(driver_id,platform,months_active,proof_url,approved,review_status,expires_at) VALUES($1,'uber',12,'synthetic-proof',true,'approved',now()+interval '6 months')",[driver]);
      await db.query("UPDATE connections SET status='ended'");
      await db.query("UPDATE applications SET status='completed'");
      if(kind==='connection') await db.query("UPDATE connections SET status='pending' WHERE id=$1",[unusedConnection]);
      else await db.query("UPDATE applications SET status='pending' WHERE id=$1",[application]);
    }
    await check('accepting a valid connection still creates the correct chat through the RPC',owner,async()=>{
      const id=(await db.query("SELECT transition_connection($1,'accepted') AS id",[unusedConnection])).rows[0].id;
      const chat=(await db.query('SELECT driver_id,owner_id,vehicle_id FROM conversations WHERE id=$1',[id])).rows[0];
      assert.deepEqual(chat,{driver_id:driver,owner_id:owner,vehicle_id:vehicle});
      await db.query('SELECT send_message($1,$2)',[id,'Accepted connection works']);
    },()=>prepareAcceptance('connection'));
    await check('accepting a valid application still creates the correct chat through the RPC',owner,async()=>{
      const id=(await db.query("SELECT transition_application($1,'accepted') AS id",[application])).rows[0].id;
      const chat=(await db.query('SELECT driver_id,owner_id,vehicle_id FROM conversations WHERE id=$1',[id])).rows[0];
      assert.deepEqual(chat,{driver_id:driver,owner_id:owner,vehicle_id:vehicle});
    },()=>prepareAcceptance('application'));
    await check('outsiders cannot read or send via text/image RPCs when an admin ID is NULL',other,async()=>{
      assert.equal(await count('SELECT count(*) FROM messages WHERE conversation_id=$1',[conversation]),0);
      await denied(()=>db.query('SELECT send_message($1,$2)',[conversation,'Unauthorized synthetic text']));
      await denied(()=>db.query('SELECT send_chat_image($1,$2)',[conversation,`${conversation}/${other}/test.jpg`]));
    });
    await check('members still send messages, receive them, and mark them read',owner,async()=>{
      const sent=(await db.query('SELECT (send_message($1,$2)).id AS id',[conversation,'Synthetic message'])).rows[0].id;
      await asUser(driver);
      assert.equal(await count('SELECT count(*) FROM messages WHERE id=$1',[sent]),1);
      assert.equal((await db.query('UPDATE messages SET read=true WHERE id=$1 RETURNING read',[sent])).rows[0].read,true);
    });
    await check('blocks prevent both RPC and direct message insertion',owner,async()=>{
      await db.query('INSERT INTO blocks(blocker_id,blocked_id) VALUES($1,$2)',[owner,driver]);
      await denied(()=>db.query('SELECT send_message($1,$2)',[conversation,'Blocked text']));
      await denied(()=>db.query("INSERT INTO messages(conversation_id,sender_id,content,type) VALUES($1,$2,'Blocked text','text')",[conversation,owner]));
    });
    await check('uninvited admins cannot read, join, send, close or call internal bypasses',admin,async()=>{
      assert.equal(await count('SELECT count(*) FROM conversations WHERE id=$1',[conversation]),0);
      assert.equal(await count('SELECT count(*) FROM messages WHERE conversation_id=$1',[conversation]),0);
      await denied(()=>db.query('INSERT INTO conversation_admins(conversation_id,admin_id) VALUES($1,$2)',[conversation,admin]));
      for(const fn of ['admin_join_conversation','admin_close_conversation_chat','admin_resolve_conversation_support','admin_join_conversation_internal','admin_close_conversation_chat_internal']) await denied(()=>db.query(`SELECT ${fn}($1)`,[conversation]));
      await denied(()=>db.query('SELECT send_message($1,$2)',[conversation,'Not invited']));
    });
    await check('invited admins review, join, message and leave a live chat',owner,async()=>{
      await requestSupport(); await asUser(admin);
      assert.equal(await count('SELECT count(*) FROM conversations WHERE id=$1',[conversation]),1);
      await denied(()=>db.query('SELECT send_message($1,$2)',[conversation,'Must join first']));
      await db.query('SELECT admin_join_conversation($1)',[conversation]);
      await db.query('SELECT send_message($1,$2)',[conversation,'Invited support response']);
      await db.query('SELECT admin_leave_conversation($1)',[conversation]);
      await denied(()=>db.query('SELECT send_message($1,$2)',[conversation,'Must join again']));
      assert.ok(await count('SELECT count(*) FROM messages WHERE conversation_id=$1',[conversation])>0,'invited case history remains readable');
      await asUser(owner); await db.query('SELECT send_message($1,$2)',[conversation,'Member chat remains open']);
    });
    await check('invited support can reopen an ended chat and close it again without losing history',owner,async()=>{
      await db.query('SELECT end_connection($1)',[connection]);
      await denied(()=>db.query('SELECT send_message($1,$2)',[conversation,'Ended chat']));
      await requestSupport(); await asUser(admin);
      await db.query('SELECT admin_join_conversation($1)',[conversation]);
      await asUser(driver); await db.query('SELECT send_message($1,$2)',[conversation,'Support reopened chat']);
      await asUser(admin); await db.query('SELECT admin_close_conversation_chat($1)',[conversation]);
      await asUser(driver); await denied(()=>db.query('SELECT send_message($1,$2)',[conversation,'Admin closed chat']));
      assert.ok(await count('SELECT count(*) FROM messages WHERE conversation_id=$1',[conversation])>0);
    });
    await check('own support attachments work; another member cannot read or upload',owner,async()=>{
      const path=`${thread}/${owner}/test.pdf`;
      await db.query("INSERT INTO storage.objects(bucket_id,name,owner) VALUES('contact-attachments',$1,$2)",[path,owner]);
      assert.equal(await count('SELECT count(*) FROM storage.objects WHERE name=$1',[path]),1);
      await asUser(admin); assert.equal(await count('SELECT count(*) FROM storage.objects WHERE name=$1',[path]),1);
      await db.query("INSERT INTO storage.objects(bucket_id,name,owner) VALUES('contact-attachments',$1,$2)",[`${thread}/${admin}/reply.pdf`,admin]);
      await asUser(other); assert.equal(await count('SELECT count(*) FROM storage.objects WHERE name=$1',[path]),0);
      await denied(()=>db.query("INSERT INTO storage.objects(bucket_id,name,owner) VALUES('contact-attachments',$1,$2)",[`${thread}/${other}/bad.pdf`,other]));
    });
    await check('chat images obey invitation access and sender ownership',owner,async()=>{
      const path=`${conversation}/${owner}/image.jpg`;
      await db.query("INSERT INTO storage.objects(bucket_id,name,owner,owner_id) VALUES('chat-media',$1,$2,$3)",[path,owner,owner]);
      await db.query('SELECT send_chat_image($1,$2)',[conversation,path]);
      await asUser(admin); assert.equal(await count('SELECT count(*) FROM storage.objects WHERE name=$1',[path]),0);
      await requestSupport(); await asUser(admin); assert.equal(await count('SELECT count(*) FROM storage.objects WHERE name=$1',[path]),1);
      await asUser(driver); assert.equal(await count('SELECT count(*) FROM storage.objects WHERE name=$1',[path]),1);
      await denied(()=>db.query('SELECT send_chat_image($1,$2)',[conversation,path]));
    });
    await check('anonymous callers cannot execute write RPCs','',async()=>{
      for(const fn of ['transition_connection','transition_application']) await denied(()=>db.query(`SELECT ${fn}($1,$2)`,[connection,'accepted']));
      await denied(()=>db.query('SELECT send_message($1,$2)',[conversation,'Anonymous text']));
    });
  }});
});
