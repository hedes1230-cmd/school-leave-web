from pathlib import Path
import json
root=Path(__file__).resolve().parent
p=root/'public'
worker=(p/'_worker.js').read_text(encoding='utf-8')
module=(root/'src/admin.mjs').read_text(encoding='utf-8').replace('export ','')
if '// BEGIN ADMIN' not in worker:
 worker=worker.replace('var worker_default = {','// BEGIN ADMIN\nconst handleAdmin=(()=>{\n'+module+'\nreturn createAdminHandler({authorize:authorizeFirebaseSession,accessToken:serviceAccessToken});\n})();\n// END ADMIN\nvar worker_default = {')
 worker=worker.replace('if (path === "/api/chat")','if (path.startsWith("/api/admin/")) return handleAdmin(request,env);\n    if (path === "/api/chat")')
else:
 a=worker.index('// BEGIN ADMIN');b=worker.index('// END ADMIN',a)
 worker=worker[:a]+'// BEGIN ADMIN\nconst handleAdmin=(()=>{\n'+module+'\nreturn createAdminHandler({authorize:authorizeFirebaseSession,accessToken:serviceAccessToken});\n})();\n'+worker[b:]
(p/'_worker.js').write_text(worker,encoding='utf-8')
routes=json.loads((p/'_routes.json').read_text());
if '/api/admin/*' not in routes['include']:routes['include'].append('/api/admin/*')
(p/'_routes.json').write_text(json.dumps(routes,indent=2)+'\n')
for file,old,new in [
 ('google-login.js','async function finish(user) {','async function finish(user) {\n  if(await routeAdmin(user))return;'),
 ('index.js','async function goHome(user) {','async function goHome(user) {\n        if(await routeAdmin(user))return true;'),
 ('complete-profile.js','const profile = (await get(ref(db, `users/${user.uid}`))).val();','if(await routeAdmin(user))return;\n    const profile = (await get(ref(db, `users/${user.uid}`))).val();')]:
 f=p/'js'/file;s=f.read_text(encoding='utf-8')
 if "import {routeAdmin}" not in s:
  assert old in s,file
  s="import {routeAdmin} from './admin-route.js';\n"+s.replace(old,new,1)
  f.write_text(s,encoding='utf-8')
privacy=p/'privacy.html';s=privacy.read_text(encoding='utf-8')
if 'สิทธิ์ผู้ดูแลในเว็บ' not in s:
 s=s.replace('</main>','<details><summary>สิทธิ์ผู้ดูแลในเว็บ</summary><p>บัญชี Google ที่เจ้าของโครงการกำหนดเป็นผู้ดูแลสามารถดูรายชื่อผู้ใช้และใบลาทั้งระบบ แก้ชื่อและชั้นเรียน และพิจารณาใบลารออนุมัติผ่าน API ที่ตรวจสิทธิ์บนเซิร์ฟเวอร์ สิทธิ์นี้แยกจากบทบาทครูและไม่ให้ผู้ใช้สมัครเป็นผู้ดูแลเอง ระบบบันทึกรหัสผู้ดำเนินการ ประเภทการเปลี่ยนแปลง รหัสรายการ เวลา และสถานะการบันทึกเพื่อการตรวจสอบ บันทึกนี้ยังไม่มีการลบอัตโนมัติตามระยะเวลา หน้าผู้ดูแลไม่เปิดให้ดูรหัสผ่าน รหัสกู้คืน หรือกุญแจระบบ</p></details></main>')
 privacy.write_text(s,encoding='utf-8')
print('Admin bundle and routes prepared')

