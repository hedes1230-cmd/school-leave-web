import {auth,db,ref,get,update} from './firebase.js';
import {directoryEntry} from './account-identity.mjs';
export async function initProfileSettings(profile,onSaved){
 const form=document.getElementById('profileSettingsForm');if(!form)return;
 const name=form.elements.namedItem('fullname'),grade=form.elements.namedItem('grade'),status=document.getElementById('profileSettingsStatus'),button=form.querySelector('button[type=submit]');
 name.value=profile.fullname||'';grade.value=profile.grade||'';
 document.getElementById('gradeField').hidden=profile.role!=='student';grade.disabled=profile.role!=='student';
 form.addEventListener('submit',async e=>{
  e.preventDefault();if(button.disabled)return;
  const fullname=name.value.trim().replace(/\s+/g,' '),g=grade.value;
  if(!fullname||fullname.length>120){status.textContent='กรุณากรอกชื่อไม่เกิน 120 ตัวอักษร';name.focus();return;}
  if(profile.role==='student'&&g&&!/^ม\.[1-6]$/.test(g)){status.textContent='กรุณาเลือกระดับชั้น';return;}
  button.disabled=true;status.textContent='กำลังบันทึก…';
  try{
   const uid=auth.currentUser?.uid;if(!uid)throw Error();
   const patch={fullname,...(profile.role==='student'?{grade:g||null}:{})};
   await update(ref(db,'users/'+uid),patch);
   const fresh=(await get(ref(db,'users/'+uid))).val();Object.assign(profile,fresh);if(!fresh.grade)delete profile.grade;
   // Retryable after a partial network failure; profile is authoritative.
   await update(ref(db,'directory/'+uid),{...directoryEntry(fresh),grade:fresh.grade||null,emailStart:null,emailDomain:null,email:null});
   onSaved?.(profile);status.textContent='บันทึกแล้ว';
  }catch{status.textContent='บันทึกไม่ครบ กรุณาลองอีกครั้ง';}
  finally{button.disabled=false;}
 });
}
