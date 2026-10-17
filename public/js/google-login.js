import {routeAdmin} from './admin-route.js';
import { auth, db, ref, get, GoogleAuthProvider, signInWithRedirect, getRedirectResult, signOut } from './firebase.js';
import { HOME_BY_ROLE, setBusy } from './common.js';

const button = document.getElementById('googleLoginBtn');
const message = document.getElementById('googleMessage');
const submit = document.querySelector('form button[type="submit"]');
const pendingKey = 'school-leave-google-redirect';
let busy = false;
let loginTimedOut = false;
const errors = {
  'auth/popup-blocked': 'กรุณาอนุญาตหน้าต่างป๊อปอัปแล้วกด Google อีกครั้ง',
  'auth/popup-closed-by-user': 'ยกเลิกการเข้าสู่ระบบ Google แล้ว กดปุ่มเพื่อลองใหม่ได้',
  'auth/unauthorized-domain': 'เว็บนี้ยังไม่ได้รับอนุญาตให้เข้าสู่ระบบด้วย Google กรุณาติดต่อผู้ดูแล',
  'auth/account-exists-with-different-credential': 'อีเมลนี้ใช้วิธีเข้าสู่ระบบอื่นอยู่ กรุณาเข้าสู่ระบบด้วยวิธีเดิมก่อน',
  'auth/network-request-failed': 'เชื่อมต่อ Google ไม่ได้ กรุณาตรวจสอบอินเทอร์เน็ตแล้วลองอีกครั้ง',
  'auth/operation-not-allowed': 'ยังไม่ได้เปิดใช้ Google ในระบบ กรุณาติดต่อผู้ดูแล',
  'auth/web-storage-unsupported': 'เบราว์เซอร์นี้บันทึกสถานะเข้าสู่ระบบไม่ได้ กรุณาเปิดเว็บด้วย Chrome, Edge หรือ Safari'
};
function showError(error) {
  message.textContent = errors[error?.code] || 'เข้าสู่ระบบด้วย Google ไม่สำเร็จ กรุณาลองอีกครั้ง';
  if (error?.code === 'auth/account-exists-with-different-credential') {
    const loginLink = document.createElement('a');
    loginLink.href = 'index.html';
    loginLink.textContent = ' กลับไปเข้าสู่บัญชีเดิม';
    message.append(loginLink);
    message.hidden = false;
    return;
  }
  const detail = document.createElement('details');
  const summary = document.createElement('summary');
  summary.textContent = 'รายละเอียดข้อผิดพลาดสำหรับผู้ดูแล';
  const report = document.createElement('pre');
  report.style.whiteSpace = 'pre-wrap';
  report.textContent = JSON.stringify({code: error?.code || 'unknown',
    fetchFailure: /fetch/i.test(error?.customData?.message || ''),
    sourcePositions: String(error?.stack || '').match(/firebase-auth\.js:\d+:\d+/g) || []}, null, 2);
  detail.append(summary, report);
  message.append(detail);
  message.hidden = false;
}
function setLoading(value, text = 'กำลังไปยัง Google…') {
  busy = value;
  setBusy(button, value, text);
  if (submit) submit.disabled = value;
}
async function finish(user) {
  if(await routeAdmin(user))return;
  if (!user.email || !user.emailVerified) {
    await signOut(auth);
    throw new Error('Unverified Google account');
  }
  const profile = (await get(ref(db, `users/${user.uid}`))).val();
  if (profile && !HOME_BY_ROLE[profile.role]) {
    await signOut(auth);
    throw new Error('Invalid profile role');
  }
  location.replace(profile ? HOME_BY_ROLE[profile.role] : 'complete-profile.html');
}
button?.addEventListener('click', async () => {
  if (loginTimedOut) { location.reload(); return; }
  if (busy) return;
  message.hidden = true;
  if (!navigator.onLine) {
    message.textContent = 'กรุณาเชื่อมต่ออินเทอร์เน็ตก่อนเข้าสู่ระบบ';
    message.hidden = false;
    return;
  }
  setLoading(true);
  const navigationTimer = setTimeout(() => {
    loginTimedOut = true;
    setLoading(false);
    message.textContent = 'Google ไม่ตอบกลับ กรุณากดปุ่ม Google เพื่อโหลดหน้าใหม่แล้วลองอีกครั้ง หากใช้ APK รุ่นเก่าให้อัปเดตเป็น 1.1.1';
    message.hidden = false;
  }, 25000);
  try {
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });
    sessionStorage.setItem(pendingKey, '1');
    await signInWithRedirect(auth, provider);
  } catch (error) {
    sessionStorage.removeItem(pendingKey);
    showError(error);
    setLoading(false);
  } finally { clearTimeout(navigationTimer); }
});
// Resolve the result only after this browser started a Google redirect.
// No passwords, OAuth tokens, or profile details are stored in this marker.
if (sessionStorage.getItem(pendingKey) === '1') {
  setLoading(true, 'กำลังตรวจสอบบัญชี Google…');
  const timer = setTimeout(() => {
    message.textContent = 'Google ตอบกลับช้า กรุณาตรวจสอบอินเทอร์เน็ตและโหลดหน้าใหม่หากรอนาน';
    message.hidden = false;
  }, 25000);
  try {
    const result = await getRedirectResult(auth);
    if (result?.user) await finish(result.user);
    else if (auth.currentUser?.providerData.some(p => p.providerId === 'google.com')) await finish(auth.currentUser);
    else {
      message.textContent = 'ยังไม่ได้ยืนยันบัญชี Google คุณสามารถกดปุ่มเพื่อลองอีกครั้งได้';
      message.hidden = false;
    }
  } catch (error) {
    showError(error);
  } finally {
    clearTimeout(timer);
    sessionStorage.removeItem(pendingKey);
    setLoading(false);
  }
}
