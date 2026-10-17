// Privileged operations are server-only; neither profile.role nor a client email grants access.
export const ADMIN_EMAIL = 'seree999@gmail.com';
const ID = /^[A-Za-z0-9_-]{1,128}$/;
const pick = (o, keys) => Object.fromEntries(keys.filter(k => o[k] !== undefined).map(k => [k,o[k]]));
export function isAdminIdentity(claims, account) {
  return claims?.email === ADMIN_EMAIL && claims.email_verified === true
    && claims.firebase?.sign_in_provider === 'google.com'
    && account?.localId === claims.sub && account.email === ADMIN_EMAIL
    && account.emailVerified === true && account.disabled !== true
    && Number(claims.auth_time) >= Number(account.validSince || 0);
}
export function profilePatch(body, current) {
  if (!body || Object.keys(body).some(k => !['id','fullname','grade'].includes(k))) throw Error('invalid');
  if (!ID.test(body.id || '') || !['student','teacher'].includes(current?.role)) throw Error('invalid');
  const fullname = String(body.fullname || '').trim().replace(/\s+/g,' ');
  if (!fullname || fullname.length > 120 || /[\u0000-\u001f]/.test(fullname)) throw Error('invalid');
  if (body.grade && (current.role !== 'student' || !/^ม\.[1-6]$/.test(body.grade))) throw Error('invalid');
  const patch = {[`users/${body.id}/fullname`]:fullname,[`directory/${body.id}/fullname`]:fullname};
  if(current.role==='student') {
    patch[`users/${body.id}/grade`]=body.grade || null;
    patch[`directory/${body.id}/grade`]=body.grade || null;
  }
  return patch;
}
export function leaveDecision(body, current, now) {
  if(!body || Object.keys(body).some(k=>!['id','status','note','revision'].includes(k))) throw Error('invalid');
  if(!ID.test(body.id||'') || !['approved','rejected'].includes(body.status)) throw Error('invalid');
  if(!current || current.status !== 'pending' || (current.revision || 0)!==body.revision) throw Error('conflict');
  const note=String(body.note||'').trim();
  if(note.length>500 || (body.status==='rejected' && note.length<3)) throw Error('invalid');
  return {...current,status:body.status,teacherNote:note,decidedAt:now,revision:body.revision+1};
}
export function createAdminHandler({authorize,accessToken,fetcher=fetch,clock=Date.now}) {
 const reply=(body,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Vary':'Origin'}});
 const fail=(status,message)=>{throw Object.assign(Error(message),{status});};
 return async function handleAdmin(request,env) {
  try {
   const url=new URL(request.url), origin=url.origin;
   if(origin!=='https://school-leave.pages.dev' || (request.headers.get('Origin') && request.headers.get('Origin')!==origin)) return reply({error:'ไม่อนุญาตต้นทางนี้'},403);
   if(!['GET','POST'].includes(request.method))return reply({error:'Method not allowed'},405);
   if(request.method==='POST' && (request.headers.get('Origin')!==origin || request.headers.get('Content-Type')!=='application/json'))return reply({error:'ไม่อนุญาตคำขอ'},403);
   const bearer=/^Bearer ([^\s]+)$/.exec(request.headers.get('Authorization')||'');
   if(!bearer) return reply({error:'กรุณาเข้าสู่ระบบด้วย Google'},401);
   const {claims,uid}=await authorize(bearer[1],env);
   // Reject ordinary users before making any privileged upstream request.
   if(claims.email!==ADMIN_EMAIL || claims.email_verified!==true || claims.firebase?.sign_in_provider!=='google.com')return reply({error:'บัญชีนี้ไม่มีสิทธิ์ผู้ดูแล'},403);
   const cfg={saEmail:env.FIREBASE_SA_EMAIL,saPrivateKey:env.FIREBASE_SA_PRIVATE_KEY};
   const token=await accessToken(cfg),headers={Authorization:'Bearer '+token,'Content-Type':'application/json'};
   const lookup=await fetcher(`https://identitytoolkit.googleapis.com/v1/projects/${env.FIREBASE_PROJECT_ID}/accounts:lookup`,{method:'POST',headers,body:JSON.stringify({localId:[uid]})});
   if(!lookup.ok)fail(503,'ตรวจสอบสิทธิ์ผู้ดูแลไม่ได้');
   const account=(await lookup.json()).users?.[0];
   if(!isAdminIdentity(claims,account))return reply({error:'สิทธิ์ผู้ดูแลไม่พร้อม กรุณาเข้าสู่ระบบใหม่'},403);
   if(url.pathname==='/api/admin/me' && request.method==='GET')return reply({admin:true});
   const base=env.FIREBASE_DB_URL?.replace(/\/$/,'');
   if(base!=='https://school-leave-system-a3e15-default-rtdb.asia-southeast1.firebasedatabase.app')fail(503,'ตั้งค่าฐานข้อมูลไม่พร้อม');
   const db=env.ACCOUNT_DB;
   await db.prepare('CREATE TABLE IF NOT EXISTS admin_audit (id TEXT PRIMARY KEY, actor TEXT NOT NULL, action TEXT NOT NULL, target TEXT NOT NULL, at INTEGER NOT NULL, state TEXT NOT NULL)').run();
   const io=async(path,options={})=>{
    const r=await fetcher(`${base}/${path}`,{...options,headers:{...headers,...options.headers},signal:AbortSignal.timeout(15000)});
    if(r.status===412)fail(409,'ข้อมูลเปลี่ยนแล้ว กรุณาโหลดใหม่');
    if(!r.ok)fail(503,'อ่านหรือบันทึกข้อมูลไม่สำเร็จ');return r;
   };
   if(request.method==='GET' && ['/api/admin/users','/api/admin/leaves'].includes(url.pathname)) {
    const kind=url.pathname.endsWith('users')?'users':'leaves';
    const cursor=url.searchParams.get('cursor');if(cursor&&!ID.test(cursor))fail(400,'รหัสหน้าไม่ถูกต้อง');
    const q=new URLSearchParams({orderBy:'"$key"',limitToFirst:'51'});if(cursor)q.set('startAt',JSON.stringify(cursor));
    const records=await(await io(`${kind}.json?${q}`)).json()||{};
    const entries=Object.entries(records).sort(([a],[b])=>a<b?-1:a>b?1:0);
    const keys=kind==='users'?['fullname','grade','role','username']:['studentId','studentName','teacherId','teacherName','type','date','endDate','reason','status','revision','teacherNote','timestamp'];
    const items=entries.slice(0,50).map(([id,v])=>({id,...pick(v,keys)}));
    return reply({items,next:entries.length>50?entries[50][0]:null});
   }
   if(request.method!=='POST' || !['/api/admin/users/update','/api/admin/leaves/decide'].includes(url.pathname))return reply({error:'Not found'},404);
   if(clock()/1000-Number(claims.auth_time)>1800)fail(401,'กรุณาเข้าสู่ระบบ Google ใหม่ก่อนแก้ข้อมูล');
   if(Number(request.headers.get('Content-Length'))>4096)fail(413,'ข้อมูลยาวเกินไป');
   // Bounded stream prevents a chunked request from bypassing Content-Length.
   const reader=request.body?.getReader();let size=0,parts=[];
   if(!reader)fail(400,'ไม่มีข้อมูล');
   for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>4096){await reader.cancel();fail(413,'ข้อมูลยาวเกินไป');}parts.push(value);}
   let body;try{body=JSON.parse(new TextDecoder().decode(Uint8Array.from(parts.flatMap(v=>Array.from(v)))));}catch{fail(400,'ข้อมูลไม่ถูกต้อง');}
   if(!ID.test(body?.id||''))fail(400,'รหัสไม่ถูกต้อง');
   const action=url.pathname.endsWith('update')?'profile.update':'leave.decide';
   const path=action==='profile.update'?`users/${body.id}.json`:`leaves/${body.id}.json`;
   const currentRes=await io(path,{headers:{'X-Firebase-ETag':'true'}}),current=await currentRes.json();
   if(!current)fail(404,'ไม่พบรายการ');
   let payload;try{payload=action==='profile.update'?profilePatch(body,current):leaveDecision(body,current,clock());}catch(e){fail(e.message==='conflict'?409:400,e.message==='conflict'?'รายการถูกพิจารณาหรือแก้ไขแล้ว':'ข้อมูลไม่ถูกต้อง');}
   const auditId=crypto.randomUUID();
   // Audit intent must persist before any mutation; no names or reasons in this log.
   await db.prepare('INSERT INTO admin_audit(id,actor,action,target,at,state) VALUES(?,?,?,?,?,?)').bind(auditId,uid,action,body.id,clock(),'started').run();
   try {
    if(action==='profile.update') await io('.json',{method:'PATCH',body:JSON.stringify(payload)});
    else {
     const etag=currentRes.headers.get('etag');if(!etag)fail(503,'ตรวจรุ่นข้อมูลไม่ได้');
     await io(path,{method:'PUT',headers:{'If-Match':etag},body:JSON.stringify(payload)});
     // The durable audit above remains authoritative if the history write needs retry.
     const history={actor:uid,at:payload.decidedAt,previous:current.status,status:payload.status,note:payload.teacherNote};
     let historySaved=false;
     for(let attempt=0;attempt<2;attempt++){try{await io(`decisions/${body.id}/r${payload.revision}.json`,{method:'PUT',body:JSON.stringify(history)});historySaved=true;break;}catch{}}
     if(!historySaved){await db.prepare('UPDATE admin_audit SET state=? WHERE id=?').bind('saved_history_pending',auditId).run();return reply({ok:true,warning:'บันทึกผลแล้ว แต่ประวัติการพิจารณายังบันทึกไม่ครบ กรุณาแจ้งผู้ดูแลโครงการ',auditId});}
    }
    await db.prepare('UPDATE admin_audit SET state=? WHERE id=?').bind('saved',auditId).run();
    return reply({ok:true});
   }catch(e){await db.prepare('UPDATE admin_audit SET state=? WHERE id=?').bind('check_required',auditId).run();throw e;}
  }catch(e){return reply({error:e.status?e.message:'บริการผู้ดูแลไม่พร้อม กรุณาลองใหม่'},[400,401,403,404,409,413,503].includes(e.status)?e.status:503);}
 };
}
