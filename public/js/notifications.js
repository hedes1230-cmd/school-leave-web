import {auth, appCheck, onAuthStateChanged} from './firebase.js';
import {getToken} from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-app-check.js';

const supported=()=> 'Notification' in window && 'serviceWorker' in navigator && 'PushManager' in window;
const queueKey=uid=>`pushOutbox_${uid}`;
const readQueue=uid=>{try {const v=JSON.parse(localStorage.getItem(queueKey(uid))||'[]');return Array.isArray(v)?v.filter(x=>x.at>Date.now()-86400000).slice(-80):[];}catch{return [];}};
const saveQueue=(uid,q)=>{try {localStorage.setItem(queueKey(uid),JSON.stringify(q));}catch{}};
let flushing=false, activeUid, control, note, testControl;
async function testNotification() {
  const result=await api('test',{});
  note.textContent=result.sent>0?'ส่งข้อความทดสอบแล้ว ตรวจดูแจ้งเตือนบนเครื่อง':'ยังส่งข้อความทดสอบไม่ได้ กรุณารอ 1 นาทีแล้วลองใหม่';
}
function bounded(promise, message='เชื่อมต่อใช้เวลานาน กรุณาลองอีกครั้ง', ms=12000) {
  let timer;
  return Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error(message)),ms);})]).finally(()=>clearTimeout(timer));
}
async function api(path,body) {
  const user=auth.currentUser;if(!user) throw Error('กรุณาเข้าสู่ระบบ');
  const uid=user.uid, token=await bounded(user.getIdToken(),'ตรวจสอบบัญชีไม่สำเร็จ กรุณาลองอีกครั้ง');
  const appToken=await bounded(getToken(appCheck,false),'ตรวจสอบความปลอดภัยไม่สำเร็จ กรุณารีเฟรชแล้วลองอีกครั้ง');
  if(auth.currentUser?.uid!==uid) throw Error('บัญชีมีการเปลี่ยนแปลง');
  const response=await fetch('/api/push/'+path,{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+token,'X-Firebase-AppCheck':appToken.token},body:JSON.stringify(body),signal:AbortSignal.timeout(25000)});
  if(!response.ok) {
    const messages={401:'กรุณาเข้าสู่ระบบใหม่แล้วเปิดแจ้งเตือนอีกครั้ง',403:'ตรวจสอบสิทธิ์ไม่สำเร็จ กรุณารีเฟรชแล้วลองใหม่',429:'ลองแจ้งเตือนหลายครั้งเกินกำหนด กรุณาลองใหม่ภายหลัง'};
    throw Object.assign(Error(messages[response.status]||'ระบบแจ้งเตือนยังไม่พร้อม กรุณาลองใหม่'),{status:response.status});
  }
  return response.json();
}
async function registration() {
  const registration = await bounded(navigator.serviceWorker.register('/sw.js'));
  const updating = registration.installing || registration.waiting;
  if (updating && updating.state !== 'activated') await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(Error('กรุณารีเฟรชแล้วลองอีกครั้ง')), 12000);
    const changed = () => { if (updating.state === 'activated') { clearTimeout(timer); updating.removeEventListener('statechange', changed); resolve(); } else if (updating.state === 'redundant') { clearTimeout(timer); updating.removeEventListener('statechange', changed); reject(Error('อัปเดตระบบแจ้งเตือนไม่สำเร็จ')); } };
    updating.addEventListener('statechange', changed); changed();
  });
  return Promise.race([navigator.serviceWorker.ready,new Promise((_,reject)=>setTimeout(()=>reject(Error('กรุณารีเฟรชแล้วลองอีกครั้ง')),12000))]);
}
export function notifyEvent(type,id) {
  const uid=auth.currentUser?.uid;if(!uid)return;
  const q=readQueue(uid).filter(x=>!(x.type===type&&x.id===id));
  q.push({type,id,at:Date.now()});saveQueue(uid,q.slice(-80));void flush();
}
async function flush() {
  const uid=auth.currentUser?.uid;if(!uid||flushing)return;
  flushing=true;
  try {
    for(const item of readQueue(uid)) {
      if(auth.currentUser?.uid!==uid)break;
      try {await api('event',{type:item.type,id:item.id});}
      catch(e) {if(![400,403,404].includes(e.status))break;}
      saveQueue(uid,readQueue(uid).filter(x=>!(x.type===item.type&&x.id===item.id&&x.at===item.at)));
    }
  } finally {flushing=false;}
}
export async function stopNotifications() {
  if(!supported())return;
  const reg=await navigator.serviceWorker.getRegistration('/');
  const sub=await reg?.pushManager.getSubscription();
  if(sub) {
    try {if(auth.currentUser)await api('unsubscribe',{endpoint:sub.endpoint});}catch{}
    const removed=await bounded(sub.unsubscribe());
    if(!removed && await bounded(reg.pushManager.getSubscription()))throw Error('ยังปิดแจ้งเตือนไม่สำเร็จ กรุณาลองอีกครั้ง');
  }
  if(control){control.dataset.enabled='false';control.setAttribute('aria-checked','false');control.textContent='ปิด';}
  if(testControl)testControl.hidden=true;
}
export function initNotifications(uid) {
  activeUid=uid;
  if(supported()) {
    control=document.createElement('button');control.type='button';control.className='notification-switch';control.setAttribute('role','switch');control.setAttribute('aria-label','การแจ้งเตือนบนอุปกรณ์นี้');control.setAttribute('aria-checked','false');control.textContent='ปิด';
    note=document.createElement('span');note.className='hint';note.setAttribute('role','status');
    const host=document.getElementById('notificationSettings');const row=document.createElement('div');row.className='notification-setting-row';const label=document.createElement('span');label.textContent='แจ้งเตือนบนอุปกรณ์นี้';row.append(label,control);host?.append(row,note);
    testControl=document.createElement('button');testControl.type='button';testControl.className='btn btn-ghost btn-sm';testControl.textContent='ส่งแจ้งเตือนทดสอบ';testControl.hidden=true;host?.append(testControl);
    testControl.onclick=async()=>{if(testControl.disabled)return;testControl.disabled=true;note.textContent='กำลังส่งข้อความทดสอบ…';try{await testNotification();}catch{note.textContent='ส่งข้อความทดสอบไม่สำเร็จ กรุณาลองใหม่';}finally{testControl.disabled=false;}};
    control.onclick=async()=>{
      if(control.disabled)return;
      control.disabled=true;control.textContent='กำลังเชื่อมต่อ…';note.textContent='';
      try {
        if(control.dataset.enabled==='true') {await stopNotifications();control.dataset.enabled='false';note.textContent='ปิดแจ้งเตือนแล้ว';return;}
        if(Notification.permission==='denied'){note.textContent='เบราว์เซอร์บล็อกแจ้งเตือน กรุณาอนุญาตในการตั้งค่าเว็บไซต์แล้วลองใหม่';return;}
        if(await bounded(Notification.requestPermission(),'กรุณาตอบหน้าต่างขออนุญาตแจ้งเตือน แล้วลองใหม่',60000)!=='granted') {note.textContent='ยังไม่ได้อนุญาตแจ้งเตือน';return;}
        const r=await fetch('/api/push/config',{cache:'no-store',signal:AbortSignal.timeout(12000)}),config=await r.json();
        if(!r.ok||!config.ready)throw Error('ระบบแจ้งเตือนยังไม่พร้อม');
        const reg=await registration();
        let sub=await bounded(reg.pushManager.getSubscription());
        if(!sub)sub=await bounded(reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:Uint8Array.from(atob(config.publicKey.replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0))}));
        if(auth.currentUser?.uid!==uid){await sub.unsubscribe();throw Error('กรุณาเข้าสู่ระบบอีกครั้ง');}
        await api('subscribe',{subscription:sub.toJSON()});
        control.dataset.enabled='true';control.setAttribute('aria-checked','true');control.textContent='เปิด';note.textContent='เปิดแจ้งเตือนแล้ว';
        testControl.hidden=false;
        try {await testNotification();}catch {note.textContent='เชื่อมต่อแล้ว แต่ส่งแจ้งเตือนทดสอบไม่สำเร็จ';}
      } catch(e) {note.textContent=e.message||'เปิดแจ้งเตือนไม่สำเร็จ';}
      finally {control.disabled=false;control.textContent=control.dataset.enabled==='true'?'เปิด':'ปิด';}
    };
    // Refresh an existing subscription, never prompt automatically.
    if(Notification.permission==='granted') {
      control.disabled=true;control.textContent='กำลังตรวจสอบ…';let expired=false;
      const refresh=(async()=>{
        const reg=await registration();if(expired)return;
        const sub=await bounded(reg.pushManager.getSubscription());if(expired||!sub||auth.currentUser?.uid!==uid)return;
        await api('subscribe',{subscription:sub.toJSON()});if(expired||auth.currentUser?.uid!==uid)return;
        control.dataset.enabled='true';control.setAttribute('aria-checked','true');
        testControl.hidden=false;
      })();
      bounded(refresh,'กดสวิตช์เพื่อลองเชื่อมต่อใหม่').catch(e=>{note.textContent=e.message;}).finally(()=>{expired=true;control.disabled=false;control.textContent=control.dataset.enabled==='true'?'เปิด':'ปิด';});
    }
    onAuthStateChanged(auth,user=>{if(user?.uid!==activeUid) {control.hidden=true;testControl.hidden=true;note.hidden=true;void stopNotifications().catch(()=>{});}});
  }
  if(!supported()){const host=document.getElementById('notificationSettings');if(host)host.textContent=/iPhone|iPad|iPod/.test(navigator.userAgent||'')?'บน iPhone/iPad ให้เพิ่มเว็บไปยังหน้าจอโฮม แล้วเปิดจากไอคอนเพื่อเปิดแจ้งเตือน':'เบราว์เซอร์นี้ไม่รองรับแจ้งเตือน กรุณาเปิดด้วย Chrome หรือ Edge รุ่นล่าสุด';}
  void flush();window.addEventListener('online',flush);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)void flush();});
  setInterval(()=>{if(!document.hidden)void flush();},60000);
}
