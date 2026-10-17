import {routeAdmin} from './admin-route.js';
import {accountIdentity} from './account-identity.mjs';

    import { auth, db, ref, get, onAuthStateChanged, signInWithEmailAndPassword,
             sendEmailVerification, signOut } from "./firebase.js";
    import { $, toast, setBusy, authErrorText, HOME_BY_ROLE, initPasswordToggles, flashFromQuery } from "./common.js";

    initPasswordToggles();
    flashFromQuery();

    const form = $("#loginForm");
    const btn = $("#loginBtn");
    const notice = $("#verifyNotice");
    let busy = false;
    // Google redirect completion owns routing on this page load. Avoid duplicate
    // reload, token refresh and profile requests racing with google-login.js.
    const googleRedirectPending = sessionStorage.getItem("school-leave-google-redirect") === "1";
    // Installation is available only on the signed-out home page.
    onAuthStateChanged(auth, user => {
        document.body.dataset.installGuest = String(!user);
        window.dispatchEvent(new CustomEvent('install-auth-state', { detail: !user }));
    });

    async function goHome(user) {
        if(await routeAdmin(user))return true;
        const snap = await get(ref(db, `users/${user.uid}`));
        const role = snap.val()?.role;
        if (!snap.exists()) {
            location.replace("complete-profile.html"); return true;
        }
        if (!HOME_BY_ROLE[role]) {
            await signOut(auth);
            toast("ไม่พบข้อมูลผู้ใช้งานในระบบ กรุณาติดต่อผู้ดูแล", "error", 6000);
            return false;
        }
        location.replace(HOME_BY_ROLE[role]);
        return true;
    }

    // ถ้าล็อกอินค้างไว้แล้ว ให้พาไปหน้า dashboard เลย
    const stop = onAuthStateChanged(auth, async (user) => {
        stop();
        if (!user || busy || googleRedirectPending) return;
        try {
            await user.reload();
            if (await accountIdentity(user)) {
                await user.getIdToken(true);   // รีเฟรช token ให้มีสถานะยืนยันอีเมลล่าสุด
                await goHome(user);
            }
            else notice.hidden = false;
        } catch (e) { console.error(e); }
    });

    form.addEventListener("submit", async (e) => {
        e.preventDefault();
        const email = $("#email").value.trim();
        const password = $("#password").value;
        if (!email || !password) return toast("กรุณากรอกอีเมลและรหัสผ่าน", "warn");

        if (busy) return;
        busy = true;
        notice.hidden = true;
        $("#googleLoginBtn").disabled = true;
        setBusy(btn, true, "กำลังตรวจสอบ...");
        try {
            const { user } = await signInWithEmailAndPassword(auth, email, password);
            if (!user.emailVerified) {
                notice.hidden = false;   // ยังไม่ signOut เพื่อให้กดส่งอีเมลยืนยันซ้ำได้
                return;
            }
            if (await goHome(user)) return;
        } catch (err) {
            console.error(err);
            toast(authErrorText(err), "error");
        } finally {
            setBusy(btn, false);
            busy = false;
            $("#googleLoginBtn").disabled = false;
        }
    });

    $("#resendBtn").addEventListener("click", async (e) => {
        const b = e.currentTarget;
        const user = auth.currentUser;
        if (!user) return toast("กรุณากรอกอีเมลและรหัสผ่าน แล้วกดเข้าสู่ระบบก่อน", "warn");
        setBusy(b, true, "กำลังส่ง...");
        try {
            await sendEmailVerification(user);
            toast(`ส่งอีเมลยืนยันไปที่ ${user.email} แล้ว`, "success", 6000);
            await signOut(auth);
        } catch (err) {
            toast(authErrorText(err), "error");
        } finally {
            setBusy(b, false);
        }
    });
