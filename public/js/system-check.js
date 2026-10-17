import { appCheck } from './firebase.js';
import { getToken } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-app-check.js';
const button=document.getElementById('runCheck'), result=document.getElementById('checkResult');
button.addEventListener('click',async()=>{
 button.disabled=true;result.textContent='กำลังตรวจสอบการป้องกันคำขออัตโนมัติ…';
 const timer=setTimeout(()=>{result.textContent='การตรวจสอบใช้เวลานาน กรุณาตรวจอินเทอร์เน็ตหรือทดลองเปิดเว็บใน Chrome / Edge';},25000);
 try { const response=await getToken(appCheck,false);result.textContent=response.token?'ผ่าน: เว็บเชื่อมต่อระบบป้องกันคำขออัตโนมัติได้แล้ว':'ยังไม่ผ่านการตรวจสอบ'; }
 catch(error){result.textContent='ยังไม่ผ่าน: '+String(error.code||'connection-error')+' — กรุณาลองใหม่หรือติดต่อผู้ดูแล';}
 finally {clearTimeout(timer);button.disabled=false;}
});