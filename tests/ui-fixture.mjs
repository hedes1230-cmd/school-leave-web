import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
const root=path.resolve('public');
let users=[{id:'qa_student',fullname:'นักเรียน ทดสอบ',role:'student',grade:'ม.2'},{id:'qa_teacher',fullname:'ครู ทดสอบ',role:'teacher'}];
let leaves=[{id:'qa_leave',studentId:'qa_student',studentName:'นักเรียน ทดสอบ',teacherName:'ครู ทดสอบ',status:'pending',revision:0,type:'ลากิจ',date:'2026-10-17',reason:'ข้อมูลจำลองสำหรับทดสอบเท่านั้น'}];
http.createServer(async(req,res)=>{
 const u=new URL(req.url,'http://localhost');res.setHeader('Cache-Control','no-store');
 if(u.pathname==='/mobile'){res.setHeader('Content-Type','text/html; charset=utf-8');return res.end('<h1>ทดสอบจอมือถือ 390px — ข้อมูลจำลอง</h1><iframe title="มือถือ" src="/admin.html" style="width:390px;height:844px;border:1px solid"></iframe>');}
 if(u.pathname==='/js/firebase.js'){res.setHeader('Content-Type','text/javascript');return res.end(`export const auth={currentUser:{getIdToken:async()=> 'fixture'}};export const onAuthStateChanged=(a,f)=>queueMicrotask(()=>f(a.currentUser));export const signOut=async()=>{};`);}
 if(u.pathname.startsWith('/api/admin/')){
 res.setHeader('Content-Type','application/json; charset=utf-8');const send=v=>res.end(JSON.stringify(v));let body='';for await(const c of req)body+=c;
 if(u.pathname.endsWith('/me'))return send({admin:true});
 if(u.pathname.endsWith('/users'))return send({items:users,next:null});
 if(u.pathname.endsWith('/leaves'))return send({items:leaves,next:null});
 const b=JSON.parse(body);if(u.pathname.endsWith('/update')){Object.assign(users.find(x=>x.id===b.id),b);return send({ok:true});}
 if(u.pathname.endsWith('/decide')){Object.assign(leaves.find(x=>x.id===b.id),{status:b.status,teacherNote:b.note,revision:b.revision+1});return send({ok:true});}
 }
 const target=path.resolve(root,'.'+u.pathname);if(!target.startsWith(root+path.sep)){res.statusCode=404;return res.end();}
 try{res.setHeader('Content-Type',target.endsWith('.js')?'text/javascript':target.endsWith('.css')?'text/css':'text/html; charset=utf-8');res.end(fs.readFileSync(target));}catch{res.statusCode=404;res.end();}
}).listen(4178,'127.0.0.1',()=>console.log('Admin fixture http://127.0.0.1:4178/admin.html'));
