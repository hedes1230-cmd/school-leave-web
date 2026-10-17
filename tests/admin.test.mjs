import test from 'node:test';import assert from 'node:assert/strict';
import{ADMIN_EMAIL,isAdminIdentity,profilePatch,leaveDecision,createAdminHandler}from'../src/admin.mjs';
const claims={sub:'adminuid',email:ADMIN_EMAIL,email_verified:true,auth_time:1000,firebase:{sign_in_provider:'google.com'}};
const account={localId:'adminuid',email:ADMIN_EMAIL,emailVerified:true,validSince:'999'};
test('only verified Google administrator with matching live account is allowed',()=>{
 assert.equal(isAdminIdentity(claims,account),true);
 for(const patch of[{email:'someone@gmail.com'},{email_verified:false},{firebase:{sign_in_provider:'password'}},{sub:'someone'}])assert.equal(isAdminIdentity({...claims,...patch},account),false);
 for(const patch of[{disabled:true},{emailVerified:false},{email:'other@gmail.com'},{validSince:1001}])assert.equal(isAdminIdentity(claims,{...account,...patch}),false);
});
test('profile updates are bounded and cannot grant roles or overwrite private fields',()=>{
 const p=profilePatch({id:'student1',fullname:' Test   Name ',grade:'ม.3'},{role:'student'});
 assert.equal(p['users/student1/fullname'],'Test Name');assert.equal(p['directory/student1/grade'],'ม.3');
 for(const body of[{id:'../admin',fullname:'Test'},{id:'user',fullname:'Test',role:'admin'},{id:'user',fullname:'Test',email:'a@b.c'},{id:'user',fullname:'Test',grade:'ม.9'}])assert.throws(()=>profilePatch(body,{role:'student'}));
 assert.throws(()=>profilePatch({id:'user',fullname:'Test',grade:'ม.1'},{role:'teacher'}));
});
test('leave review preserves original content and rejects stale or already decided records',()=>{
 const current={status:'pending',revision:0,reason:'reason',teacherId:'teacher'};
 const next=leaveDecision({id:'leave1',status:'approved',revision:0,note:''},current,100);
 assert.equal(next.reason,'reason');assert.equal(next.teacherId,'teacher');assert.equal(next.revision,1);
 assert.throws(()=>leaveDecision({id:'leave1',status:'approved',revision:1},current,100),/conflict/);
 assert.throws(()=>leaveDecision({id:'leave1',status:'approved',revision:0},{...current,status:'rejected'},100),/conflict/);
 assert.throws(()=>leaveDecision({id:'leave1',status:'rejected',revision:0,note:''},current,100),/invalid/);
});
const req=(path='me',options={})=>new Request('https://school-leave.pages.dev/api/admin/'+path,{headers:{Authorization:'Bearer test'},...options});
test('missing token and ordinary users cannot reach privileged APIs',async()=>{
 let called=0;const handler=createAdminHandler({authorize:async()=>({uid:'u',claims:{...claims,email:'other@gmail.com'}}),accessToken:async()=>{called++;},fetcher:async()=>{called++;}});
 assert.equal((await handler(new Request('https://school-leave.pages.dev/api/admin/users'),{})).status,401);
 assert.equal((await handler(req('users'),{})).status,403);assert.equal(called,0);
});
test('admin me verifies current Firebase account and denies revoked account',async()=>{
 let disabled=false;const handler=createAdminHandler({authorize:async()=>({uid:'adminuid',claims}),accessToken:async()=> 'server-only',fetcher:async()=>Response.json({users:[{...account,disabled}]})});
 assert.equal((await handler(req(),{FIREBASE_PROJECT_ID:'test'})).status,200);disabled=true;
 assert.equal((await handler(req(),{FIREBASE_PROJECT_ID:'test'})).status,403);
});
test('cross-origin and preview origin requests fail closed',async()=>{
 const handler=createAdminHandler({authorize:async()=>{throw Error('must not call');}});
 assert.equal((await handler(req('users/update',{method:'POST',headers:{Origin:'https://evil.test','Content-Type':'application/json'}}),{})).status,403);
 assert.equal((await handler(new Request('https://preview.pages.dev/api/admin/me'),{})).status,403);
});
test('profile mutations require recent reauthentication',async()=>{
 const db={prepare:()=>({run:async()=>{}})};
 const handler=createAdminHandler({clock:()=>3000000,authorize:async()=>({uid:'adminuid',claims}),accessToken:async()=> 'server-only',fetcher:async()=>Response.json({users:[account]})});
 const r=await handler(req('users/update',{method:'POST',headers:{Authorization:'Bearer test',Origin:'https://school-leave.pages.dev','Content-Type':'application/json'},body:'{}'}),{ACCOUNT_DB:db,FIREBASE_DB_URL:'https://school-leave-system-a3e15-default-rtdb.asia-southeast1.firebasedatabase.app'});
 assert.equal(r.status,401);
});
function setupMutation({conflict=false,auditFail=false}={}){
 const calls=[],events=[];
 const db={prepare(sql){return{bind(...args){return{run:async()=>{events.push({sql,args});if(auditFail&&sql.startsWith('INSERT'))throw Error('audit unavailable');}}},run:async()=>{}};}};
 const handler=createAdminHandler({clock:()=>1100000,authorize:async()=>({uid:'adminuid',claims}),accessToken:async()=> 'server-only',fetcher:async(url,options)=>{
  calls.push({url,options});if(url.includes('accounts:lookup'))return Response.json({users:[account]});
  if(options.method==='PUT'&&url.includes('/leaves/'))return new Response('{}',{status:conflict?412:200});
  if(options.method==='GET'||!options.method)return Response.json({status:'pending',revision:0,reason:'retained',teacherId:'teacher'},{headers:{etag:'"v1"'}});
  return Response.json({});
 }});
 const env={ACCOUNT_DB:db,FIREBASE_DB_URL:'https://school-leave-system-a3e15-default-rtdb.asia-southeast1.firebasedatabase.app'};
 const request=req('leaves/decide',{method:'POST',headers:{Authorization:'Bearer test',Origin:'https://school-leave.pages.dev','Content-Type':'application/json'},body:JSON.stringify({id:'leave1',revision:0,status:'approved',note:''})});
 return{handler,env,request,calls,events};
}
test('decision uses conditional write, preserves original data and records audit/history',async()=>{
 const x=setupMutation();const response=await x.handler(x.request,x.env);assert.equal(response.status,200);
 const write=x.calls.find(c=>c.options.method==='PUT'&&c.url.includes('/leaves/'));
 assert.equal(write.options.headers['If-Match'],'"v1"');assert.equal(JSON.parse(write.options.body).reason,'retained');
 assert.ok(x.events.some(e=>e.args.includes('started')));assert.ok(x.events.some(e=>e.args.includes('saved')));
 assert.ok(x.calls.some(c=>c.url.includes('/decisions/leave1/r1.json')));
});
test('concurrent decision conflict cannot overwrite newer result or write false history',async()=>{
 const x=setupMutation({conflict:true});assert.equal((await x.handler(x.request,x.env)).status,409);
 assert.ok(!x.calls.some(c=>c.url.includes('/decisions/')));
});
test('audit failure blocks mutation',async()=>{
 const x=setupMutation({auditFail:true});assert.equal((await x.handler(x.request,x.env)).status,503);
 assert.ok(!x.calls.some(c=>c.options.method==='PUT'));
});
