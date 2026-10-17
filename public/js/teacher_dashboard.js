import {initProfileSettings} from './profile-settings.js';
import {initNotifications, notifyEvent} from './notifications.js';
import { watchLeaves } from './leave-feed.js';
import { attachNameSuggestions, uniquePeople, duplicateName, identitySuffix } from './name-suggestions.js';

    import { auth, db, ref, get, update, push, serverTimestamp, onValue, query, orderByChild, equalTo } from "./firebase.js";
    import { serverNowMillis, $, $$, esc, toast, dialog, openImage, setBusy, thaiDate, thaiDateRange, thaiDateTime, STATUS, statusBadge,
             leaveDays, avatar, authErrorText, requireRole, initLayout, setCount, downloadCSV, todayYMD, createUserLookup, searchPeople, onListenError, normalizeLeaves, showDecisionHistory, requestConnection, blockConnection } from "./common.js";

    let me = null, profile = null;
    let friends = {};          // friends/{me}
    let leaves = {};           // ใบลาที่ส่งถึงฉัน
    let knownPending = null;   // ใช้แจ้งเตือนใบลาใหม่
    let pendingPerson = null, summaryPerson = null;
    let studentFilter = null;  // ดูประวัติเฉพาะคน
    const PAGE = 50;           // แสดงทีละ 50 ใบ (ข้อมูลเยอะแล้วมือถือไม่หน่วง)
    let pendingLimit = PAGE, historyLimit = PAGE;
    const moreBtn = (kind, left) => left > 0
        ? `<button class="btn btn-ghost btn-block" data-more="${kind}"><i class="fas fa-chevron-down"></i> แสดงเพิ่ม (เหลืออีก ${left} ใบ)</button>` : "";
    const people = createUserLookup(() => {cachedFriends=null;renderStudents();renderPending();renderHistory();renderSummary();});

    const showTab = initLayout();
    ({ user: me, profile } = await requireRole("teacher"));
    initNotifications(me.uid);
    initProfileSettings(profile,()=>{document.getElementById('userNameDisplay').textContent=profile.fullname;document.getElementById('profileAvatar').innerHTML=avatar(profile.fullname);document.getElementById('userEmailDisplay').textContent=profile.grade||'';});

    $("#userNameDisplay").textContent = profile.fullname || "ไม่ระบุชื่อ";
    $("#userEmailDisplay").textContent = profile.grade || "";
    $("#profileAvatar").innerHTML = avatar(profile.fullname);

    const studentName = (sid, fallback) => people.name(sid) || friends[sid]?.studentName || friends[sid]?.teacherName || fallback || "นักเรียน";
    const sortedLeaves = () => Object.entries(leaves).sort((a, b) => String(b[1].timestamp).localeCompare(String(a[1].timestamp)));

    let cachedFriends, cachedLeaves, cachedPeople;
    function knownPeople() {
        if(cachedFriends===friends && cachedLeaves===leaves)return cachedPeople;
        cachedFriends=friends;cachedLeaves=leaves;
        return cachedPeople=uniquePeople([
            ...Object.values(leaves).map(l=>({uid:l.studentId,name:studentName(l.studentId,l.studentName)})),
            ...Object.keys(friends).map(uid=>({uid,name:studentName(uid)}))
        ]);
    }
    function duplicateIdentity(uid) {
        const all=knownPeople();
        return duplicateName(uid,all) ? `<small class="person-identity" title="${esc(uid)}">ชื่อซ้ำ · รหัส ${esc(identitySuffix(uid,all))}</small>` : '';
    }
    const suggestions = [
        attachNameSuggestions($('#pendingSearch'),()=>uniquePeople(Object.values(leaves).filter(l=>l.status==='pending').map(l=>({uid:l.studentId,name:studentName(l.studentId,l.studentName)}))),p=>{pendingPerson=p.uid;pendingLimit=PAGE;renderPending();},()=>{pendingPerson=null;},knownPeople),
        attachNameSuggestions($('#historySearch'),knownPeople,p=>{studentFilter=p.uid;historyLimit=PAGE;renderHistory();},()=>{studentFilter=null;}),
        attachNameSuggestions($('#summarySearch'),knownPeople,p=>{summaryPerson=p.uid;renderSummary();},()=>{summaryPerson=null;})
    ];

    // ================== ข้อมูลแบบ realtime ==================
    onValue(ref(db, `friends/${me.uid}`), (snap) => {
        friends = snap.val() || {};
        renderStudents();
        renderSummary();
        renderPending();
        renderHistory();
        suggestions.forEach(s=>s.refresh());
    }, onListenError);

    watchLeaves("teacherId", me.uid, (snap) => {
        leaves = normalizeLeaves(snap.val());
        const pendingIds = Object.keys(leaves).filter(id => leaves[id].status === "pending");
        if (knownPending) {
            const fresh = pendingIds.filter(id => !knownPending.has(id));
            if (fresh.length === 1) toast(`มีใบลาใหม่จาก ${leaves[fresh[0]].studentName}`, "info", 6000);
            else if (fresh.length > 1) toast(`มีใบลาใหม่ ${fresh.length} รายการ`, "info", 6000);
        }
        knownPending = new Set(pendingIds);
        renderMonthOptions();
        renderPending();
        renderHistory();
        renderSummary();
        suggestions.forEach(s=>s.refresh());
    }, onListenError, () => { knownPending = null; });

    // ================== การ์ดใบลา ==================
    function leaveCard(id, l) {
        const actions = l.status === "pending"
            ? `<button class="btn btn-soft-green btn-sm" data-decide="approved" data-id="${esc(id)}"><i class="fas fa-check"></i> อนุมัติ</button>
               <button class="btn btn-soft-red btn-sm" data-decide="rejected" data-id="${esc(id)}"><i class="fas fa-xmark"></i> ไม่อนุมัติ</button>`
            : `<button class="btn btn-ghost btn-sm" data-decide="change" data-id="${esc(id)}"><i class="fas fa-rotate"></i> เปลี่ยนผล</button>`;
        return `
            <article class="leave-card is-${esc(l.status)}">
                <div class="leave-head">
                    <div class="leave-title">${esc(studentName(l.studentId, l.studentName))}
                        <span class="badge badge-info">${esc(l.type)}</span> ${statusBadge(l.status)}</div>
                    <div class="item-actions">${actions}</div>
                </div>
                ${duplicateIdentity(l.studentId)}
                <div class="leave-meta">
                    <span><i class="fas fa-calendar"></i> <b>${thaiDateRange(l.date, l.endDate)}</b> (${leaveDays(l) ? leaveDays(l) + " วัน" : "ตรงกับเสาร์-อาทิตย์"})</span>
                </div>
                <div class="leave-reason"><span class="muted">เหตุผล:</span> ${esc(l.reason || "-")}</div>
                ${l.hasEvidence ? `<button class="btn btn-ghost btn-sm evidence-btn" data-evidence="${esc(id)}"><i class="fas fa-paperclip"></i> ดูรูปหลักฐาน</button>` : ""}
                ${/^data:image\/jpeg;base64,/.test(l.evidencePhoto || "") ? `<button class="thumb-btn" data-img="${esc(l.evidencePhoto)}" aria-label="ดูรูปหลักฐานขนาดใหญ่"><img class="thumb" src="${esc(l.evidencePhoto)}" alt="หลักฐาน" loading="lazy"></button>` : ""}
                ${l.evidencePhoto && !/^data:image\/jpeg;base64,/.test(l.evidencePhoto) ? `<p class="hint">หลักฐานเก่าไม่สามารถเปิดอย่างปลอดภัยได้ กรุณาติดต่อผู้ส่ง</p>` : ""}
                ${l.revision ? `<button class="btn btn-ghost btn-sm" data-audit="${esc(id)}">ประวัติการพิจารณา</button>` : ""}\n                ${l.teacherNote ? `<div class="teacher-note"><i class="fas fa-comment-dots"></i><b>หมายเหตุ:</b> ${esc(l.teacherNote)}</div>` : ""}
                <div class="leave-foot">
                    <span class="leave-time"><i class="fas fa-paper-plane"></i> ส่งเมื่อ ${thaiDateTime(l.timestamp)}</span>
                    ${l.decidedAt ? `<span class="leave-time"><i class="fas fa-gavel"></i> พิจารณาเมื่อ ${thaiDateTime(l.decidedAt)}</span>` : ""}
                </div>
            </article>`;
    }

    async function decide(id, action) {
        const l = leaves[id];
        if (!l) return;
        let status = action;
        if (action === "change") status = l.status === "approved" ? "rejected" : "approved";
        const approve = status === "approved";
        const info = `${studentName(l.studentId, l.studentName)} · รหัส ${identitySuffix(l.studentId,knownPeople())} • ${l.type} ${thaiDateRange(l.date, l.endDate)} (${leaveDays(l)} วัน)`;
        const res = await dialog({
            title: action === "change" ? `เปลี่ยนผลเป็น “${STATUS[status].label}”?` : approve ? "อนุมัติใบลานี้?" : "ไม่อนุมัติใบลานี้?",
            message: info,
            confirmText: approve ? "อนุมัติ" : "ไม่อนุมัติ",
            danger: !approve,
            input: { placeholder: approve ? "หมายเหตุถึงนักเรียน (ไม่บังคับ)" : "ระบุเหตุผลที่ไม่อนุมัติ", required: !approve }
        });
        if (!res.ok) return;
        if (!leaves[id]) return toast("นักเรียนยกเลิกใบลานี้ไปแล้ว", "warn");
        try {
            const decisionNow=await serverNowMillis();
            const decisionQuota=(await get(ref(db, `decisionLimits/${me.uid}`))).val();
            if(typeof l.decidedAt==='number' && decisionNow<l.decidedAt+10000) return toast('กรุณารอ 10 วินาทีก่อนแก้ผลใบลาเดิม','warn');
            if(decisionQuota && decisionNow<decisionQuota.at+1000) return toast('กรุณารอสักครู่ก่อนบันทึกผลถัดไป','warn');
            const decisionDay=decisionNow-decisionNow%86400000;
            const decisionCount=decisionQuota?.day===decisionDay ? decisionQuota.count+1 : 1;
            if(decisionCount>2000) return toast('บันทึกผลครบจำนวนที่กำหนดต่อวันแล้ว','warn');
            const revision=(Number(l.revision)||0)+1;
            const note=res.value||'';
            if(status===l.status && note===(l.teacherNote||'')) return toast('ไม่มีการเปลี่ยนแปลง','info');
            if(!approve && note.length<3)return toast('ระบุเหตุผลอย่างน้อย 3 ตัวอักษร','warn');
            await update(ref(db), {
                [`decisionLimits/${me.uid}`]:{at:serverTimestamp(),day:decisionDay,count:decisionCount,leaveId:id,revision},
                [`leaves/${id}/status`]:status,[`leaves/${id}/teacherNote`]:note,
                [`leaves/${id}/decidedAt`]:serverTimestamp(),[`leaves/${id}/revision`]:revision,
                [`decisions/${id}/r${revision}`]:{actor:me.uid,at:serverTimestamp(),previous:l.status,status,note}
            });
            notifyEvent("decision", id);
            toast(approve ? "อนุมัติใบลาแล้ว" : "บันทึกผลไม่อนุมัติแล้ว", "success");
        } catch (err) {
            console.error(err);
            toast(/[ก-๙]/.test(err.message || "") ? err.message : authErrorText(err), "error");
        }
    }

    async function showEvidence(btn) {
        setBusy(btn, true, "กำลังโหลด...");
        try {
            const image = (await get(ref(db, `evidence/${btn.dataset.evidence}/image`))).val();
            image ? openImage(image) : toast("ไม่พบรูปหลักฐาน", "warn");
        } catch (err) { toast(/[ก-๙]/.test(err.message || "") ? err.message : authErrorText(err), "error"); }
        finally { setBusy(btn, false); }
    }

    function onLeaveListClick(e) {
        const img = e.target.closest("[data-img]");
        if (img) return openImage(img.dataset.img);
        const ev = e.target.closest("[data-evidence]");
        if (ev) return showEvidence(ev);
        const more = e.target.closest("[data-more]");
        if (more) {
            if (more.dataset.more === "pending") { pendingLimit += PAGE; renderPending(); }
            else { historyLimit += PAGE; renderHistory(); }
            return;
        }
        const b = e.target.closest("[data-decide]");
        if (b) decide(b.dataset.id, b.dataset.decide);
    }
    $("#pendingList").addEventListener("click", onLeaveListClick);
    $("#historyList").addEventListener("click", onLeaveListClick);

    // ================== รออนุมัติ ==================
    function renderPending() {
        // ใบลาที่รอนาน/ใกล้ถึงก่อน: เรียงจากส่งก่อน -> ส่งหลัง
        const allPending = sortedLeaves().filter(([, l]) => l.status === "pending").reverse();
        const q = $("#pendingSearch").value.trim().toLowerCase();
        const list = allPending.filter(([, l]) => pendingPerson ? l.studentId === pendingPerson : !q || `${studentName(l.studentId, l.studentName)} ${l.reason || ""}`.toLowerCase().includes(q));
        $("#inboxStats").innerHTML = `<div class="stat"><div class="stat-label">รอการพิจารณา</div><div class="stat-value">${allPending.length}<small>ใบ</small></div></div><div class="stat"><div class="stat-label">อนุมัติแล้วทั้งหมด</div><div class="stat-value">${Object.values(leaves).filter(l => l.status === "approved").length}<small>ใบ</small></div></div><div class="stat"><div class="stat-label">นักเรียนที่เชื่อมต่อ</div><div class="stat-value">${Object.values(friends).filter(f => f.status === "connected").length}<small>คน</small></div></div>`;
        $("#pendingList").innerHTML = list.length
            ? list.slice(0, pendingLimit).map(([id, l]) => leaveCard(id, l)).join("") + moreBtn("pending", list.length - pendingLimit)
            : `<div class="empty"><i class="fas fa-mug-hot"></i>${q ? "ไม่พบใบลาที่ตรงกับคำค้น ลองค้นหาชื่อหรือคำอื่น" : "พิจารณาครบแล้ว ไม่มีใบลารออนุมัติ"}</div>`;
        $("#pendingBadge").textContent = allPending.length;
        setCount($("#pendingCount"), allPending.length);
        updateTopCount();
        document.title = (allPending.length ? `(${allPending.length}) ` : "") + "ครู - ระบบลาเรียนออนไลน์";
    }

    $("#pendingSearch").addEventListener("input", () => { pendingLimit = PAGE; renderPending(); });

    function updateTopCount() {
        const pending = Object.values(leaves).filter(l => l.status === "pending").length;
        const req = Object.values(friends).filter(f => f.status === "pending").length;
        setCount($("#topCount"), pending + req);
    }

    // ================== ประวัติ ==================
    ["historySearch", "statusFilter", "typeFilter", "monthFilter"].forEach(id => $("#" + id).addEventListener("input", () => { historyLimit = PAGE; renderHistory(); }));
    $("#clearStudentFilter").addEventListener("click", () => { studentFilter = null; $("#historySearch").value = ""; suggestions[1].close(); historyLimit = PAGE; renderHistory(); });

    // ตัวเลือกเดือน (สร้างจากข้อมูลจริง ใช้ได้ทุกเบราว์เซอร์ แทน input type=month)
    function renderMonthOptions() {
        const sel = $("#monthFilter"), prev = sel.value, months = new Set();
        Object.values(leaves).forEach(l => {
            let [y, m] = String(l.date).split("-").map(Number);
            const [ey, em] = String(l.endDate || l.date).split("-").map(Number);
            for (let i = 0; i < 24 && y && m && (y < ey || (y === ey && m <= em)); i++) {
                months.add(`${y}-${String(m).padStart(2, "0")}`);
                if (++m > 12) { m = 1; y++; }
            }
        });
        const list = [...months].sort().reverse();
        sel.innerHTML = `<option value="">ทุกเดือน</option>` +
            list.map(m => `<option value="${m}" ${m === prev ? "selected" : ""}>${thaiDate(m + "-01").replace(/^1 /, "")}</option>`).join("");
        if (prev && !months.has(prev)) sel.value = "";
    }

    function filteredHistory() {
        const q = $("#historySearch").value.trim().toLowerCase();
        const st = $("#statusFilter").value, ty = $("#typeFilter").value, month = $("#monthFilter").value;
        return sortedLeaves().filter(([, l]) =>
            (!studentFilter || l.studentId === studentFilter) &&
            (st === "all" || l.status === st) &&
            (ty === "all" || l.type === ty) &&
            (!month || (String(l.date) <= month + "-31" && String(l.endDate || l.date) >= month + "-01")) &&   // ช่วงลาคาบเกี่ยวเดือนนั้น
            (studentFilter || !q || studentName(l.studentId, l.studentName).toLowerCase().includes(q) || String(l.reason || "").toLowerCase().includes(q)));
    }

    function renderHistory() {
        const list = filteredHistory();
        $("#studentFilterChip").hidden = !studentFilter;
        if (studentFilter) $("#studentFilterName").textContent = studentName(studentFilter, leaves[Object.keys(leaves).find(k => leaves[k].studentId === studentFilter)]?.studentName) + " · " + identitySuffix(studentFilter, knownPeople());
        $("#historyCount").textContent = `พบ ${list.length} รายการ จากทั้งหมด ${Object.keys(leaves).length} รายการ`;
        $("#historyList").innerHTML = list.length
            ? list.slice(0, historyLimit).map(([id, l]) => leaveCard(id, l)).join("") + moreBtn("history", list.length - historyLimit)
            : `<div class="empty"><i class="fas fa-folder-open"></i>ไม่พบประวัติการลา</div>`;
    }

    function viewHistory(sid) {
        studentFilter = sid;
        historyLimit = PAGE;
        $("#historySearch").value = "";
        $("#statusFilter").value = "all";
        $("#typeFilter").value = "all";
        $("#monthFilter").value = "";
        showTab("history-tab");
        renderHistory();
    }

    const fmtISO = (iso) => {
        const d = new Date(iso);
        if (isNaN(d)) return "";
        const p = (n) => String(n).padStart(2, "0");
        return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
    };

    $("#exportHistory").addEventListener("click", () => {
        const list = filteredHistory();
        if (!list.length) return toast("ไม่มีข้อมูลให้ส่งออก", "warn");
        downloadCSV(`leave-history-${todayYMD()}.csv`, [
            ["รหัสบัญชี", "ชื่อนักเรียน", "ประเภท", "วันที่เริ่ม", "วันที่สิ้นสุด", "จำนวนวัน (ไม่นับเสาร์-อาทิตย์)", "เหตุผล", "สถานะ", "หมายเหตุครู", "ส่งเมื่อ", "พิจารณาเมื่อ", "หลักฐาน"],
            ...list.map(([, l]) => [l.studentId, studentName(l.studentId, l.studentName), l.type, l.date, l.endDate, leaveDays(l), l.reason,
                STATUS[l.status]?.label || l.status, l.teacherNote, fmtISO(l.timestamp), fmtISO(l.decidedAt), l.hasEvidence || l.evidencePhoto ? "มีรูปแนบ (ดูในระบบ)" : ""])
        ]);
    });

    // ================== สรุปรายคน ==================
    $("#summarySearch").addEventListener("input", renderSummary);

    function summaryRows() {
        const rows = {};
        const ensure = (sid, name) => rows[sid] ??= { sid, name: studentName(sid, name), connected: friends[sid]?.status === "connected",
            sickN: 0, sickD: 0, perN: 0, perD: 0, pending: 0, rejected: 0 };
        Object.entries(friends).forEach(([sid, f]) => { if (f.status === "connected") ensure(sid); });
        Object.values(leaves).forEach(l => {
            const r = ensure(l.studentId, l.studentName);
            if (l.status === "approved") {
                if (l.type === "ลาป่วย") { r.sickN++; r.sickD += leaveDays(l); }
                else { r.perN++; r.perD += leaveDays(l); }
            } else if (l.status === "pending") r.pending++;
            else if (l.status === "rejected") r.rejected++;
        });
        return Object.values(rows).sort((a, b) => a.name.localeCompare(b.name, "th"));
    }

    function renderSummary() {
        const rows = summaryRows();
        const all = Object.values(leaves);
        const thisMonth = todayYMD().slice(0, 7);
        const connectedN = Object.values(friends).filter(f => f.status === "connected").length;
        $("#statsBox").innerHTML = `
            <div class="stat"><div class="stat-label"><i class="fas fa-user-graduate" style="color:var(--primary)"></i> นักเรียน</div><div class="stat-value">${connectedN}<small>คน</small></div></div>
            <div class="stat"><div class="stat-label"><i class="fas fa-hourglass-half" style="color:var(--amber)"></i> รออนุมัติ</div><div class="stat-value">${all.filter(l => l.status === "pending").length}<small>ใบ</small></div></div>
            <div class="stat"><div class="stat-label"><i class="fas fa-calendar-check" style="color:var(--green)"></i> ลาเดือนนี้ (อนุมัติ)</div><div class="stat-value">${all.filter(l => l.status === "approved" && String(l.date) <= thisMonth + "-31" && String(l.endDate || l.date) >= thisMonth + "-01").length}<small>ใบ</small></div></div>
            <div class="stat"><div class="stat-label"><i class="fas fa-file-lines" style="color:var(--muted)"></i> ใบลาทั้งหมด</div><div class="stat-value">${all.length}<small>ใบ</small></div></div>`;

        const q = $("#summarySearch").value.trim().toLowerCase();
        const shown = rows.filter(r => summaryPerson ? r.sid === summaryPerson : !q || r.name.toLowerCase().includes(q));
        $("#summaryBody").innerHTML = shown.length ? shown.map(r => `
            <tr>
                <td><div style="display:flex;align-items:center;gap:10px">${avatar(r.name, "sm")}
                    <span><b>${esc(r.name)}</b>${duplicateIdentity(r.sid)}${r.connected ? "" : ` <small class="faint">(${friends[r.sid] ? "รอยืนยันการเชื่อมต่อ" : "ยกเลิกการเชื่อมต่อแล้ว"})</small>`}</span></div></td>
                <td class="num" style="color:var(--red)">${r.sickN} / ${r.sickD}</td>
                <td class="num" style="color:var(--primary)">${r.perN} / ${r.perD}</td>
                <td class="num"><b>${r.sickD + r.perD}</b> วัน</td>
                <td class="num">${r.pending ? `<span class="badge badge-pending">${r.pending}</span>` : "-"}</td>
                <td class="num">${r.rejected || "-"}</td>
                <td><button class="btn btn-ghost btn-sm" data-view="${esc(r.sid)}"><i class="fas fa-eye"></i> ดูประวัติ</button></td>
            </tr>`).join("")
            : `<tr><td colspan="7" style="text-align:center;color:var(--faint);padding:28px">ไม่มีข้อมูลนักเรียน</td></tr>`;
    }
    $("#summaryBody").addEventListener("click", (e) => {
        const b = e.target.closest("[data-view]");
        if (b) viewHistory(b.dataset.view);
    });

    $("#exportSummary").addEventListener("click", () => {
        const rows = summaryRows();
        if (!rows.length) return toast("ไม่มีข้อมูลให้ส่งออก", "warn");
        downloadCSV(`leave-summary-${todayYMD()}.csv`, [
            ["รหัสบัญชี", "ชื่อ-นามสกุล", "ลาป่วย (ครั้ง)", "ลาป่วย (วัน)", "ลากิจ (ครั้ง)", "ลากิจ (วัน)", "รวมวันลา (ไม่นับเสาร์-อาทิตย์)", "รออนุมัติ", "ไม่อนุมัติ"],
            ...rows.map(r => [r.sid, r.name, r.sickN, r.sickD, r.perN, r.perD, r.sickD + r.perD, r.pending, r.rejected])
        ]);
    });

    // ================== นักเรียน / การเชื่อมต่อ ==================
    function renderStudents() {
        let studentHtml = "", requestHtml = "", reqCount = 0, connected = 0;
        const entries = Object.entries(friends).sort((a, b) => studentName(a[0]).localeCompare(studentName(b[0]), "th"));
        for (const [sid, f] of entries) {
            const name = esc(studentName(sid)), id = esc(sid);
            if (f.status === "connected") {
                connected++;
                studentHtml += `
                    <div class="item">
                        ${avatar(studentName(sid))}
                        <div class="item-body">
                            <div class="item-title">${name}</div>${duplicateIdentity(sid)}
                            <div class="item-sub">${esc(people.details(sid))}</div>
                            <span class="badge badge-approved"><i class="fas fa-link"></i> เชื่อมต่อแล้ว</span>
                        </div>
                        <div class="item-actions">
                            <button class="btn btn-ghost btn-sm" data-action="view" data-id="${id}"><i class="fas fa-eye"></i> ประวัติ</button>
                            <button class="icon-btn danger" data-action="remove" data-id="${id}" title="ยกเลิกการเชื่อมต่อ"><i class="fas fa-user-minus"></i></button>
                        </div>
                    </div>`;
            } else if (f.status === "requested") {
                studentHtml += `
                    <div class="item dim">
                        ${avatar(studentName(sid))}
                        <div class="item-body">
                            <div class="item-title">${name}</div>${duplicateIdentity(sid)}
                            <div class="item-sub">${esc(people.details(sid))}</div>
                            <span class="badge badge-pending"><i class="fas fa-hourglass-half"></i> รอนักเรียนยืนยัน</span>
                        </div>
                        <div class="item-actions">
                            <button class="icon-btn danger" data-action="remove" data-id="${id}" title="ยกเลิกคำขอ"><i class="fas fa-xmark"></i></button>
                        </div>
                    </div>`;
            } else if (f.status === "pending") {
                reqCount++;
                requestHtml += `
                    <div class="item highlight">
                        ${avatar(studentName(sid))}
                        <div class="item-body">
                            <div class="item-title">${name}</div>${duplicateIdentity(sid)}
                            <div class="item-sub">${esc(people.details(sid))}${people.details(sid) ? " · " : ""}ต้องการเชื่อมต่อกับคุณ</div>
                        </div>
                        <div class="item-actions">
                            <button class="btn btn-success btn-sm" data-action="accept" data-id="${id}"><i class="fas fa-check"></i> ยอมรับ</button>
                            <button class="btn btn-ghost btn-sm" data-action="remove" data-id="${id}"><i class="fas fa-xmark"></i> ปฏิเสธ</button>
                            <button class="btn btn-ghost btn-sm" data-action="block" data-id="${id}">บล็อก</button>
                        </div>
                    </div>`;
            }
        }
        $("#studentList").innerHTML = studentHtml ||
            `<div class="empty"><i class="fas fa-user-graduate"></i>ยังไม่มีนักเรียน ค้นหาด้านบนเพื่อเพิ่ม</div>`;
        $("#requestList").innerHTML = requestHtml;
        $("#requestSection").hidden = reqCount === 0;
        $("#studentCount").textContent = connected;
        setCount($("#reqCount"), reqCount);
        updateTopCount();
        people.ensure(Object.fromEntries(Object.entries(friends).map(([k, f]) => [k, f.status])));
    }

    async function handleFriendAction(action, sid) {
        try {
            if (action === "block") { await blockConnection(me.uid, sid); return; }
            if (action === "accept") {
                await update(ref(db), {
                    [`friends/${me.uid}/${sid}/status`]: "connected",
                    [`friends/${sid}/${me.uid}/status`]: "connected"
                });
                notifyEvent("friend-accepted", sid);
                toast(`เชื่อมต่อกับ ${studentName(sid)} แล้ว`, "success");
                return true;
            } else if (action === "remove") {
                const st = friends[sid]?.status;
                const title = st === "pending" ? "ปฏิเสธคำขอนี้?" : st === "requested" ? "ยกเลิกคำขอนี้?" : `ยกเลิกการเชื่อมต่อกับ ${studentName(sid)}?`;
                const res = await dialog({ title, confirmText: "ยืนยัน", danger: true,
                    message: st === "connected" ? "ประวัติใบลาเดิมจะยังอยู่ แต่นักเรียนจะส่งใบลาใหม่ถึงคุณไม่ได้" : "" });
                if (!res.ok) return;
                await update(ref(db), { [`friends/${me.uid}/${sid}`]: null, [`friends/${sid}/${me.uid}`]: null });
                toast("ดำเนินการเรียบร้อย", "success");
            } else if (action === "view") {
                viewHistory(sid);
            }
        } catch (err) {
            console.error(err);
            toast(/[ก-๙]/.test(err.message || "") ? err.message : authErrorText(err), "error");
        }
    }
    ["#studentList", "#requestList"].forEach(sel => $(sel).addEventListener("click", (e) => {
        const b = e.target.closest("[data-action]");
        if (b) handleFriendAction(b.dataset.action, b.dataset.id);
    }));

    // ---------- ค้นหานักเรียน ----------
    $("#searchForm").addEventListener("submit", async (e) => {
        e.preventDefault();
        const q = $("#searchInput").value.trim();
        const box = $("#searchResults");
        if (q.length < 2) { box.innerHTML = `<small class="hint error">กรอกชื่อเต็มหรือรหัส</small>`; return; }
        const btn = $("#searchBtn");
        setBusy(btn, true, "ค้นหา...");
        try {
            const found = await searchPeople(q, "student", me.uid);
            box.innerHTML = found.length ? found.map(({ uid: sid, ...u }) => {
                const st = friends[sid]?.status;
                const action = st === "connected" ? `<span class="badge badge-approved">เชื่อมต่อแล้ว</span>`
                    : st === "requested" ? `<span class="badge badge-pending">ส่งคำขอแล้ว</span>`
                    : st === "pending" ? `<button class="btn btn-success btn-sm" data-action="accept" data-id="${esc(sid)}"><i class="fas fa-check"></i> ยอมรับคำขอ</button>`
                    : `<button class="btn btn-primary btn-sm" data-action="add" data-id="${esc(sid)}" data-name="${esc(u.fullname)}"><i class="fas fa-user-plus"></i> เพิ่ม</button>`;
                return `
                    <div class="item">
                        ${avatar(u.fullname)}
                        <div class="item-body">
                            <div class="item-title">${esc(u.fullname)}</div>
                            <div class="item-sub">${esc(u.contact)}</div><small class="person-identity" title="${esc(sid)}" >รหัส ${esc(sid)}</small>
                        </div>
                        <div class="item-actions">${action}</div>
                    </div>`;
            }).join("") : `<div class="empty"><i class="fas fa-user-slash"></i>ไม่พบนักเรียนที่ตรงกับ “${esc(q)}”<br><small>ตรวจชื่อเต็มหรือใช้รหัสเชื่อมต่อ</small></div>`;
        } catch (err) {
            console.error(err);
            box.innerHTML = "";
            toast(/[ก-๙]/.test(err.message || "") ? err.message : authErrorText(err), "error");
        } finally {
            setBusy(btn, false);
        }
    });

    $("#searchResults").addEventListener("click", async (e) => {
        const b = e.target.closest("[data-action]");
        if (!b) return;
        if (b.dataset.action === "accept") {
            if (await handleFriendAction("accept", b.dataset.id)) b.outerHTML = `<span class="badge badge-approved">เชื่อมต่อแล้ว</span>`;
            return;
        }
        if (b.dataset.action !== "add") return;
        const sid = b.dataset.id, sName = b.dataset.name;
        if (friends[sid]) {   // สถานะเปลี่ยนไปแล้วระหว่างนั้น (เช่นนักเรียนส่งคำขอมาก่อน)
            toast("มีคำขอเชื่อมต่อกับนักเรียนคนนี้อยู่แล้ว ดูในรายชื่อด้านล่าง", "info");
            return;
        }
        setBusy(b, true, "");
        try {
            await requestConnection(me.uid, sid, profile, sName);
            toast("ส่งคำขอเชื่อมต่อแล้ว รอนักเรียนยืนยัน", "success");
            b.outerHTML = `<span class="badge badge-pending">ส่งคำขอแล้ว</span>`;
        } catch (err) {
            console.error(err);
            toast(/[ก-๙]/.test(err.message || "") ? err.message : authErrorText(err), "error");
            setBusy(b, false);
        }
    });

document.addEventListener("click",e=>{const b=e.target.closest("[data-audit]");if(b)showDecisionHistory(b.dataset.audit);});
