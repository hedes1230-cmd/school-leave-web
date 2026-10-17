// All input is decoded locally. Only the flattened JPEG is uploaded.
export const MAX_FILE_BYTES = 10 * 1024 * 1024;
const MAX_PIXELS = 40000000;
const MAX_DATAURL = 600000;
const unsupported = 'เปิดรูปนี้ไม่ได้ กรุณาแปลงเป็น JPG, PNG หรือ HEIC ก่อนแนบ';

export async function imageKind(file) {
    const b = new Uint8Array(await file.slice(0, 64).arrayBuffer());
    const text = (a, n) => String.fromCharCode(...b.slice(a, a + n));
    if (b[0] === 255 && b[1] === 216 && b[2] === 255) return 'jpeg';
    if (b[0] === 137 && text(1, 3) === 'PNG' && b[4] === 13 && b[5] === 10 && b[6] === 26 && b[7] === 10) return 'png';
    if (['GIF87a', 'GIF89a'].includes(text(0, 6))) return 'gif';
    if (text(0, 4) === 'RIFF' && text(8, 4) === 'WEBP') return 'webp';
    if (text(0, 2) === 'BM') return 'bmp';
    if (b[0] === 0 && b[1] === 0 && b[2] === 1 && b[3] === 0) return 'ico';
    if (text(4, 4) === 'ftyp') {
        const brands = [];
        for (let i = 8; i + 4 <= b.length; i += 4) if (i !== 12) brands.push(text(i, 4));
        if (brands.some(x => ['avif', 'avis'].includes(x))) return 'avif';
        if (brands.some(x => ['heic', 'heix', 'hevc', 'hevx', 'mif1', 'msf1'].includes(x))) return 'heic';
    }
    // SVG, documents and arbitrary files are not accepted as raster evidence.
    throw new Error(unsupported);
}

async function nativeDecode(file) {
    try { return await createImageBitmap(file, { imageOrientation: 'from-image' }); } catch {}
    const url = URL.createObjectURL(file);
    try {
        return await new Promise((resolve, reject) => {
            const img = new Image();
            const timer = setTimeout(() => { img.src = ''; reject(new Error(unsupported)); }, 20000);
            img.onload = () => { clearTimeout(timer); resolve(img); };
            img.onerror = () => { clearTimeout(timer); reject(new Error(unsupported)); };
            img.src = url;
        });
    } finally { URL.revokeObjectURL(url); }
}

async function heicDecode(file) {
    // Separate same-origin CSP-compatible worker; no eval or blob worker permission.
    const worker = new Worker(new URL('../vendor/heic-worker.js', import.meta.url));
    try {
        const buffer = await file.arrayBuffer();
        const data = await new Promise((resolve, reject) => {
            const timer = setTimeout(() => reject(new Error('แปลงรูปนานเกินไป กรุณาย่อรูปหรือใช้ JPG')), 25000);
            worker.onmessage = e => {
                clearTimeout(timer);
                if (e.data.error || !e.data.imageData) reject(new Error(unsupported));
                else resolve(e.data.imageData);
            };
            worker.onerror = () => { clearTimeout(timer); reject(new Error(unsupported)); };
            worker.postMessage({ id: 'evidence', buffer }, [buffer]);
        });
        return await createImageBitmap(data);
    } finally { worker.terminate(); }
}

export async function prepareEvidenceImage(file) {
    if (!file || !file.size) throw new Error('ไฟล์รูปว่างเปล่า');
    if (file.size > MAX_FILE_BYTES) throw new Error('ไฟล์ใหญ่เกิน 10 MB');
    const kind = await imageKind(file);
    let bmp;
    try { bmp = await nativeDecode(file); }
    catch (error) { if (kind !== 'heic') throw error; bmp = await heicDecode(file); }
    try {
        if (!bmp.width || !bmp.height || bmp.width * bmp.height > MAX_PIXELS)
            throw new Error('รูปมีความละเอียดเกิน 40 ล้านพิกเซล กรุณาย่อรูปก่อนแนบ');
        for (const side of [1600, 1280, 1024, 800]) {
            const scale = Math.min(1, side / Math.max(bmp.width, bmp.height));
            const canvas = document.createElement('canvas');
            canvas.width = Math.max(1, Math.round(bmp.width * scale));
            canvas.height = Math.max(1, Math.round(bmp.height * scale));
            try {
                const ctx = canvas.getContext('2d');
                ctx.fillStyle = '#fff';
                ctx.fillRect(0, 0, canvas.width, canvas.height);
                ctx.drawImage(bmp, 0, 0, canvas.width, canvas.height);
                for (const quality of [0.82, 0.7, 0.58]) {
                    const image = canvas.toDataURL('image/jpeg', quality);
                    if (image.startsWith('data:image/jpeg;base64,') && image.length <= MAX_DATAURL)
                        return { image, kind, width: canvas.width, height: canvas.height };
                }
            } finally { canvas.width = canvas.height = 1; }
        }
        throw new Error('รูปมีรายละเอียดมากเกินไป กรุณาครอปหรือย่อรูป');
    } finally { bmp.close?.(); }
}
