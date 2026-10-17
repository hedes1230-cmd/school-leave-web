// ฝั่ง client (ES module) — ปรับ URL import ให้ตรงเวอร์ชัน Firebase JS SDK เดิมของโปรเจกต์
// ความปลอดภัยจริงอยู่ที่ Worker + Rules; ฟังก์ชันฝั่ง client มีไว้ช่วย UI เท่านั้น
// Turnstile: แต่ละหน้าต้อง render widget ด้วย action ให้ตรง ('register' | 'login' | 'recover' | 'link')
import {
  signInWithCustomToken, signOut, GoogleAuthProvider, linkWithPopup, reauthenticateWithPopup,
} from './firebase.js'; // ⚠ ใช้เวอร์ชันเดียวกับของเดิม

const API = '/api/account';

export class AccountApiError extends Error {
  constructor(message, status, code) { super(message); this.status = status; this.code = code; }
}

async function post(path, body, idToken) {
  const res = await fetch(`${API}/${path}`, {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'content-type': 'application/json', ...(idToken ? { authorization: `Bearer ${idToken}` } : {}) },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new AccountApiError(data.error || 'คำขอไม่สำเร็จ', res.status, data.code);
  return data;
}

/** ใช้แทนการเช็ก user.emailVerified ตรง ๆ เพื่อแสดง UI — ไม่ใช่การอนุญาตสิทธิ์ */
export async function looksTrustedSession(user) {
  if (!user) return false;
  const { claims, signInProvider } = await user.getIdTokenResult();
  if (signInProvider === 'custom') return claims.acct === 'username';
  return user.emailVerified === true;
}

/** เมื่อ RTDB/Push ตอบ permission denied หรือ 401 session_rejected ให้เรียกฟังก์ชันนี้ */
export async function handleRevokedSession(auth) {
  await signOut(auth);
  location.assign('/index.html?reason=session_revoked'); // ⚠ ปรับ path ให้ตรงของจริง
}

export async function registerWithUsername(auth, { username, password, role, turnstileToken }) {
  const { customToken, recoveryCodes } = await post('register', { username, password, role, turnstileToken });
  await signInWithCustomToken(auth, customToken);
  return recoveryCodes; // แสดงครั้งเดียว ห้ามเก็บใน localStorage
}

export async function loginWithUsername(auth, { username, password, turnstileToken }) {
  const { customToken, recoveryCodes } = await post('login', { username, password, turnstileToken });
  const credential = await signInWithCustomToken(auth, customToken);
  return { credential, recoveryCodes: recoveryCodes || null };
}

/** code 'revocation_pending' (503) = รหัสผ่านถูกเปลี่ยนแล้วแต่ระบบยังตัดเซสชันเดิมไม่เสร็จ: ให้ลองล็อกอินด้วยรหัสใหม่ภายหลัง */
export async function recoverWithCode(auth, { username, recoveryCode, newPassword, turnstileToken }) {
  const { customToken, remainingCodes } = await post('recover', { username, recoveryCode, newPassword, turnstileToken });
  await signInWithCustomToken(auth, customToken);
  return remainingCodes;
}

export async function changePassword(auth, { currentPassword, newPassword }) {
  const { customToken } = await post('password', { currentPassword, newPassword }, await auth.currentUser.getIdToken());
  await signInWithCustomToken(auth, customToken); // เซสชันเดิมถูกเพิกถอนแล้ว
}

/** บัญชีชื่อผู้ใช้ -> ผูก Google (UID เดิม). ยืนยันรหัสผ่านซ้ำก่อน (ข้อจำกัด: บังคับจากเซิร์ฟเวอร์ไม่ได้ 100%) */
export async function linkGoogleToUsernameAccount(auth, password) {
  const { customToken } = await post('step-up', { password }, await auth.currentUser.getIdToken());
  await signInWithCustomToken(auth, customToken);
  try {
    return await linkWithPopup(auth.currentUser, new GoogleAuthProvider());
  } catch (e) {
    if (e.code === 'auth/credential-already-in-use' || e.code === 'auth/email-already-in-use') {
      throw new AccountApiError('บัญชี Google นี้ถูกใช้กับบัญชีอื่นแล้ว ระบบจะไม่รวมบัญชีให้อัตโนมัติ', 409, 'google_in_use');
    }
    throw e;
  }
}

/** ผู้ใช้ Google เดิม -> เพิ่มชื่อผู้ใช้+รหัสผ่าน (UID เดิม) — ต้องล็อกอิน Google สดก่อน */
export async function addUsernameToGoogleAccount(auth, { username, password, turnstileToken }) {
  await reauthenticateWithPopup(auth.currentUser, new GoogleAuthProvider());
  const { recoveryCodes } = await post('link-username', { username, password, turnstileToken }, await auth.currentUser.getIdToken(true));
  return recoveryCodes;
}

/** กู้รหัสผ่านด้วย Google สด (เฉพาะ UID ที่ผูกทั้งสองวิธีแล้ว) */
export async function resetPasswordViaGoogle(auth, newPassword) {
  await reauthenticateWithPopup(auth.currentUser, new GoogleAuthProvider());
  const { customToken } = await post('password', { newPassword }, await auth.currentUser.getIdToken(true));
  await signInWithCustomToken(auth, customToken);
}

/** โปรไฟล์ครั้งแรกของบัญชีชื่อผู้ใช้: role ต้องตรง claim และห้ามมี email */
export function buildUsernameProfile(claims, fullname, createdAt) {
  if (createdAt === undefined) throw new Error('createdAt required');
  return { fullname, role: claims.role, username: claims.uname, createdAt };
}


