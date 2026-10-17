import {accountIdentity,directoryEntry} from './account-identity.mjs';
import {notifyEvent, stopNotifications} from './notifications.js';
// ===== ฟังก์ชันกลางที่ใช้ร่วมกันทุกหน้า =====
import { auth, db, onAuthStateChanged, signOut, ref, get, update, serverTimestamp, onValue, query, orderByChild, equalTo, limitToFirst } from "./firebase.js";
import { countDays } from './leave-dates.js';
export { countDays, parseLeaveDay } from './leave-dates.js';

// ---------- ความปลอดภัย: กัน XSS ทุกครั้งที่เอาข้อมูลผู้ใช้ไปแสดงผล ----------
export function esc(value) {
    return String(value ?? "")
        .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

// ---------- Toast แจ้งเตือน (แทน alert) ----------
export function toast(message, type = "info", ms = 3500) {
    let box = $("#toast-box");
    if (!box) {
        box = document.createElement("div");
        box.id = "toast-box";
        box.setAttribute("aria-live", "polite");
        document.body.appendChild(box);
    }
    const icons = { success: "fa-circle-check", error: "fa-circle-exclamation", info: "fa-circle-info", warn: "fa-triangle-exclamation" };
    const el = document.createElement("div");
    el.className = `toast toast-${type}`;
    if (type === "error") el.setAttribute("role", "alert");
    el.innerHTML = `<i class="fas ${icons[type] || icons.info}"></i><span>${esc(message)}</span>`;
    box.appendChild(el);
    requestAnimationFrame(() => el.classList.add("show"));
    const close = () => { el.classList.remove("show"); setTimeout(() => el.remove(), 300); };
    el.addEventListener("click", close);
    setTimeout(close, ms);
}

// ---------- Dialog ยืนยัน / กรอกข้อความ (แทน confirm) ----------
// คืนค่า Promise<{ ok: boolean, value: string }>
export function dialog({ title, message = "", confirmText = "ยืนยัน", cancelText = "ยกเลิก",
                         danger = false, input = null } = {}) {
    // กันเปิด dialog ซ้อนกัน (เช่นกดปุ่มรัว ๆ)
    if (document.querySelector(".modal-backdrop:not(.lightbox)")) return Promise.resolve({ ok: false, value: "" });
    return new Promise((resolve) => {
        const opener = document.activeElement;
        const wrap = document.createElement("div");
        wrap.className = "modal-backdrop";
        wrap.innerHTML = `
            <div class="modal" role="dialog" aria-modal="true" aria-labelledby="dlg-title" aria-describedby="dlg-msg">
                <h3 id="dlg-title">${esc(title)}</h3>
                ${message ? `<p class="modal-msg" id="dlg-msg">${esc(message)}</p>` : ""}
                ${input ? `<textarea class="modal-input" rows="3" maxlength="300" aria-label="${esc(input.placeholder || "ข้อความ")}" placeholder="${esc(input.placeholder || "")}">${esc(input.value || "")}</textarea>
                           <small class="modal-err" hidden>กรุณากรอกข้อความ</small>` : ""}
                <div class="modal-actions">
                    <button type="button" class="btn btn-ghost" data-act="cancel">${esc(cancelText)}</button>
                    <button type="button" class="btn ${danger ? "btn-danger" : "btn-primary"}" data-act="ok">${esc(confirmText)}</button>
                </div>
            </div>`;
        document.body.appendChild(wrap);
        const txt = $(".modal-input", wrap);
        const done = (ok) => {
            if (ok && input?.required && !txt.value.trim()) {
                $(".modal-err", wrap).hidden = false; txt.focus(); return;
            }
            document.removeEventListener("keydown", onKey);
            wrap.remove();
            opener?.focus?.();
            resolve({ ok, value: txt ? txt.value.trim() : "" });
        };
        const onKey = (e) => {
            if (e.key === "Escape") return done(false);
            if (e.key === "Enter" && (e.ctrlKey || e.metaKey) && txt) return done(true);
            if (e.key === "Tab") {   // วนโฟกัสอยู่ใน dialog
                const f = $$("textarea, button", wrap);
                const i = f.indexOf(document.activeElement);
                if (e.shiftKey && i <= 0) { e.preventDefault(); f[f.length - 1].focus(); }
                else if (!e.shiftKey && i === f.length - 1) { e.preventDefault(); f[0].focus(); }
            }
        };
        document.addEventListener("keydown", onKey);
        const openedAt = performance.now();
        wrap.addEventListener("click", (e) => {
            // กดนอกกล่องเพื่อปิด (ยกเว้นคลิกที่ 2 ของ double-click ตอนเพิ่งเปิด)
            if (e.target === wrap) return performance.now() - openedAt > 400 && done(false);
            const act = e.target.closest("[data-act]")?.dataset.act;
            if (act) done(act === "ok");
        });
        (txt || $('[data-act="ok"]', wrap)).focus();
    });
}

// ---------- ดูรูปหลักฐานแบบขยาย ----------
export function openImage(url) {
    const isData = /^data:image\/jpeg;base64,/.test(url);
    if (!isData) { toast("หลักฐานเก่าเป็นลิงก์ภายนอก กรุณาติดต่อผู้ส่งเพื่อตรวจสอบ", "warn"); return; }
    const wrap = document.createElement("div");
    wrap.className = "modal-backdrop lightbox";
    wrap.innerHTML = `<img src="${esc(url)}" alt="หลักฐานการลา">
        ${isData
            ? `<a class="lightbox-open" href="${esc(url)}" download="หลักฐานการลา.jpg"><i class="fas fa-download"></i> ดาวน์โหลดรูป</a>`
            : `<a class="lightbox-open" href="${esc(url)}" target="_blank" rel="noopener"><i class="fas fa-up-right-from-square"></i> เปิดในแท็บใหม่</a>`}`;
    wrap.setAttribute("role", "dialog");
    wrap.setAttribute("aria-label", "รูปหลักฐาน (กด Esc เพื่อปิด)");
    const close = () => { wrap.remove(); document.removeEventListener("keydown", onKey); };
    const onKey = (e) => { if (e.key === "Escape") close(); };
    wrap.addEventListener("click", (e) => { if (!e.target.closest("a")) close(); });
    document.addEventListener("keydown", onKey);
    document.body.appendChild(wrap);
    $(".lightbox-open", wrap).focus();
}

// ---------- ปุ่มสถานะกำลังโหลด ----------
export function setBusy(btn, busy, busyText = "กำลังดำเนินการ...") {
    if (!btn) return;
    if (busy) {
        if (!("label" in btn.dataset)) btn.dataset.label = btn.innerHTML;   // เก็บข้อความเดิมครั้งแรกเท่านั้น
        btn.disabled = true;
        btn.setAttribute("aria-busy", "true");
        btn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> ${esc(busyText)}`;
    } else {
        btn.disabled = false;
        btn.removeAttribute("aria-busy");
        if ("label" in btn.dataset) { btn.innerHTML = btn.dataset.label; delete btn.dataset.label; }
    }
}

// ---------- วันที่ / เวลา ----------
const TH_MONTHS = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];

// "2026-03-05" -> "5 มี.ค. 2569"
export function thaiDate(ymd) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd || "");
    if (!m) return esc(ymd || "-");
    return `${+m[3]} ${TH_MONTHS[+m[2] - 1]} ${+m[1] + 543}`;
}

export function thaiDateRange(start, end) {
    return !end || start === end ? thaiDate(start) : `${thaiDate(start)} – ${thaiDate(end)}`;
}

// ISO timestamp -> "5 มี.ค. 2569 เวลา 14:05 น."
export function thaiDateTime(iso) {
    const d = new Date(iso);
    if (isNaN(d)) return "-";
    const hh = String(d.getHours()).padStart(2, "0"), mm = String(d.getMinutes()).padStart(2, "0");
    return `${d.getDate()} ${TH_MONTHS[d.getMonth()]} ${d.getFullYear() + 543} เวลา ${hh}:${mm} น.`;
}

const isYMD = (v) => /^\d{4}-\d{2}-\d{2}$/.test(v || "");

// จำนวนวันลา: นับเฉพาะวันจันทร์-ศุกร์ (รวมวันแรกและวันสุดท้าย) ไม่นับเสาร์-อาทิตย์

// วันทำการถัดไป (ถ้าวันนี้เป็นวันจันทร์-ศุกร์ ได้วันนี้)
export function nextWeekdayYMD() {
    const d = new Date();
    while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() + 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function todayYMD() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// ---------- สถานะใบลา ----------
export const STATUS = {
    pending:  { label: "รออนุมัติ",   cls: "badge-pending",  icon: "fa-hourglass-half" },
    approved: { label: "อนุมัติแล้ว", cls: "badge-approved", icon: "fa-circle-check" },
    rejected: { label: "ไม่อนุมัติ",  cls: "badge-rejected", icon: "fa-circle-xmark" }
};

export function statusBadge(status) {
    const s = STATUS[status] || { label: status || "-", cls: "", icon: "fa-circle" };
    return `<span class="badge ${s.cls}"><i class="fas ${s.icon}"></i> ${esc(s.label)}</span>`;
}

// คำนวณจากวันที่จริงเสมอ (ไม่เชื่อค่า days ที่ฝั่ง client ส่งมา)
export const leaveDays = (l) => isYMD(l.date) ? countDays(l.date, l.endDate) : (Number(l.days) || 0);

// ---------- Avatar ตัวอักษรย่อ (ไม่ต้องส่งชื่อไปเว็บภายนอก) ----------
export function avatar(name, size = "") {
    const clean = String(name || "?").trim();
    let h = 0;
    for (const ch of clean) h = (h * 31 + ch.codePointAt(0)) % 360;
    const initial = [...clean][0] || "?";
    return `<div class="avatar ${size ? "avatar-" + size : ""}" style="background:hsl(${h} 50% 30%)">${esc(initial)}</div>`;
}

// ---------- ข้อความ error ของ Firebase เป็นภาษาไทย ----------
export function authErrorText(err) {
    const map = {
        "auth/invalid-email": "รูปแบบอีเมลไม่ถูกต้อง",
        "auth/invalid-credential": "อีเมลหรือรหัสผ่านไม่ถูกต้อง",
        "auth/wrong-password": "อีเมลหรือรหัสผ่านไม่ถูกต้อง",
        "auth/user-not-found": "อีเมลหรือรหัสผ่านไม่ถูกต้อง",
        "auth/email-already-in-use": "สมัครไม่สำเร็จ หากเคยสมัครแล้วให้เข้าสู่ระบบหรือใช้ลืมรหัสผ่าน",
        "auth/weak-password": "รหัสผ่านสั้นหรือง่ายเกินไป",
        "auth/too-many-requests": "ลองผิดหลายครั้งเกินไป กรุณารอสักครู่แล้วลองใหม่",
        "auth/network-request-failed": "เชื่อมต่ออินเทอร์เน็ตไม่ได้ กรุณาตรวจสอบเครือข่าย",
        "auth/user-disabled": "บัญชีนี้ถูกระงับการใช้งาน",
        "auth/missing-password": "กรุณากรอกรหัสผ่าน",
        "auth/missing-email": "กรุณากรอกอีเมล",
        "auth/quota-exceeded": "ระบบส่งอีเมลเกินโควตาชั่วคราว กรุณาลองใหม่ภายหลัง",
        "auth/operation-not-allowed": "ระบบยังไม่เปิดให้ใช้การเข้าสู่ระบบด้วยอีเมล",
        "PERMISSION_DENIED": "บันทึกไม่ได้ กรุณาตรวจสิทธิ์และข้อมูล หากเพิ่งส่งใบลาให้รอ 1 นาที (สูงสุด 5 ใบต่อวัน)"
    };
    const code = err?.code || "";
    return map[code] || (String(err?.message || "").includes("PERMISSION_DENIED") ? map.PERMISSION_DENIED : "เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง");
}

// ---------- หน้า dashboard ตามบทบาท ----------
export const HOME_BY_ROLE = { teacher: "teacher_dashboard.html", student: "student_leave_form.html" };

// ตรวจสิทธิ์ก่อนเข้าหน้า: ต้องล็อกอิน + ยืนยันอีเมล + บทบาทตรงกับหน้า
// คืนค่า Promise<{ user, profile }>
export function requireRole(role) {
    return new Promise((resolve) => {
        const stop = onAuthStateChanged(auth, async (user) => {
            stop();
            if (!user) return location.replace("index.html");
            if (!await accountIdentity(user)) {
                await signOut(auth);
                return location.replace("index.html?msg=verify");
            }
            try {
                const snap = await get(ref(db, `users/${user.uid}`));
                const profile = snap.val();
                if (!profile) {
                    return location.replace("complete-profile.html");
                }
                if (profile.role !== role) return location.replace(HOME_BY_ROLE[profile.role] || "index.html");
                await syncDirectory(user, profile);
                startIdleLogout();
                startAccountRefresh(user);
                initConnectionCode(user.uid);
                initBlockedUsers(user.uid);
                document.body.classList.add("ready");
                // ถ้าออกจากระบบจากแท็บอื่น หรือ session หมดอายุ ให้กลับหน้าเข้าสู่ระบบ
                onAuthStateChanged(auth, (u) => { if (!u) location.replace("index.html"); });
                resolve({ user, profile });
            } catch (err) {
                console.error(err);
                document.body.classList.add("ready");
                document.body.insertAdjacentHTML("beforeend", `
                    <div class="load-error">
                        <i class="fas fa-plug-circle-exclamation" style="font-size:2.2rem;color:var(--red)"></i>
                        <div>โหลดข้อมูลไม่สำเร็จ: ${esc(authErrorText(err))}</div>
                        <button class="btn btn-primary" id="retryLoad"><i class="fas fa-rotate"></i> ลองใหม่</button>
                    </div>`);
                $("#retryLoad")?.addEventListener("click", () => location.reload());
            }
        });
    });
}

// ---------- สมุดรายชื่อ (directory) ----------
// Private profiles and email are readable only by their owner; peers use directory metadata.
// directory supports exact codes and bounded exact-name queries; no unrestricted listing.

// Firebase ใช้ . # $ [ ] / ในชื่อ key ไม่ได้ -> แทน . ด้วย , (อีเมลที่มีอักขระต้องห้ามอื่นจะไม่ถูกทำ index)
export function emailKey(email) {
    const k = String(email || "").trim().toLowerCase().replaceAll(".", ",");
    return /[#$\[\]\/]/.test(k) || !k.includes("@") ? null : k;
}

export const emailHint = d => [d?.grade, d?.username ? '@'+d.username : ''].filter(Boolean).join(' · ');

// ให้ข้อมูลของตัวเองใน directory เป็นปัจจุบัน (ทำทุกครั้งที่เข้า dashboard)
async function syncDirectory(user, profile) {
    const entry = directoryEntry(profile);
    if (!entry) return;
    const cur=(await get(ref(db, `directory/${user.uid}`))).val() || {};
    if (Object.keys(entry).every(k=>cur[k]===entry[k]) && !cur.emailStart && !cur.emailDomain && !cur.email && (cur.grade||null)===(profile.grade||null)) return;
    await update(ref(db, `directory/${user.uid}`),{...entry,grade:profile.grade||null,emailStart:null,emailDomain:null,email:null});
}

// ดึงอีเมลของคนที่เกี่ยวข้องแบบมีแคช: ได้อีเมลเต็มถ้ามีสิทธิ์ ไม่งั้นใช้อีเมลแบบย่อจาก directory
// ensure({ uid: status }) — ถ้าสถานะการเชื่อมต่อเปลี่ยน จะดึงใหม่ (สิทธิ์เห็นอีเมลขึ้นกับสถานะ)
export function createUserLookup(onLoaded) {
 const cache={},stops=new Map();
 return {details:uid=>emailHint(cache[uid]),name:uid=>cache[uid]?.fullname||'',
 ensure(statusByUid){
  for(const [uid,stop] of stops)if(!(uid in statusByUid)){stop();stops.delete(uid);delete cache[uid];}
  for(const uid of Object.keys(statusByUid))if(!stops.has(uid)){
   stops.set(uid,onValue(ref(db,'directory/'+uid),s=>{cache[uid]=s.val()||{};onLoaded?.();},()=>{cache[uid]={};onLoaded?.();}));
  }
 }};
}

// Search exact connection codes first, then exact full names (at most 10 records).
// คืนค่า [{ uid, fullname, contact }]
export async function searchPeople(q, role, myUid) {
    const term=q.trim();
    if (term.length < 2 || term.length > 128) return [];
    if (/^[A-Za-z0-9_-]{20,128}$/.test(term) && term!==myUid) {
        try {
            const d=(await get(ref(db, `directory/${term}`))).val();
            if (d && d.role===role) return [{uid:term,fullname:d.fullname,contact:emailHint(d)}];
        } catch (err) { if (!String(err.code||err.message).includes('PERMISSION_DENIED')) throw err; }
    }
    if (term.length > 120) return [];
    const snap=await get(query(ref(db,'directory'),orderByChild('fullname'),equalTo(term),limitToFirst(10)));
    return Object.entries(snap.val() || {}).filter(([uid,d])=>uid!==myUid && d.role===role)
        .map(([uid,d])=>({uid,fullname:d.fullname,contact:emailHint(d)}));
}

export function normalizeLeaves(records) {
    return Object.fromEntries(Object.entries(records||{}).map(([id,l])=>[id,{
        ...l,
        ...(l.schemaVersion===2 ? {date:new Date(l.startDay*86400000).toISOString().slice(0,10),endDate:new Date(l.endDay*86400000).toISOString().slice(0,10)} : {}),
        timestamp:typeof l.timestamp==='number' ? new Date(l.timestamp).toISOString() : l.timestamp
    }]));
}

function initConnectionCode(uid) {
    const target=document.getElementById('searchForm');
    if (!target || document.getElementById('connectionCode')) return;
    const box=document.createElement('div'); box.className='notice';
    box.innerHTML='<b>รหัสเชื่อมต่อของคุณ</b><p><code id="connectionCode"></code></p><button type="button" class="btn btn-ghost btn-sm" id="copyConnectionCode">คัดลอกรหัส</button>';
    box.querySelector('code').textContent=uid;
    box.querySelector('button').addEventListener('click',async()=>{
        try { await navigator.clipboard.writeText(uid); toast('คัดลอกรหัสแล้ว','success'); }
        catch { toast('กรุณาเลือกและคัดลอกรหัสที่แสดงด้านบน','info'); }
    }); target.before(box);
}

let idleStarted=false;
function startIdleLogout() {
    if(idleStarted)return; idleStarted=true;
    let last=Date.now();
    for(const e of ['pointerdown','keydown','touchstart']) document.addEventListener(e,()=>{last=Date.now();},{passive:true});
    const check=async()=>{if(auth.currentUser && Date.now()-last>=30*60*1000){await signOut(auth);location.replace('index.html?msg=idle');}};
    setInterval(check,30000); document.addEventListener('visibilitychange',check);
}

// error ของ realtime listener: ถ้าเพิ่งออกจากระบบ (listener ถูกตัดสิทธิ์) ไม่ต้องแจ้ง เพราะกำลังพาไปหน้าเข้าสู่ระบบ
export function onListenError(err) {
    if (!auth.currentUser) return;
    console.error(err);
    toast(authErrorText(err), "error", 6000);
}

export async function logout() {
    const res = await dialog({ title: "ออกจากระบบ?", confirmText: "ออกจากระบบ", danger: true });
    if (!res.ok) return;
    await stopNotifications().catch(()=>{});
    await signOut(auth);
    location.replace("index.html");
}

// ---------- Sidebar / แท็บ / เมนูมือถือ ----------
export function initLayout({ onTabChange } = {}) {
    const sidebar = $(".sidebar");
    const backdrop = $(".sidebar-backdrop");
    const menuBtn = $("#menuBtn");
    const mobile = matchMedia("(max-width: 900px)");
    const toggle = (open) => {
        sidebar.classList.toggle("open", open);
        document.body.classList.toggle("menu-open", mobile.matches && open);
        backdrop?.classList.toggle("show", open);
        menuBtn?.setAttribute("aria-expanded", String(open));
        sidebar.inert = mobile.matches && !open;   // เมนูที่ซ่อนอยู่บนมือถือไม่ให้กด Tab เข้าไปได้
    };
    menuBtn?.addEventListener("click", () => toggle(!sidebar.classList.contains("open")));
    backdrop?.addEventListener("click", () => toggle(false));
    document.addEventListener("keydown", (e) => { if (e.key === "Escape" && sidebar.classList.contains("open")) { toggle(false); menuBtn?.focus(); } });
    mobile.addEventListener("change", () => toggle(false));
    toggle(false);
    menuBtn?.addEventListener("click", () => { if (sidebar.classList.contains("open")) sidebar.querySelector(".nav-item")?.focus(); });
    document.addEventListener("keydown", e => {
        if (!mobile.matches || !sidebar.classList.contains("open")) return;
        if (e.key === "Escape") { toggle(false); menuBtn?.focus(); }
        if (e.key === "Tab") {
            const nodes = [...sidebar.querySelectorAll("button,a[href]")].filter(n => !n.disabled);
            if (e.shiftKey && document.activeElement === nodes[0]) { e.preventDefault(); nodes.at(-1)?.focus(); }
            else if (!e.shiftKey && document.activeElement === nodes.at(-1)) { e.preventDefault(); nodes[0]?.focus(); }
        }
    });

    const show = (id, push = true) => {
        if (!document.getElementById(id)) return;
        $$(".nav-item[data-tab]").forEach(n => {
            const on = n.dataset.tab === id;
            n.classList.toggle("active", on);
            on ? n.setAttribute("aria-current", "page") : n.removeAttribute("aria-current");
        });
        $$(".content-section").forEach(s => s.classList.toggle("active", s.id === id));
        if (push && location.hash !== "#" + id) history.pushState(null, "", "#" + id);
        toggle(false);
        window.scrollTo(0, 0);
        const heading = document.getElementById(id).querySelector("h1,h2");
        if (push && heading) { heading.tabIndex = -1; heading.focus({ preventScroll: true }); }
        onTabChange?.(id);
    };
    $$(".nav-item[data-tab]").forEach(n => n.addEventListener("click", () => show(n.dataset.tab)));
    $("#logoutBtn")?.addEventListener("click", logout);

    const initialTab = document.querySelector(".content-section.active")?.id;
    const fromHash = () => {
        const id = location.hash.slice(1) || initialTab;
        if (id && document.getElementById(id)?.classList.contains("content-section")) show(id, false);
    };
    fromHash();
    addEventListener("hashchange", fromHash);
    // เบราว์เซอร์จะเลื่อนไปที่ #แท็บ เอง ทำให้หัวข้อถูกแถบด้านบนบัง -> กลับไปบนสุด
    if (location.hash) addEventListener("load", () => scrollTo(0, 0), { once: true });
    return show;
}

// ---------- ตัวนับบนเมนู ----------
export function setCount(el, n) {
    if (!el) return;
    el.textContent = n;
    el.hidden = !(n > 0);
}

// ---------- ดาวน์โหลด CSV (มี BOM ให้ Excel อ่านภาษาไทยได้) ----------
export function downloadCSV(filename, rows) {
    const cell = (v) => {
        let s = String(v ?? "");
        if (typeof v === "string" && (/^\s*[=+\-@]/.test(s) || /^[\t\r\n]/.test(s))) s = "'" + s;   // กัน CSV/formula injection รวมช่องว่างนำหน้า
        return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const csv = "\uFEFF" + rows.map(r => r.map(cell).join(",")).join("\r\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = Object.assign(document.createElement("a"), { href: url, download: filename });
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ---------- แสดง/ซ่อนรหัสผ่าน ----------
export function initPasswordToggles() {
    $$(".pw-toggle").forEach(btn => btn.addEventListener("click", () => {
        const input = btn.parentElement.querySelector("input");
        const show = input.type === "password";
        input.type = show ? "text" : "password";
        btn.innerHTML = `<i class="fas ${show ? "fa-eye-slash" : "fa-eye"}"></i>`;
        btn.setAttribute("aria-pressed", String(show));
        btn.setAttribute("aria-label", show ? "ซ่อนรหัสผ่าน" : "แสดงรหัสผ่าน");
    }));
}

// ---------- ข้อความแจ้งจาก query string (?msg=...) ----------
export function flashFromQuery() {
    const msg = new URLSearchParams(location.search).get("msg");
    const map = {
        "profile-incomplete": ["สร้างบัญชีแล้ว แต่บันทึกข้อมูลยังไม่ครบ กรุณาเข้าสู่ระบบด้วยอีเมลเดิม ยืนยันอีเมล แล้วตั้งค่าชื่อและบทบาทให้เสร็จ", "warn"],
        "verify-send-failed": ["สร้างบัญชีแล้ว แต่ยังส่งอีเมลยืนยันไม่สำเร็จ กรุณาเข้าสู่ระบบเพื่อส่งอีเมลยืนยันอีกครั้ง", "warn"],
        idle: ["ออกจากระบบเพราะไม่ได้ใช้งานเกิน 30 นาที กรุณาเข้าสู่ระบบใหม่", "warn"],
        registered: ["สมัครบัญชีสำเร็จ! กรุณากดลิงก์ยืนยันในอีเมลก่อนเข้าสู่ระบบ", "success"],
        verify: ["กรุณายืนยันอีเมลก่อนเข้าสู่ระบบ", "warn"],
        noprofile: ["ไม่พบข้อมูลผู้ใช้ในระบบ กรุณาติดต่อผู้ดูแล", "error"]
    };
    if (map[msg]) {
        const el = document.createElement("div");
        el.className = "notice " + (map[msg][1] === "success" ? "notice-ok" : "notice-warn");
        el.setAttribute("role", "status"); el.textContent = map[msg][0];
        $("#loginForm")?.before(el);
    }
    if (msg) history.replaceState(null, "", location.pathname);
}

window.__schoolModulesReady = true;
document.dispatchEvent(new Event("school-modules-ready"));

export async function showDecisionHistory(id) {
    try {
        const events=(await get(ref(db, `decisions/${id}`))).val()||{};
        const entries=Object.values(events).sort((a,b)=>a.at-b.at);
        const message=entries.length ? entries.map((e,i)=>`${i+1}. ${thaiDateTime(e.at)} — ${STATUS[e.status]?.label||e.status}\n${e.note||'ไม่มีหมายเหตุ'}`).join('\n\n') : 'ไม่มีประวัติการเปลี่ยนผลในระบบใหม่';
        await dialog({title:'ประวัติการพิจารณา',message,confirmText:'ปิด',cancelText:'กลับ'});
    } catch(err) {toast(authErrorText(err),'error');}
}

// .info is local SDK metadata: listen once instead of issuing a server get().
export function serverNowMillis() {
    return new Promise((resolve, reject) => {
        onValue(ref(db, '.info/serverTimeOffset'), snap => {
            resolve(Date.now() + Number(snap.val() || 0));
        }, reject, { onlyOnce: true });
    });
}

// Server rules enforce these limits as well; local checks provide concise feedback.
export async function requestConnection(uid, other, profile, otherName) {
    const [quotaSnap, cooldownSnap, now] = await Promise.all([
        get(ref(db, `connectionLimits/${uid}`)), get(ref(db, `connectionCooldowns/${uid}/${other}`)),
        serverNowMillis()
    ]);
    const quota=quotaSnap.val(), day=now-now%86400000;
    if(quota && now<quota.at+60000) throw new Error('รอ 1 นาทีก่อนส่งคำขอใหม่');
    if(cooldownSnap.exists() && now<cooldownSnap.val()+86400000) throw new Error('ส่งคำขอถึงคนเดิมได้อีกครั้งในวันถัดไป');
    const count=quota?.day===day ? quota.count+1 : 1;
    if(count>20) throw new Error('ส่งคำขอครบ 20 ครั้งวันนี้แล้ว');
    await update(ref(db), {
        [`friends/${uid}/${other}`]:{status:'requested',[profile.role==='student'?'teacherName':'studentName']:otherName},
        [`friends/${other}/${uid}`]:{status:'pending',[profile.role==='student'?'studentName':'teacherName']:profile.fullname},
        [`connectionLimits/${uid}`]:{at:serverTimestamp(),day,count,target:other},
        [`connectionCooldowns/${uid}/${other}`]:serverTimestamp()
    });
    notifyEvent("friend-request", other);
}

function startAccountRefresh(user) {
    let checking=false;
    const check=async()=>{
        if(checking || !auth.currentUser || document.hidden)return;
        checking=true;
        try { await user.reload(); await user.getIdToken(true); }
        catch(err) { if(['auth/user-disabled','auth/user-token-expired','auth/invalid-user-token','auth/user-not-found'].includes(err.code)) {
            await signOut(auth); location.replace('index.html');
        }} finally {checking=false;}
    };
    setInterval(check,60000); document.addEventListener('visibilitychange',check);
}

export async function blockConnection(uid, other) {
    const answer=await dialog({title:'บล็อกผู้ใช้นี้?',confirmText:'บล็อก',danger:true});
    if(!answer.ok)return;
    await update(ref(db),{[`blocks/${uid}/${other}`]:true,[`friends/${uid}/${other}`]:null,[`friends/${other}/${uid}`]:null});
    toast('บล็อกแล้ว','success');
}
function initBlockedUsers(uid) {
    const form=document.getElementById('searchForm');if(!form)return;
    const box=document.createElement('details');box.hidden=true;
    const title=document.createElement('summary');title.textContent='ผู้ใช้ที่บล็อก';
    const list=document.createElement('div');box.append(title,list);form.after(box);
    onValue(ref(db,`blocks/${uid}`),async snap=>{
        const ids=Object.keys(snap.val()||{});box.hidden=!ids.length;list.replaceChildren();
        for(const id of ids){
            const row=document.createElement('div');row.className='item';
            const name=document.createElement('span');name.textContent=id;
            const button=document.createElement('button');button.type='button';button.className='btn btn-ghost btn-sm';button.textContent='เลิกบล็อก';
            button.addEventListener('click',async()=>{button.disabled=true;try{await update(ref(db),{[`blocks/${uid}/${id}`]:null});}catch(err){toast(authErrorText(err),'error');button.disabled=false;}});
            row.append(name,button);list.append(row);
            try{const profile=(await get(ref(db,`directory/${id}`))).val();if(profile?.fullname)name.textContent=profile.fullname;}catch{}
        }
    },onListenError);
}
