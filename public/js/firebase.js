// ===== Firebase: ตั้งค่าและเริ่มต้นใช้งานที่เดียว ใช้ร่วมกันทุกหน้า =====
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js";
import { getAuth, setPersistence, browserSessionPersistence } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js";
import { initializeAppCheck, ReCaptchaEnterpriseProvider } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-app-check.js";
import { getDatabase } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-database.js";

export {
    onAuthStateChanged, signInWithCustomToken, linkWithPopup, reauthenticateWithPopup, signInWithEmailAndPassword, createUserWithEmailAndPassword,
    sendEmailVerification, sendPasswordResetEmail, signOut, deleteUser, GoogleAuthProvider, signInWithPopup, signInWithRedirect, getRedirectResult
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js";

export {
    ref, get, set, push, update, remove, onValue, query, orderByChild, equalTo, limitToFirst, limitToLast, runTransaction, serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-database.js";

const firebaseConfig = {
    apiKey: "AIzaSyCxUfn3rPA93zlmrtXi2vlOcyT3CQJoQ40",
    authDomain: window.location.hostname,
    databaseURL: "https://school-leave-system-a3e15-default-rtdb.asia-southeast1.firebasedatabase.app/",
    projectId: "school-leave-system-a3e15",
    storageBucket: "school-leave-system-a3e15.firebasestorage.app",
    messagingSenderId: "737642230093",
    appId: "1:737642230093:web:c5379b665832108d5ac704"
};

export const app = initializeApp(firebaseConfig);
// Public, domain-restricted reCAPTCHA site key; no secret key belongs in this file.
export const appCheck = initializeAppCheck(app, {
    provider: new ReCaptchaEnterpriseProvider("6LefMNItAAAAAFIMFL-lhh_vVonKCmOdKse2STn-"),
    isTokenAutoRefreshEnabled: true
});
export const auth = getAuth(app);
await setPersistence(auth, browserSessionPersistence);
auth.languageCode = "th";   // อีเมลยืนยันตัวตน / รีเซ็ตรหัสผ่าน ส่งเป็นภาษาไทย
export const db = getDatabase(app);

