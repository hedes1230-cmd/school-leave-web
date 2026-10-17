import {initProfileSettings} from './profile-settings.js';
import {initNotifications, notifyEvent} from './notifications.js';
import { prepareEvidenceImage } from './evidence-image.js';
import { watchLeaves } from './leave-feed.js';
import { identitySuffix } from './name-suggestions.js';

    import { auth, db, ref, get, set, update, push, serverTimestamp, onValue, query, orderByChild, equalTo } from "./firebase.js";
    import { $, $$, esc, toast, dialog, openImage, setBusy, thaiDateRange, thaiDateTime, countDays, parseLeaveDay, nextWeekdayYMD,
             STATUS, statusBadge, leaveDays, avatar, authErrorText, requireRole, initLayout, setCount, createUserLookup, searchPeople, onListenError, normalizeLeaves, showDecisionHistory, requestConnection, blockConnection, serverNowMillis } from "./common.js";

    let preparingImage = false;
    let imageGeneration = 0;
    let me = null, profile = null;
    let friends = {};        // friends/{me}
    let leaves = {};         // ใบลาของฉัน
    let historyFilter = "all";
    let leaveType = "ลาป่วย";
    let selectedFile = null;
    let submitting = false;
    let reviewing = false;
    let historyLimit = 20;
    const people = createUserLookup(() => {renderTeachers();renderTeacherSelect();});

    const showTab = initLayout();
    ({ user: me, profile } = await requireRole("student"));
    initNotifications(me.uid);
    initProfileSettings(profile,()=>{document.getElementById('userNameDisplay').textContent=profile.fullname;document.getElementById('profileAvatar').innerHTML=avatar(profile.fullname);document.getElementById('userEmailDisplay').textContent=profile.grade||'';});

    $("#userNameDisplay").textContent = profile.fullname || "ไม่ระบุชื่อ";
    $("#userEmailDisplay").textContent = profile.grade || "";
    $("#profileAvatar").innerHTML = avatar(profile.fullname);

    const teacherName = (tid) => people.name(tid) || friends[tid]?.teacherName || friends[tid]?.studentName || "ครู";
    const teacherLabel = tid => `${teacherName(tid)} · รหัส ${identitySuffix(tid, Object.keys(friends).map(uid => ({uid})))}`;

    // ================== ครู / การเชื่อมต่อ ==================
    onValue(ref(db, `friends/${me.uid}`), (snap) => {
        friends = snap.val() || {};
        renderTeachers();
        renderTeacherSelect();
        renderHistory();
    }, onListenError);

    function renderTeachers() {
        let teacherHtml = "", requestHtml = "", reqCount = 0;
        const entries = Object.entries(friends).sort((a, b) => teacherName(a[0]).localeCompare(teacherName(b[0]), "th"));
        for (const [tid, f] of entries) {
            const name = esc(teacherName(tid)), id = esc(tid);
            if (f.status === "connected") {
                teacherHtml += `
                    <div class="item">
                        ${avatar(teacherName(tid))}
                        <div class="item-body">
                            <div class="item-title">${name}</div><small class="person-identity">รหัส ${esc(identitySuffix(tid, Object.keys(friends).map(uid => ({uid}))))}</small>
                            <div class="item-sub">${esc(people.details(tid))}</div>
                            <span class="badge badge-approved"><i class="fas fa-link"></i> เชื่อมต่อแล้ว</span>
                        </div>
                        <div class="item-actions">
                            <button class="btn btn-soft-green btn-sm" data-action="write" data-id="${id}"><i class="fas fa-pen"></i> เขียนใบลา</button>
                            <button class="icon-btn danger" data-action="remove" data-id="${id}" title="ยกเลิกการเชื่อมต่อ"><i class="fas fa-user-minus"></i></button>
                        </div>
                    </div>`;
            } else if (f.status === "requested") {
                teacherHtml += `
                    <div class="item dim">
                        ${avatar(teacherName(tid))}
                        <div class="item-body">
                            <div class="item-title">${name}</div><small class="person-identity">รหัส ${esc(identitySuffix(tid, Object.keys(friends).map(uid => ({uid}))))}</small>
                            <div class="item-sub">${esc(people.details(tid))}</div>
                            <span class="badge badge-pending"><i class="fas fa-hourglass-half"></i> รอครูยืนยัน</span>
                        </div>
                        <div class="item-actions">
                            <button class="icon-btn danger" data-action="remove" data-id="${id}" title="ยกเลิกคำขอ"><i class="fas fa-xmark"></i></button>
                        </div>
                    </div>`;
            } else if (f.status === "pending") {
                reqCount++;
                requestHtml += `
                    <div class="item highlight">
                        ${avatar(teacherName(tid))}
                        <div class="item-body">
                            <div class="item-title">${name}</div><small class="person-identity">รหัส ${esc(identitySuffix(tid, Object.keys(friends).map(uid => ({uid}))))}</small>
                            <div class="item-sub">${esc(people.details(tid))}${people.details(tid) ? " · " : ""}ต้องการเชื่อมต่อกับคุณ</div>
                        </div>
                        <div class="item-actions">
                            <button class="btn btn-success btn-sm" data-action="accept" data-id="${id}"><i class="fas fa-check"></i> ยอมรับ</button>
                            <button class="btn btn-ghost btn-sm" data-action="remove" data-id="${id}"><i class="fas fa-xmark"></i> ปฏิเสธ</button>
                            <button class="btn btn-ghost btn-sm" data-action="block" data-id="${id}">บล็อก</button>
                        </div>
                    </div>`;
            }
        }
        $("#teacherList").innerHTML = teacherHtml ||
            `<div class="empty"><i class="fas fa-chalkboard-user"></i>ยังไม่มีรายชื่อครู ค้นหาด้านบนเพื่อเพิ่ม</div>`;
        $("#requestList").innerHTML = requestHtml;
        $("#requestSection").hidden = reqCount === 0;
        setCount($("#reqCount"), reqCount);
        setCount($("#topCount"), reqCount);
        people.ensure(Object.fromEntries(Object.entries(friends).map(([k, f]) => [k, f.status])));
    }

    function renderTeacherSelect() {
        const select = $("#targetTeacher");
        const prev = select.value;
        const connected = Object.keys(friends).filter(tid => friends[tid].status === "connected");
        select.innerHTML = `<option value="" disabled ${connected.includes(prev) ? "" : "selected"}>เลือกครู...</option>` +
            connected.map(tid => `<option value="${esc(tid)}" ${tid === prev ? "selected" : ""}>${esc(teacherLabel(tid))}</option>`).join("");
        if (connected.length === 1 && !select.value) select.value = connected[0];
        $("#noTeacherNotice").hidden = connected.length > 0;
        $("#startGuide").hidden = connected.length > 0;
        document.dispatchEvent(new Event("leave-summary-update"));
        if (!submitting) $("#saveBtn").disabled = connected.length === 0;
    }

    async function handleFriendAction(action, tid) {
        try {
            if (action === "block") { await blockConnection(me.uid, tid); return; }
            if (action === "accept") {
                await update(ref(db), {
                    [`friends/${me.uid}/${tid}/status`]: "connected",
                    [`friends/${tid}/${me.uid}/status`]: "connected"
                });
                notifyEvent("friend-accepted", tid);
                toast(`เชื่อมต่อกับ ${teacherName(tid)} แล้ว`, "success");
                return true;
            } else if (action === "remove") {
                const st = friends[tid]?.status;
                const title = st === "pending" ? "ปฏิเสธคำขอนี้?" : st === "requested" ? "ยกเลิกคำขอนี้?" : `ยกเลิกการเชื่อมต่อกับ ${teacherName(tid)}?`;
                const res = await dialog({ title, confirmText: "ยืนยัน", danger: true,
                    message: st === "connected" ? "ใบลาเดิมจะยังอยู่ แต่จะส่งใบลาใหม่ถึงครูท่านนี้ไม่ได้" : "" });
                if (!res.ok) return;
                await update(ref(db), { [`friends/${me.uid}/${tid}`]: null, [`friends/${tid}/${me.uid}`]: null });
                toast("ดำเนินการเรียบร้อย", "success");
            } else if (action === "write") {
                $("#targetTeacher").value = tid;
                showTab("leave-form-tab");
            }
        } catch (err) {
            console.error(err);
            toast(/[ก-๙]/.test(err.message || "") ? err.message : authErrorText(err), "error");
        }
    }
    $("#teacherList").addEventListener("click", onListClick);
    $("#requestList").addEventListener("click", onListClick);
    function onListClick(e) {
        const b = e.target.closest("[data-action]");
        if (b) handleFriendAction(b.dataset.action, b.dataset.id);
    }

    // ---------- ค้นหาครู ----------
    $("#searchForm").addEventListener("submit", async (e) => {
        e.preventDefault();
        const q = $("#searchInput").value.trim();
        const box = $("#searchResults");
        if (q.length < 2) { box.innerHTML = `<small class="hint error">กรอกชื่อเต็มหรือรหัส</small>`; return; }
        const btn = $("#searchBtn");
        setBusy(btn, true, "ค้นหา...");
        try {
            const found = await searchPeople(q, "teacher", me.uid);
            box.innerHTML = found.length ? found.map(({ uid: tid, ...u }) => {
                const st = friends[tid]?.status;
                const action = st === "connected" ? `<span class="badge badge-approved">เชื่อมต่อแล้ว</span>`
                    : st === "requested" ? `<span class="badge badge-pending">ส่งคำขอแล้ว</span>`
                    : st === "pending" ? `<button class="btn btn-success btn-sm" data-action="accept" data-id="${esc(tid)}"><i class="fas fa-check"></i> ยอมรับคำขอ</button>`
                    : `<button class="btn btn-primary btn-sm" data-action="add" data-id="${esc(tid)}" data-name="${esc(u.fullname)}"><i class="fas fa-user-plus"></i> เพิ่ม</button>`;
                return `
                    <div class="item">
                        ${avatar(u.fullname)}
                        <div class="item-body">
                            <div class="item-title">${esc(u.fullname)}</div>
                            <div class="item-sub">${esc(u.contact)}</div><small class="person-identity" title="${esc(tid)}" >รหัส ${esc(tid)}</small>
                        </div>
                        <div class="item-actions">${action}</div>
                    </div>`;
            }).join("") : `<div class="empty"><i class="fas fa-user-slash"></i>ไม่พบครูที่ตรงกับ “${esc(q)}”<br><small>ตรวจชื่อเต็มหรือใช้รหัสเชื่อมต่อ</small></div>`;
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
        } else if (b.dataset.action === "add") {
            const tid = b.dataset.id, tName = b.dataset.name;
            if (friends[tid]) {   // สถานะเปลี่ยนไปแล้วระหว่างนั้น (เช่นครูส่งคำขอมาก่อน)
                toast("มีคำขอเชื่อมต่อกับครูท่านนี้อยู่แล้ว ดูในรายชื่อด้านล่าง", "info");
                return;
            }
            setBusy(b, true, "");
            try {
                await requestConnection(me.uid, tid, profile, tName);
                toast("ส่งคำขอเชื่อมต่อแล้ว รอครูยืนยัน", "success");
                b.outerHTML = `<span class="badge badge-pending">ส่งคำขอแล้ว</span>`;
                return;
            } catch (err) {
                console.error(err);
                toast(/[ก-๙]/.test(err.message || "") ? err.message : authErrorText(err), "error");
            }
            setBusy(b, false);
        }
    });

    // ================== ฟอร์มใบลา ==================
    const startEl = $("#startDate"), endEl = $("#endDate"), reasonEl = $("#reason");
    startEl.value = nextWeekdayYMD();   // ถ้าเปิดวันเสาร์-อาทิตย์ จะตั้งเป็นวันจันทร์ถัดไป
    endEl.value = startEl.value;
    endEl.min = startEl.value;

    $("#typeChips").addEventListener("click", (e) => {
        const c = e.target.closest(".chip");
        if (!c) return;
        leaveType = c.dataset.type;
        $$("#typeChips .chip").forEach(x => { x.classList.toggle("active", x === c); x.setAttribute("aria-pressed", String(x === c)); });
    });

    function updateDays() {
        const info = $("#daysInfo");
        if (!startEl.value || !endEl.value) { info.hidden = true; return; }
        const d = countDays(startEl.value, endEl.value);
        info.hidden = false;
        info.classList.toggle("error", d === 0);
        info.innerHTML = endEl.value < startEl.value ? `<i class="fas fa-circle-exclamation"></i> วันสิ้นสุดต้องไม่ก่อนวันเริ่มลา`
            : d ? `<i class="fas fa-calendar-day"></i> รวม ${d} วันทำการ <small>(ไม่นับเสาร์-อาทิตย์)</small>`
            : `<i class="fas fa-circle-exclamation"></i> ช่วงที่เลือกเป็นวันเสาร์-อาทิตย์ทั้งหมด`;
    }
    startEl.addEventListener("change", () => {
        endEl.min = startEl.value;
        if (endEl.value && endEl.value < startEl.value) endEl.value = startEl.value;
        updateDays();
    });
    endEl.addEventListener("change", updateDays);
    updateDays();
    reasonEl.addEventListener("input", () => $("#reasonCount").textContent = reasonEl.value.length);

    $$("[data-goto]").forEach(b => b.addEventListener("click", () => showTab(b.dataset.goto)));

    // ---------- รูปหลักฐาน ----------
    const fileInput = $("#evidencePhoto"), dropArea = $("#dropArea");

    async function setFile(file) {
        if (!file || submitting || reviewing) return;
        if (preparingImage) return toast("กำลังเตรียมรูป กรุณารอสักครู่", "info");
        clearFile();
        const generation = imageGeneration;
        preparingImage = true;
        fileInput.disabled = true;
        $("#imageStatus").textContent = "กำลังเตรียมรูป…";
        try {
            const result = await prepareEvidenceImage(file);
            if (generation !== imageGeneration) return;
            selectedFile = { name: file.name, image: result.image };
            $("#previewImg").src = result.image;
            $("#previewInfo").textContent = file.name;
            $("#previewBox").hidden = false;
            dropArea.hidden = true;
            $("#imageStatus").textContent = "รูปพร้อมส่ง";
        } catch (error) {
            if (generation === imageGeneration) {
                $("#imageStatus").textContent = error.message || "เปิดรูปไม่ได้";
                toast(error.message || "เปิดรูปไม่ได้", "warn");
            }
        } finally { preparingImage = false; fileInput.disabled = false; }
    }
    function clearFile() {
        imageGeneration++;
        selectedFile = null;
        fileInput.value = "";
        $("#previewImg").removeAttribute("src");
        $("#previewBox").hidden = true;
        dropArea.hidden = false;
        $("#imageStatus").textContent = "";
    }
    fileInput.addEventListener("change", () => setFile(fileInput.files[0]));
    $("#removeImg").addEventListener("click", clearFile);
    ["dragenter", "dragover"].forEach(ev => dropArea.addEventListener(ev, e => { e.preventDefault(); dropArea.classList.add("dragover"); }));
    ["dragleave", "dragend"].forEach(ev => dropArea.addEventListener(ev, () => dropArea.classList.remove("dragover")));
    dropArea.addEventListener("drop", e => {
        e.preventDefault(); dropArea.classList.remove("dragover");
        setFile(e.dataTransfer?.files?.[0]);
    });

    // ---------- ส่งใบลา ----------
    $("#leaveForm").addEventListener("submit", async (e) => {
        e.preventDefault();
        if (submitting || reviewing) return;
        if (preparingImage) return toast("กำลังเตรียมรูป กรุณารอสักครู่", "info");
        const tid = $("#targetTeacher").value;
        const start = startEl.value, end = endEl.value;
        const reason = reasonEl.value.trim();
        const days = countDays(start, end);

        if (!tid || friends[tid]?.status !== "connected") return toast("กรุณาเลือกครู", "warn");
        if (!start || !end) return toast("กรุณาเลือกวันที่ลา", "warn");
        if (end < start) return toast("วันสิ้นสุดต้องไม่ก่อนวันเริ่มลา", "warn");
        const startDay = parseLeaveDay(start);
        const endDay = parseLeaveDay(end);
        if (!Number.isFinite(startDay) || !Number.isFinite(endDay)) return toast("กรุณาเลือกวันที่ที่มีอยู่จริงในปฏิทิน", "warn");
        const todayDay = Math.floor(Date.now()/86400000);
        if(startDay < todayDay-365 || startDay > todayDay+365) return toast("เลือกวันเริ่มภายในหนึ่งปีก่อนหรือหลังวันนี้", "warn");
        if (!days) return toast("ช่วงที่เลือกเป็นวันเสาร์-อาทิตย์ทั้งหมด ไม่ต้องลา", "warn");
        if (endDay-startDay>365) return toast("กรุณาเลือกช่วงวันลาไม่เกิน 366 วันปฏิทิน", "warn");
        if (reason.length < 3) { reasonEl.focus(); return toast("กรุณาระบุเหตุผลการลา", "warn"); }

        // เตือนถ้าช่วงวันที่ซ้อนกับใบลาเดิมที่ยังไม่ถูกปฏิเสธ
        const overlap = Object.values(leaves).find(l => l.status !== "rejected" && l.date <= end && (l.endDate || l.date) >= start);
        if (overlap) {
            reviewing = true;
            const r = await dialog({ title: "มีใบลาช่วงวันที่ซ้อนกันอยู่แล้ว",
                message: `${overlap.type} ${thaiDateRange(overlap.date, overlap.endDate)} (${STATUS[overlap.status]?.label || overlap.status})\nต้องการส่งใบลาใหม่ต่อหรือไม่?`,
                confirmText: "ส่งต่อ" });
            reviewing = false;
            if (!r.ok) return;
        }
        reviewing = true;
        let review;
        try {
            review = await dialog({ title: "ตรวจสอบใบลาก่อนส่ง", confirmText: "ยืนยันและส่งใบลา", cancelText: "กลับไปแก้ไข",
                message: `ส่งถึง ${teacherLabel(tid)}\n${leaveType} · ${thaiDateRange(start, end)}\nรวม ${days} วันทำการ (ไม่นับเสาร์–อาทิตย์)\nเหตุผล: ${reason}\nหลักฐาน: ${selectedFile ? selectedFile.name : "ไม่ได้แนบ"}${days > 14 ? "\nช่วงวันลามากกว่า 14 วัน กรุณาตรวจสอบอีกครั้ง" : ""}` });
        } finally { reviewing = false; }
        if (!review?.ok) return;

        const btn = $("#saveBtn");
        submitting = true;
        let leaveRef = null;
        try {
            let image = "";
            if (selectedFile) {
                setBusy(btn, true, "กำลังเตรียมรูป...");
                image = selectedFile.image;
            }
            setBusy(btn, true, "กำลังส่งใบลา...");
            leaveRef = push(ref(db, "leaves"));   // สร้าง key ก่อน เพื่อผูกรูปกับใบลา
            const quota=(await get(ref(db, `submissionLimits/${me.uid}`))).val();
            const serverNow=await serverNowMillis();
            const day=serverNow-serverNow%86400000;
            if(quota && serverNow<quota.at+60000) throw new Error('กรุณารออย่างน้อย 1 นาทีระหว่างการส่งใบลา');
            const count=quota?.day===day ? quota.count+1 : 1;
            if(count>5) throw new Error('ส่งใบลาได้สูงสุด 5 ใบต่อวัน กรุณาลองใหม่วันถัดไป');
            const updates={
                [`leaves/${leaveRef.key}`]: {
                    schemaVersion:2, studentId:me.uid, studentName:profile.fullname,
                    teacherId:tid, teacherName:teacherName(tid), type:leaveType,
                    startDay,endDay,reason,hasEvidence:!!image,status:'pending',revision:0,timestamp:serverTimestamp()
                },
                [`submissionLimits/${me.uid}`]:{at:serverTimestamp(),day,count,lastLeaveId:leaveRef.key}
            };
            if(image)updates[`evidence/${leaveRef.key}`]={image};
            await update(ref(db),updates);
            notifyEvent("leave", leaveRef.key);
            toast(`ส่งใบลาถึง ${teacherName(tid)} เรียบร้อยแล้ว`, "success");
            reasonEl.value = ""; $("#reasonCount").textContent = "0";
            startEl.value = endEl.value = nextWeekdayYMD(); endEl.min = startEl.value; updateDays();
            clearFile();
            showTab("history-tab");
        } catch (err) {
            console.error(err);
            toast(/[ก-๙]/.test(err.message || "") ? err.message : authErrorText(err), "error", 5000);
        } finally {
            submitting = false;
            setBusy(btn, false);
            renderTeacherSelect();
        }
    });

    // ================== ประวัติการลา ==================
    watchLeaves("studentId", me.uid, (snap) => {
        leaves = normalizeLeaves(snap.val());
        notifyDecisions();
        renderHistory();
    }, onListenError);

    // แจ้งเตือนเมื่อครูพิจารณาใบลา (จำไว้ในเครื่องว่าแจ้งไปแล้ว)
    function notifyDecisions() {
        const key = `leaveSeen_${me.uid}`;
        let seen = {};
        try { seen = JSON.parse(localStorage.getItem(key) || "{}"); } catch {}
        const fresh = Object.entries(leaves).filter(([id, l]) => l.status !== "pending" && seen[id] !== l.status);
        if (fresh.length > 3) {
            toast(`ใบลาของคุณได้รับการพิจารณาแล้ว ${fresh.length} รายการ`, "info", 6000);
        } else {
            fresh.forEach(([, l]) => toast(`ใบ${l.type} ${thaiDateRange(l.date, l.endDate)} ${l.status === "approved" ? "ได้รับการอนุมัติแล้ว" : "ไม่ได้รับการอนุมัติ"}`,
                l.status === "approved" ? "success" : "error", 7000));
        }
        const next = { ...seen };
        Object.entries(leaves).forEach(([id, l]) => { if (l.status !== "pending") next[id] = l.status; });
        try { localStorage.setItem(key, JSON.stringify(next)); } catch {}
    }

    $("#statusChips").addEventListener("click", (e) => {
        const c = e.target.closest(".chip");
        if (!c) return;
        historyFilter = c.dataset.status;
        historyLimit = 20;
        $$("#statusChips .chip").forEach(x => { x.classList.toggle("active", x === c); x.setAttribute("aria-pressed", String(x === c)); });
        renderHistory();
    });

    function renderHistory() {
        const all = Object.entries(leaves).sort((a, b) => String(b[1].timestamp).localeCompare(String(a[1].timestamp)));
        const sum = { sick: 0, personal: 0, pending: 0, rejected: 0 };
        all.forEach(([, l]) => {
            if (l.status === "approved") l.type === "ลาป่วย" ? sum.sick += leaveDays(l) : sum.personal += leaveDays(l);
            else if (l.status === "pending") sum.pending++;
            else if (l.status === "rejected") sum.rejected++;
        });
        $("#statsBox").innerHTML = `
            <div class="stat"><div class="stat-label"><i class="fas fa-kit-medical" style="color:var(--red)"></i> ลาป่วย (อนุมัติ)</div><div class="stat-value">${sum.sick}<small>วัน</small></div></div>
            <div class="stat"><div class="stat-label"><i class="fas fa-briefcase" style="color:var(--primary)"></i> ลากิจ (อนุมัติ)</div><div class="stat-value">${sum.personal}<small>วัน</small></div></div>
            <div class="stat"><div class="stat-label"><i class="fas fa-hourglass-half" style="color:var(--amber)"></i> รออนุมัติ</div><div class="stat-value">${sum.pending}<small>ใบ</small></div></div>
            <div class="stat"><div class="stat-label"><i class="fas fa-circle-xmark" style="color:var(--red)"></i> ไม่อนุมัติ</div><div class="stat-value">${sum.rejected}<small>ใบ</small></div></div>`;
        setCount($("#pendingCount"), sum.pending);

        const list = all.filter(([, l]) => historyFilter === "all" || l.status === historyFilter);
        $("#historyList").innerHTML = list.length ? list.slice(0, historyLimit).map(([id, l]) => `
            <article class="leave-card is-${esc(l.status)}">
                <div class="leave-head">
                    <div class="leave-title">${esc(l.type)} ${statusBadge(l.status)}</div>
                    ${l.status === "pending" ? `<button class="btn btn-ghost btn-sm" data-cancel="${esc(id)}"><i class="fas fa-ban"></i> ยกเลิกใบลา</button>` : ""}
                </div>
                <div class="leave-meta">
                    <span><i class="fas fa-calendar"></i> <b>${thaiDateRange(l.date, l.endDate)}</b> (${leaveDays(l) ? leaveDays(l) + " วัน" : "ตรงกับเสาร์-อาทิตย์"})</span>
                    <span><i class="fas fa-chalkboard-user"></i> ถึง ${esc(l.teacherName || teacherName(l.teacherId))}</span>
                </div>
                <div class="leave-reason"><span class="muted">เหตุผล:</span> ${esc(l.reason || "-")}</div>
                ${l.hasEvidence ? `<button class="btn btn-ghost btn-sm evidence-btn" data-evidence="${esc(id)}"><i class="fas fa-paperclip"></i> ดูรูปหลักฐาน</button>` : ""}
                ${/^data:image\/jpeg;base64,/.test(l.evidencePhoto || "") ? `<button class="thumb-btn" data-img="${esc(l.evidencePhoto)}" aria-label="ดูรูปหลักฐานขนาดใหญ่"><img class="thumb" src="${esc(l.evidencePhoto)}" alt="หลักฐาน" loading="lazy"></button>` : ""}
                ${l.evidencePhoto && !/^data:image\/jpeg;base64,/.test(l.evidencePhoto) ? `<p class="hint">หลักฐานเก่าไม่สามารถเปิดอย่างปลอดภัยได้ กรุณาติดต่อผู้ส่ง</p>` : ""}
                ${l.revision ? `<button class="btn btn-ghost btn-sm" data-audit="${esc(id)}">ประวัติการพิจารณา</button>` : ""}\n                ${l.teacherNote ? `<div class="teacher-note"><i class="fas fa-comment-dots"></i><b>หมายเหตุจากครู:</b> ${esc(l.teacherNote)}</div>` : ""}
                <div class="leave-foot">
                    <span class="leave-time"><i class="fas fa-paper-plane"></i> ส่งเมื่อ ${thaiDateTime(l.timestamp)}</span>
                    ${l.decidedAt ? `<span class="leave-time"><i class="fas fa-gavel"></i> พิจารณาเมื่อ ${thaiDateTime(l.decidedAt)}</span>` : ""}
                </div>
            </article>`).join("") + (list.length > historyLimit ? `<button class="btn btn-ghost btn-block" id="moreHistory">แสดงเพิ่ม (เหลือ ${list.length - historyLimit} ใบ)</button>` : "")
            : `<div class="empty"><i class="fas fa-folder-open"></i>${historyFilter === "all" ? "ยังไม่เคยส่งใบลา" : "ไม่มีใบลาในสถานะนี้"}</div>`;
    }

    $("#historyList").addEventListener("click", e => { if (e.target.closest("#moreHistory")) { historyLimit += 20; renderHistory(); } });

    async function showEvidence(btn) {
        setBusy(btn, true, "กำลังโหลด...");
        try {
            const image = (await get(ref(db, `evidence/${btn.dataset.evidence}/image`))).val();
            image ? openImage(image) : toast("ไม่พบรูปหลักฐาน", "warn");
        } catch (err) { toast(/[ก-๙]/.test(err.message || "") ? err.message : authErrorText(err), "error"); }
        finally { setBusy(btn, false); }
    }

    $("#historyList").addEventListener("click", async (e) => {
        const img = e.target.closest("[data-img]");
        if (img) return openImage(img.dataset.img);
        const ev = e.target.closest("[data-evidence]");
        if (ev) return showEvidence(ev);
        const c = e.target.closest("[data-cancel]");
        if (!c) return;
        const id = c.dataset.cancel, l = leaves[id];
        if (!l) return;
        const r = await dialog({ title: "ยกเลิกใบลานี้?", message: `${l.type} ${thaiDateRange(l.date, l.endDate)}`, confirmText: "ยกเลิกใบลา", cancelText: "ไม่", danger: true });
        if (!r.ok) return;
        if (leaves[id]?.status !== "pending") return toast("ใบลานี้ถูกครูพิจารณาไปแล้ว ยกเลิกไม่ได้", "warn");
        try {
            await update(ref(db), { [`leaves/${id}`]: null, ...(l.hasEvidence ? { [`evidence/${id}`]: null } : {}) });
            toast("ยกเลิกใบลาแล้ว", "success");
        } catch (err) {
            console.error(err);
            toast(/[ก-๙]/.test(err.message || "") ? err.message : authErrorText(err), "error");
        }
    });

document.addEventListener("click",e=>{const b=e.target.closest("[data-audit]");if(b)showDecisionHistory(b.dataset.audit);});

