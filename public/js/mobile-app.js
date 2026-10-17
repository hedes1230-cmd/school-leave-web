(() => {
  if ('serviceWorker' in navigator && window.isSecureContext) {
    window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));
  }
  const table = document.querySelector('.table-wrap');
  if (table) { table.tabIndex = 0; table.setAttribute('role', 'region'); table.setAttribute('aria-label', 'ตารางสรุป เลื่อนแนวนอนเพื่อดูทุกคอลัมน์'); }
  if (!['/', '/index', '/index.html'].includes(location.pathname) || !document.getElementById('loginForm')) return;
  const ua = navigator.userAgent || '';
  const isAndroid = /Android/i.test(ua) || navigator.userAgentData?.platform === 'Android';
  const isIOS = /iPhone|iPad|iPod/i.test(ua) || (/Macintosh/i.test(ua) && navigator.maxTouchPoints > 1);
  const desktopInstall = !isAndroid && !isIOS;
  let guest = document.body.dataset.installGuest === 'true';
  let installed = matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  let pendingPrompt, busy = false;
  let button = document.getElementById('installApp');
  let status = document.getElementById('installStatus');
  const host = document.querySelector('.auth-links') || document.querySelector('main');
  if (!button && !installed && host && desktopInstall) {
    button = document.createElement('button'); button.type = 'button';
    button.className = 'btn btn-ghost install-app'; button.textContent = 'ติดตั้งบนคอมพิวเตอร์';
    host.append(button);
  }
  let androidDownload;
  if (isAndroid && host && !installed) {
    androidDownload = document.createElement('a');
    androidDownload.href = '/downloads/school-leave-1.1.1.apk';
    androidDownload.download = 'school-leave-1.1.1.apk';
    androidDownload.className = 'btn btn-ghost install-app';
    androidDownload.textContent = 'ดาวน์โหลดแอป Android 1.1.1';
    androidDownload.hidden = !guest;
    host.append(androidDownload);
  }
  if (!status && button) {
    status = document.createElement('p'); status.className = 'hint';
    status.setAttribute('role', 'status'); button.after(status);
  }
  const message = text => { if (status) status.textContent = text; };
  if (button) {
    button.hidden = installed || !guest || !desktopInstall;
    button.disabled = true;
    button.onclick = async () => {
      if (busy || installed || !guest || !desktopInstall) return;
      if (!pendingPrompt) { message('เบราว์เซอร์นี้ยังไม่เปิดให้ติดตั้งจากปุ่ม'); return; }
      const current = pendingPrompt; pendingPrompt = null; busy = true; button.disabled = true;
      try {
        await current.prompt();
        const choice = await current.userChoice;
        if (!installed) message(choice.outcome === 'accepted' ? 'กำลังติดตั้ง…' : 'ยกเลิกการติดตั้งแล้ว');
      } catch { message('ยังติดตั้งไม่ได้ กรุณาลองอีกครั้งภายหลัง'); }
      finally { busy = false; button.disabled = installed || !guest || !pendingPrompt; }
    };
  }
  if (installed) message('ติดตั้งแล้ว');
  window.addEventListener('install-auth-state', event => {
    guest = event.detail === true;
    if (androidDownload) androidDownload.hidden = installed || !guest;
    if (button) button.hidden = installed || !guest || !desktopInstall;
    if (button) button.disabled = busy || installed || !guest || !pendingPrompt;
    if (status) status.hidden = !guest || !desktopInstall;
  });
  window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault();
    if (installed || !desktopInstall) return;
    pendingPrompt = event; message('');
    if (button) button.disabled = busy || !guest;
  });
  window.addEventListener('appinstalled', () => {
    installed = true; pendingPrompt = null;
    if (androidDownload) androidDownload.hidden = true;
    if (button) button.hidden = true;
    message('ติดตั้งแล้ว');
  });
})();
