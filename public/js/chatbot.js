import {auth,appCheck,onAuthStateChanged} from './firebase.js';
import {getToken} from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-app-check.js';
const host=document.createElement('div');host.className='school-ai';host.hidden=true;
host.innerHTML=`<button type="button" class="ai-launch" aria-haspopup="dialog">✦ ผู้ช่วย AI</button><dialog class="ai-dialog" aria-labelledby="ai-title"><header><strong id="ai-title">ผู้ช่วย School Leave</strong><button type="button" class="ai-close" aria-label="ปิดผู้ช่วย">×</button></header><p class="ai-note">ถามวิธีใช้งานทีละเรื่อง • AI อาจตอบผิดได้<br>ข้อความส่งให้ Cloudflare AI กรุณาอย่าส่งรหัสผ่านหรือข้อมูลส่วนตัว</p><div class="ai-log" role="log" aria-live="polite"></div><form class="ai-form"><label for="ai-question">คำถามเกี่ยวกับการใช้งาน</label><textarea id="ai-question" maxlength="800" rows="2" required placeholder="เช่น ส่งใบลาอย่างไร"></textarea><button type="submit">ส่งคำถาม</button></form></dialog>`;
document.body.append(host);
// Dashboard selection affects presentation only; the API verifies the real profile role.
const teacher=document.querySelector('[data-tab="students-tab"]')!==null;
host.querySelector('#ai-title').textContent=teacher?'ผู้ช่วยสำหรับครู':'ผู้ช่วยสำหรับนักเรียน';
const welcome=document.createElement('p');welcome.className='ai-welcome';
welcome.textContent=teacher?'สวัสดีคุณครู ช่วยแนะนำการตรวจใบลา เชื่อมต่อนักเรียน และดูสรุปรายคนได้ครับ':'สวัสดี ช่วยแนะนำการเขียนใบลา เชื่อมต่อครู และติดตามผลได้ครับ';
const suggestions=document.createElement('div');suggestions.className='ai-suggestions';suggestions.setAttribute('aria-label','คำถามแนะนำ');
const questions=teacher?['ตรวจใบลารออนุมัติอย่างไร','เพิ่มนักเรียนอย่างไร','ดูสรุปการลารายคนตรงไหน']:['เขียนใบลาอย่างไร','เชื่อมต่อครูอย่างไร','ดูผลการลาได้ที่ไหน'];
host.querySelector('.ai-log').before(welcome,suggestions);
for(const question of questions){const button=document.createElement('button');button.type='button';button.textContent=question;button.addEventListener('click',()=>{input.value=question;input.focus();});suggestions.append(button);}
const dialog=host.querySelector('dialog'),launch=host.querySelector('.ai-launch'),form=host.querySelector('form'),input=host.querySelector('textarea'),send=form.querySelector('button'),log=host.querySelector('.ai-log');
let controller;
input.placeholder=teacher?'เช่น ดูสรุปการลารายคนอย่างไร':'เช่น เขียนใบลาอย่างไร';
launch.addEventListener('click',()=>dialog.showModal());
host.querySelector('.ai-close').addEventListener('click',()=>dialog.close());
dialog.addEventListener('close',()=>launch.focus());
onAuthStateChanged(auth,user=>{host.hidden=!user;if(!user){controller?.abort();dialog.close();log.replaceChildren();}});
function message(who,text){const p=document.createElement('p');p.className=who==='คุณ'?'ai-user':'ai-answer';p.textContent=`${who}: ${text}`;log.append(p);while(log.children.length>20)log.firstChild.remove();p.scrollIntoView({block:'nearest'});return p;}
form.addEventListener('submit',async event=>{
 event.preventDefault();const question=input.value.trim(),user=auth.currentUser;if(!question||!user||send.disabled)return;
 message('คุณ',question);input.value='';send.disabled=true;send.textContent='กำลังตอบ…';const pending=message('AI','กำลังค้นหาคำตอบ…');controller=new AbortController();let timer;
 try{
  const signal=controller.signal;
  const task=(async()=>{const token=await user.getIdToken();const check=await getToken(appCheck,false);if(signal.aborted||auth.currentUser?.uid!==user.uid)throw Error('cancelled');const response=await fetch('/api/chat',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`,'X-Firebase-AppCheck':check.token},body:JSON.stringify({message:question}),signal});const data=await response.json();if(!response.ok){const error=Error(data.error||'AI ไม่พร้อม');error.safe=true;throw error;}if(typeof data.answer!=='string'||!data.answer.trim())throw Error('empty');return data.answer;})();
  const answer=await Promise.race([task,new Promise((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(Error('ใช้เวลานานเกินไป กรุณาลองใหม่'));},50000);})]);
  if(auth.currentUser?.uid===user.uid)pending.textContent=`AI: ${answer}`;
 }catch(error){if(auth.currentUser?.uid===user.uid){pending.textContent=error.safe?error.message:'เชื่อมต่อ AI ไม่สำเร็จ กรุณาลองใหม่อีกครั้ง';if(!input.value)input.value=question;}}
 finally{clearTimeout(timer);send.disabled=false;send.textContent='ส่งคำถาม';}
});

