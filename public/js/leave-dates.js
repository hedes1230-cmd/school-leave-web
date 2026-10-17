const DAY_MS = 86400000;
export function parseLeaveDay(value) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return NaN;
    const ms = Date.parse(value + 'T00:00:00Z');
    if (!Number.isFinite(ms) || new Date(ms).toISOString().slice(0, 10) !== value) return NaN;
    return ms / DAY_MS;
}

export function countDays(start, end) {
    const a = parseLeaveDay(start), b = parseLeaveDay(end || start);
    if (!Number.isFinite(a) || !Number.isFinite(b) || b < a) return 0;
    // Preserve the legacy display range; new submissions have a separate 366-day limit.
    const total = Math.min(b - a + 1, 3660);
    let count = 0;
    for (let i = 0; i < total; i++) {
        const weekday = new Date((a + i) * DAY_MS).getUTCDay();
        if (weekday !== 0 && weekday !== 6) count++;
    }
    return count;
}
