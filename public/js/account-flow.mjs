// Credentials and recovery codes stay in memory; never persist them in browser storage.
export function createAccountFlow(deps) {
  let busy = false;
  return async function run(action, input) {
    if (busy) return {ignored:true};
    busy = true;
    try {
      let codes;
      if (action === 'register') codes = await deps.register(input);
      else if (action === 'login') codes = (await deps.login(input)).recoveryCodes;
      else if (action === 'recover') await deps.recover(input);
      else throw new Error('invalid-action');
      // Await acknowledgement before navigation or profile writes, which can fail.
      if (codes?.length) await deps.showRecoveryCodes(codes);
      if (action === 'register') {
        try { await deps.saveProfile(input.fullname, input.role); }
        catch { await deps.completeProfile(); return {profilePending:true}; }
      }
      await deps.goHome();
      return {ok:true};
    } finally { busy = false; }
  };
}

export function accountErrorText(error) {
  const messages = {
    username_unavailable:'รหัสบัญชีนี้ใช้ไม่ได้ กรุณาเลือกรหัสอื่น',
    login_failed:'รหัสบัญชีหรือรหัสผ่านไม่ถูกต้อง',
    invalid_recovery:'รหัสบัญชีหรือรหัสกู้คืนไม่ถูกต้อง',
    rate_limited:'ลองบ่อยเกินไป กรุณารอสักครู่',
    turnstile_failed:'กรุณายืนยันว่าไม่ใช่บอตอีกครั้ง',
    turnstile_unavailable:'ตรวจสอบบอตไม่ได้ กรุณาลองใหม่',
    activation_pending:'สร้างบัญชีแล้ว แต่เปิดใช้งานยังไม่เสร็จ กรุณาไปหน้าเข้าสู่ระบบด้วยรหัสบัญชีเดิม',
    revocation_pending:'บัญชีกำลังปรับสถานะ หากเพิ่งกู้บัญชีให้ลองเข้าสู่ระบบด้วยรหัสผ่านใหม่ภายหลัง',
    account_disabled:'บัญชีถูกระงับ กรุณาติดต่อผู้ดูแล',
    not_configured:'ระบบรหัสบัญชียังไม่เปิดใช้งาน ใช้ Google ได้ก่อน',
    invalid_username:'รหัสบัญชีต้องมี 3–24 ตัว เริ่มด้วย a–z และใช้ a–z, 0–9 หรือ _',
    invalid_password:'รหัสผ่านต้องมี 12–128 ตัวอักษร',
    invalid_role:'กรุณาเลือกนักเรียนหรือครู',
    invalid_name:'กรุณากรอกชื่อ–นามสกุลไม่เกิน 120 ตัวอักษร'
  };
  return messages[error?.code] || 'ทำรายการไม่สำเร็จ กรุณาลองใหม่ภายหลัง';
}
