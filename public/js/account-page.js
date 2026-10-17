import {accountConfig} from './account-config.js';
import {createAccountFlow,accountErrorText} from './account-flow.mjs';
import {auth,db,ref,get,runTransaction,serverTimestamp} from './firebase.js';
import {registerWithUsername,loginWithUsername,recoverWithCode} from './username-auth.js';
import {accountIdentity,createProfile} from './account-identity.mjs';
import {HOME_BY_ROLE,initPasswordToggles} from './common.js';

initPasswordToggles();
const form = document.getElementById('signupForm');
const action = form.dataset.action;
const fieldset = document.getElementById('accountFields');
const submit = document.getElementById('submitBtn');
const google = document.getElementById('googleLoginBtn');
const message = document.getElementById('signupMessage');
let token = '', widget, busy = false, codeAcknowledgement;
function show(text) {message.textContent=text;message.hidden=false;message.focus();}
const enabled = accountConfig.enabled && Boolean(accountConfig.turnstileSiteKey);
fieldset.disabled = !enabled;
if (!enabled) show('ระบบรหัสบัญชียังไม่เปิดใช้งาน ใช้ Google ได้ก่อน');

const flow = createAccountFlow({
  register:input=>registerWithUsername(auth,input),
  login:input=>loginWithUsername(auth,input),
  recover:input=>recoverWithCode(auth,input),
  showRecoveryCodes:async codes=>{
    const panel=document.getElementById('recoveryPanel');
    document.getElementById('recoveryCodes').textContent=codes.join('\n');
    panel.hidden=false; panel.focus(); form.hidden=true; google.disabled=true;
    await new Promise(resolve=>{codeAcknowledgement=resolve;});
    document.getElementById('recoveryCodes').textContent='';
    panel.hidden=true;
  },
  saveProfile:async(fullname,role)=>{
    const identity=await accountIdentity(auth.currentUser);
    if(identity?.kind!=='username') throw new Error('untrusted-identity');
    const result=await runTransaction(ref(db,`users/${auth.currentUser.uid}`), current=>current===null?createProfile(identity,fullname,role,serverTimestamp()):undefined,{applyLocally:false});
    if(!HOME_BY_ROLE[result.snapshot.val()?.role]) throw new Error('profile-missing');
  },
  completeProfile:()=>location.replace('complete-profile.html'),
  goHome:async()=>{
    if(!auth.currentUser) throw new Error('no-session');
    const profile=(await get(ref(db,`users/${auth.currentUser.uid}`))).val();
    if(profile && !HOME_BY_ROLE[profile.role]) throw new Error('invalid-role');
    location.replace(profile?HOME_BY_ROLE[profile.role]:'complete-profile.html');
  }
});
document.getElementById('savedCodes').addEventListener('change',event=>{
  document.getElementById('continueBtn').disabled=!event.target.checked;
});
document.getElementById('continueBtn').addEventListener('click',()=>{
  if(!document.getElementById('savedCodes').checked) return;
  const resolve=codeAcknowledgement; codeAcknowledgement=null; resolve?.();
});
if(enabled) {
  const script=document.createElement('script');
  script.src='https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
  script.async=true;
  script.onload=()=>{
    widget=window.turnstile.render('#accountChallenge',{
      sitekey:accountConfig.turnstileSiteKey,action,theme:'light',appearance:'interaction-only',size:window.matchMedia('(max-width: 359px)').matches?'compact':'flexible',
      callback:value=>{token=value;},
      'expired-callback':()=>{token='';},
      'error-callback':()=>{token='';show('ยืนยันว่าไม่ใช่บอตไม่สำเร็จ กรุณาลองใหม่');}
    });
  };
  script.onerror=()=>show('โหลดการตรวจสอบบอตไม่ได้ กรุณาลองใหม่');
  document.head.append(script);
}
form.addEventListener('submit',async event=>{
  event.preventDefault();
  if(busy) return;
  if(!enabled) return show(accountErrorText({code:'not_configured'}));
  const value=name=>form.elements.namedItem(name)?.value||'';
  const username=value('username').trim().toLowerCase();
  if(!/^[a-z][a-z0-9_]{2,23}$/.test(username)) return show(accountErrorText({code:'invalid_username'}));
  const password=value('password');
  if(!password || (action!=='login' && ([...password].length<12 || [...password].length>128))) return show(accountErrorText({code:'invalid_password'}));
  const fullname=value('fullname').trim().replace(/\s+/g,' ');
  const role=form.querySelector('input[name="role"]:checked')?.value;
  if(action==='register' && (!fullname||fullname.length>120||/[\u0000-\u001f\u007f]/.test(fullname))) return show(accountErrorText({code:'invalid_name'}));
  if(action==='register' && !HOME_BY_ROLE[role]) return show(accountErrorText({code:'invalid_role'}));
  if(action==='recover' && !value('recoveryCode').trim()) return show('กรุณากรอกรหัสกู้คืน');
  if(!token) return show('กรุณายืนยันว่าไม่ใช่บอต');
  if(!navigator.onLine) return show('กรุณาเชื่อมต่ออินเทอร์เน็ต');
  busy=true;fieldset.disabled=true;google.disabled=true;message.hidden=true;
  const originalLabel=submit.textContent;
  submit.textContent='กำลังดำเนินการ…';
  form.setAttribute('aria-busy','true');
  try {
    await flow({register:'register',login:'login',recover:'recover'}[action],{username,password,newPassword:password,fullname,role,recoveryCode:value('recoveryCode'),turnstileToken:token});
  } catch(error) {show(accountErrorText(error));}
  finally {
    token=''; if(widget!==undefined)window.turnstile?.reset(widget);
    form.elements.namedItem('password').value='';
    const recovery=form.elements.namedItem('recoveryCode');if(recovery)recovery.value='';
    busy=false;form.hidden=false;fieldset.disabled=false;google.disabled=false;
    submit.textContent=originalLabel;form.removeAttribute('aria-busy');
  }
});

