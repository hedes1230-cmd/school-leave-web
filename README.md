# School Leave

เว็บระบบลาเรียนออนไลน์ นักเรียน ครู และผู้ดูแลเว็บ

Production: https://school-leave.pages.dev/

## ผู้ดูแลเว็บ

เข้า https://school-leave.pages.dev/admin ด้วย Google บัญชี seree999@gmail.com
เซิร์ฟเวอร์ตรวจ Firebase ID token, provider Google, email verified, บัญชีปัจจุบันและสถานะเพิกถอนก่อนใช้สิทธิ์
ไม่เปลี่ยนบทบาทนักเรียน/ครูเดิม และไม่ให้สิทธิ์ Cloudflare หรือ Firebase Console

- ดูรายชื่อผู้ใช้เป็นหน้า แก้ชื่อและชั้นเรียน
- ดูใบลาเป็นหน้า พิจารณาเฉพาะรายการที่ยังรออนุมัติ พร้อมตรวจ revision และ Firebase ETag
- เก็บ admin_audit ใน ACCOUNT_DB โดยไม่เก็บเหตุผลลาใน log
- การแก้ข้อมูลต้องเข้าสู่ Google ภายใน 30 นาที
- ไม่รองรับลบบัญชี ลบใบลา รีเซ็ตรหัสผ่าน หรือเพิ่มผู้ดูแลจากหน้าจอ
- ผลการพิจารณาอัปเดตประวัติในเว็บ การส่ง Push จากหน้าผู้ดูแลยังไม่ได้เพิ่ม
- หากบันทึกประวัติประกอบไม่ครบ ระบบแสดงคำเตือนและเก็บสถานะ saved_history_pending ใน audit

## โครงสร้าง

public/ คือชุด Cloudflare Pages รวม bundled Worker
src/admin.mjs คือส่วนผู้ดูแลที่แก้และทดสอบแยก
build-admin.py อัปเดต bundle และเส้นทางโดยไม่ใช้กุญแจระบบ
tests/admin.test.mjs ทดสอบสิทธิ์ validation และ request guards

รันทดสอบ: node --test tests/admin.test.mjs
สร้าง bundle: python build-admin.py

## เผยแพร่

ใช้ Cloudflare Pages project school-leave เดิม และ bindings/secrets เดิม:
ACCOUNT_DB, PUSH_DB, AI, Firebase service account, password/recovery peppers, Turnstile และ KDF settings
ไม่เก็บค่า Secret ใน repository ให้ตั้งผ่าน Cloudflare เท่านั้น
อัปโหลดเฉพาะเนื้อหา public/ หลังทดสอบและตรวจ diff

Firebase web config และ reCAPTCHA site key ใน frontend เป็น public configuration ไม่ใช่ server secrets
ไฟล์สำรองข้อมูล กุญแจ Firebase token และรหัสกู้คืนไม่รวมอยู่ใน repository นี้
