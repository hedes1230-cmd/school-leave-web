/* Progressive interaction enhancements; no account or leave data is persisted here. */
(() => {
  const notice = document.getElementById('connectionNotice');
  const connection = () => { if (notice) notice.hidden = navigator.onLine; };
  window.addEventListener('online', connection);
  window.addEventListener('offline', connection);
  connection();
  const formIds = ['loginForm', 'signupForm', 'forgotForm', 'leaveForm'];
  const clearError = el => {
    document.getElementById(`${el.id}-error`)?.remove();
    el.removeAttribute('aria-invalid');
    const desc = (el.getAttribute('aria-describedby') || '').split(' ').filter(id => id && id !== `${el.id}-error`);
    if (desc.length) el.setAttribute('aria-describedby', desc.join(' ')); else el.removeAttribute('aria-describedby');
  };
  function fieldError(el, message) {
    clearError(el);
    const hint = document.createElement('span');
    hint.className = 'form-error'; hint.id = `${el.id}-error`; hint.textContent = message;
    (el.closest('.input-icon') || el).after(hint);
    el.setAttribute('aria-invalid', 'true');
    el.setAttribute('aria-describedby', [el.getAttribute('aria-describedby'), hint.id].filter(Boolean).join(' '));
  }
  function summary(form, text) {
    let box = form.querySelector('.validation-summary');
    if (!box) { box = document.createElement('div'); box.className = 'validation-summary'; box.setAttribute('role', 'alert'); form.prepend(box); }
    box.textContent = text;
  }
  document.addEventListener('submit', event => {
    const form = event.target;
    if (!formIds.includes(form.id)) return;
    form.querySelector('.validation-summary')?.remove();
    let first = null;
    for (const el of form.querySelectorAll('input[id], select[id], textarea[id]')) {
      clearError(el);
      if (el.disabled || ['file', 'hidden'].includes(el.type)) continue;
      if (el.type === 'radio') {
        if (el.id === 'roleStudent' && !form.querySelector('input[name="role"]:checked')) {
          const hint = document.createElement('span'); hint.id = `${el.id}-error`; hint.className = 'form-error'; hint.textContent = 'กรุณาเลือกสถานะนักเรียนหรือครู';
          el.closest('.role-pick').after(hint); el.setAttribute('aria-invalid','true'); el.setAttribute('aria-describedby',hint.id); first ||= el;
        }
        continue;
      }
      let message = '';
      if (el.required && !el.value.trim()) message = 'กรุณากรอกข้อมูลช่องนี้';
      else if (el.validity.typeMismatch) message = 'กรุณากรอกอีเมลให้ครบ เช่น name@example.com';
      else if (el.minLength > 0 && el.value && el.value.trim().length < el.minLength) message = `กรุณากรอกอย่างน้อย ${el.minLength} ตัวอักษร`;
      else if (el.id === 'confirmPassword' && el.value !== document.getElementById('password')?.value) message = 'รหัสผ่านทั้งสองช่องไม่ตรงกัน';
      else if (el.id === 'endDate' && el.value < document.getElementById('startDate')?.value) message = 'วันสิ้นสุดต้องไม่อยู่ก่อนวันเริ่มต้น';
      if (message) { fieldError(el, message); first ||= el; }
    }
    if (first || !navigator.onLine || !window.__schoolModulesReady) {
      event.preventDefault(); event.stopImmediatePropagation();
      summary(form, first ? 'ยังส่งข้อมูลไม่ได้ กรุณาตรวจสอบช่องที่มีข้อความสีแดง' : !navigator.onLine ? 'ขณะนี้ออฟไลน์ กรุณาเชื่อมต่ออินเทอร์เน็ตแล้วลองอีกครั้ง' : 'กำลังเชื่อมต่อระบบ กรุณารอสักครู่แล้วลองอีกครั้ง');
      first?.focus();
    }
  }, true);
  document.addEventListener('input', event => {
    if (event.target.matches('input[type="radio"][name="role"]')) {
      event.target.form?.querySelectorAll('input[name="role"]').forEach(clearError);
    }
    if (event.target.getAttribute('aria-invalid') === 'true') clearError(event.target);
  });
  function updateSummary() {
    const teacher = document.getElementById('targetTeacher');
    if (!teacher || !document.getElementById('reviewTeacher')) return;
    document.getElementById('reviewTeacher').textContent = teacher.value ? teacher.selectedOptions[0]?.textContent : 'ยังไม่ได้เลือกครู';
    document.getElementById('reviewType').textContent = document.querySelector('[data-type].active')?.textContent.trim() || 'ลาป่วย';
    const start = document.getElementById('startDate').value;
    const end = document.getElementById('endDate').value;
    const formatter = new Intl.DateTimeFormat('th-TH', {day:'numeric',month:'short',year:'numeric',timeZone:'UTC'});
    let days = 0;
    if (start && end && start <= end) {
      const a = new Date(start + 'T00:00:00Z'), b = new Date(end + 'T00:00:00Z');
      for (let d = new Date(a), i = 0; d <= b && i < 3660; d.setUTCDate(d.getUTCDate() + 1), i++) if (![0,6].includes(d.getUTCDay())) days++;
      document.getElementById('reviewDates').textContent = `${formatter.format(a)} – ${formatter.format(b)}`;
      document.getElementById('reviewDays').textContent = `${days} วัน`;
    } else {
      document.getElementById('reviewDates').textContent = 'กรุณาเลือกช่วงวันที่ให้ครบ';
      document.getElementById('reviewDays').textContent = '—';
    }
  }
  ['input','change','click','leave-summary-update','school-modules-ready'].forEach(name => document.addEventListener(name, () => queueMicrotask(updateSummary)));
  updateSummary();
  setTimeout(() => {
    if (window.__schoolModulesReady || document.body.dataset.preview) return;
    const box = document.createElement('div'); box.className = 'load-error'; box.setAttribute('role','alert');
    box.innerHTML = '<h2>ยังเชื่อมต่อระบบไม่ได้</h2><p>กรุณาตรวจสอบอินเทอร์เน็ต แล้วลองโหลดหน้าอีกครั้ง</p><button class="btn btn-primary">ลองใหม่</button>';
    box.querySelector('button').addEventListener('click', () => location.reload()); document.body.append(box);
    document.addEventListener('school-modules-ready', () => box.remove(), {once:true});
  }, 15000);
})();
