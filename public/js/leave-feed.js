import { db, ref, query, orderByChild, equalTo, limitToLast, onValue } from './firebase.js';

// Preserve the existing owner-scoped rules. Start with a bounded window;
// searches, full reports and exports explicitly expand to the complete feed.
export function watchLeaves(field, uid, receive, onError, beforeExpand = () => {}) {
    const base = query(ref(db, 'leaves'), orderByChild(field), equalTo(uid));
    const notice = document.createElement('div');
    notice.className = 'notice notice-warn';
    notice.setAttribute('role', 'status');
    const text = document.createElement('span');
    const button = document.createElement('button');
    button.type = 'button'; button.className = 'btn btn-ghost btn-sm';
    button.textContent = 'โหลดทั้งหมด';
    notice.append(text, button);
    document.querySelector('main.main, main')?.prepend(notice);
    let complete = false, ready = false, pending = null, stopFull = null;
    let stopLimited = () => {};
    text.textContent = 'กำลังโหลดใบลา…'; button.hidden = true;
    const render = () => {
        notice.hidden = complete;
        text.textContent = pending ? 'กำลังโหลดใบลาทั้งหมด…' : 'แสดงใบลาและยอดรวมเฉพาะ 100 รายการที่โหลด ';
        button.hidden = complete || !ready;
        button.disabled = !!pending;
    };
    stopLimited = onValue(query(base, limitToLast(100)), snap => {
        if (stopFull) return;
        ready = true;
        complete = Object.keys(snap.val() || {}).length < 100;
        render(); receive(snap, { complete });
    }, err => { text.textContent = 'โหลดใบลาไม่สำเร็จ กรุณาโหลดหน้าใหม่'; onError(err); });

    function all() {
        if (complete) return Promise.resolve();
        if (pending) return pending;
        pending = new Promise((resolve, reject) => {
            let first = true;
            stopFull = onValue(base, snap => {
                if (first) { beforeExpand(); stopLimited(); }
                complete = true; ready = true; pending = null;
                render(); receive(snap, { complete });
                if (first) { first = false; resolve(); }
            }, err => {
                stopFull?.(); stopFull = null; pending = null;
                render(); onError(err); reject(err);
            });
        });
        render(); return pending;
    }
    button.addEventListener('click', () => all().catch(() => {}));
    // Report/export actions must never run on an incomplete set.
    const fullAction = '#exportHistory,#exportSummary,[data-tab="summary-tab"],[data-tab="pending-tab"],[data-view],[data-action="history"],#moreHistory,[data-more]';
    document.addEventListener('click', async event => {
        const target = event.target.closest(fullAction);
        if (!target || complete) return;
        event.preventDefault(); event.stopImmediatePropagation();
        try {
            const moreKind = target.dataset.more;
            const targetId = target.id;
            await all();
            const next = target.isConnected ? target : targetId ? document.getElementById(targetId) : moreKind ? document.querySelector(`[data-more="${moreKind}"]`) : null;
            next?.click();
        } catch {}
    }, true);
    for (const name of ['input', 'change']) document.addEventListener(name, event => {
        if (event.target.matches('#pendingSearch,#historySearch,#summarySearch,#statusFilter,#typeFilter,#monthFilter')) all().catch(() => {});
    }, true);
    document.querySelector('#statusChips')?.addEventListener('click', () => all().catch(() => {}), true);
    // The teacher inbox needs every pending request, including old ones.
    if (field === 'teacherId' && !location.hash.includes('history') && !location.hash.includes('students')) all().catch(() => {});
    if (location.hash === '#summary-tab') all().catch(() => {});
    window.addEventListener("hashchange", () => {
        if (field === "teacherId" && ["", "#pending-tab", "#summary-tab"].includes(location.hash)) all().catch(() => {});
    });
    return { all, isComplete: () => complete };
}
