import {routeAdmin} from './admin-route.js';
import {accountIdentity,createProfile} from './account-identity.mjs';
import { auth, db, ref, get, runTransaction, serverTimestamp, onAuthStateChanged, signOut } from './firebase.js';
import { HOME_BY_ROLE, setBusy } from './common.js';

const form = document.getElementById('profileForm');
const message = document.getElementById('profileMessage');
const saveButton = document.getElementById('profileSave');
const cancelButton = document.getElementById('profileCancel');
let user = null, saving = false, identity = null;
function error(text) { message.textContent = text; message.hidden = false; }
const stop = onAuthStateChanged(auth, async current => {
  stop();
  if (!current) return location.replace('index.html');
  identity = await accountIdentity(current);
  if (!identity) {
    return location.replace('index.html');
  }
  user = current;
  try {
    if(await routeAdmin(user))return;
    const profile = (await get(ref(db, `users/${user.uid}`))).val();
    if (profile) {
      if (HOME_BY_ROLE[profile.role]) location.replace(HOME_BY_ROLE[profile.role]);
      else error('ข้อมูลบทบาทของบัญชีไม่ถูกต้อง กรุณาติดต่อผู้ดูแล');
      return;
    }
    document.getElementById('profileEmail').textContent = identity.kind === 'username' ? '@'+identity.username : identity.email;
    if (identity.kind === 'username') {
      document.getElementById('profileEmailStatus').textContent = 'บัญชีชื่อผู้ใช้';
      form.querySelectorAll('input[name="role"]').forEach(input => { input.checked = input.value === identity.role; input.disabled = true; });
    }
    if (identity.kind !== 'username' && user.providerData?.some(provider => provider.providerId === 'google.com')) {
      document.getElementById('profileEmailStatus').textContent = 'ใช้อีเมลจาก Google ไม่ต้องยืนยันซ้ำ';
    }
    document.getElementById('fullname').value = (user.displayName || '').slice(0,120);
    form.hidden = false;
  } catch { error('โหลดบัญชีไม่สำเร็จ กรุณารีเฟรชหน้าเพื่อลองใหม่'); }
  finally { document.getElementById('profileLoading').hidden = true; }
});
form.addEventListener('submit', async event => {
  event.preventDefault();
  if (saving || !user) return;
  message.hidden = true;
  const fullname = document.getElementById('fullname').value.trim().replace(/\s+/g,' ');
  const role = form.querySelector('input[name="role"]:checked')?.value;
  if (!fullname || fullname.length > 120) { error('กรุณาระบุชื่อ–นามสกุลไม่เกิน 120 ตัวอักษร'); document.getElementById('fullname').focus(); return; }
  if (!['student','teacher'].includes(role)) { error('กรุณาเลือกสถานะนักเรียนหรือครู'); document.getElementById('roleStudent').focus(); return; }
  if (!navigator.onLine) return error('กรุณาเชื่อมต่ออินเทอร์เน็ตก่อนบันทึก');
  saving = true; cancelButton.disabled = true; setBusy(saveButton,true,'กำลังบันทึก…');
  try {
    // Create once. Retrying or completing from a second tab never overwrites an existing profile.
    const result = await runTransaction(ref(db, `users/${user.uid}`), current => current === null ? createProfile(identity,fullname,role,serverTimestamp()) : undefined, {applyLocally:false});
    const profile = result.snapshot.val();
    if (!HOME_BY_ROLE[profile?.role]) throw new Error('missing-profile');
    location.replace(HOME_BY_ROLE[profile.role]);
  } catch { error('บันทึกไม่สำเร็จ ข้อมูลที่กรอกยังอยู่ กรุณาตรวจสอบอินเทอร์เน็ตแล้วลองอีกครั้ง'); }
  finally { saving = false; cancelButton.disabled = false; setBusy(saveButton,false); }
});
cancelButton.addEventListener('click', async () => {
  if (saving) return;
  cancelButton.disabled = true;
  try { await signOut(auth); location.replace('index.html'); }
  catch { error('ออกจากระบบไม่สำเร็จ กรุณาลองอีกครั้ง'); cancelButton.disabled = false; }
});
