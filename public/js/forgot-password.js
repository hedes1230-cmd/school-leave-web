
    import { auth, sendPasswordResetEmail } from "./firebase.js";
    import { $, esc, setBusy, authErrorText } from "./common.js";

    const box = $("#messageBox");
    const show = (html, type) => { box.innerHTML = html; box.className = `notice notice-${type}`; box.hidden = false; };

    $("#forgotForm").addEventListener("submit", async (e) => {
        e.preventDefault();
        const email = $("#email").value.trim();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return show('<i class="fas fa-circle-exclamation"></i> รูปแบบอีเมลไม่ถูกต้อง', "err");

        const btn = $("#submitBtn");
        setBusy(btn, true);
        box.hidden = true;
        try {
            await sendPasswordResetEmail(auth, email);
            show(`<i class="fas fa-circle-check"></i> หากอีเมล <b>${esc(email)}</b> มีอยู่ในระบบ จะได้รับลิงก์ตั้งรหัสผ่านใหม่ภายในไม่กี่นาที<br><small>ตรวจสอบในกล่องจดหมายขยะ (Spam) ด้วย</small>`, "ok");
            e.target.reset();
        } catch (err) {
            console.error(err);
            show(`<i class="fas fa-circle-exclamation"></i> ${esc(err.code === "auth/user-not-found" ? "หากอีเมลนี้มีอยู่ในระบบ คุณจะได้รับลิงก์ตั้งรหัสผ่านใหม่ โปรดตรวจสอบกล่องจดหมาย" : authErrorText(err))}`, "err");
        } finally {
            setBusy(btn, false);
        }
    });
