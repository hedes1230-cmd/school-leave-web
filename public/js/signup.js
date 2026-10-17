// Username registration is deliberately unavailable until server-side release gates pass.
// The disabled fieldset also prevents Google error handling from enabling submission.
const form = document.getElementById('signupForm');
form.addEventListener('submit', event => {
  event.preventDefault();
  const message = document.getElementById('signupMessage');
  message.textContent = 'สมัครด้วยรหัสบัญชียังไม่เปิดใช้งาน ใช้ Google ได้ก่อน';
  message.hidden = false;
  message.focus();
});
