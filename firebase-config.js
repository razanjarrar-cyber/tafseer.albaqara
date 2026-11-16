// إعدادات Firebase — الصقي هنا firebaseConfig من:
// Firebase Console ← Project settings ← General ← Your apps ← Web app
// هذه القيم ليست سرّية (تظهر في أي تطبيق ويب)، والحماية تتم عبر قواعد الأمان في firestore.rules و storage.rules
window.FIREBASE_CONFIG = null;
/* مثال:
window.FIREBASE_CONFIG = {
  apiKey: "...",
  authDomain: "....firebaseapp.com",
  projectId: "...",
  storageBucket: "....firebasestorage.app",
  messagingSenderId: "...",
  appId: "..."
};
*/
// البريد/البُرد المسموح لها برفع التسجيلات من داخل التطبيق
window.ADMIN_EMAILS = [];
