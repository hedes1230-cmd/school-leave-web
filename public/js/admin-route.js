// Navigation hint only; all privileges are checked by /api/admin on the server.
export async function routeAdmin(user){
 if(user?.email!=='seree999@gmail.com' || user.emailVerified!==true)return false;
 const result=await fetch('/api/admin/me',{headers:{Authorization:'Bearer '+await user.getIdToken()},cache:'no-store'});
 if(result.status===403)return false;
 if(!result.ok)throw Error('ตรวจสิทธิ์ผู้ดูแลไม่สำเร็จ กรุณาลองใหม่');
 if((await result.json()).admin){location.replace('/admin');return true;}return false;
}
