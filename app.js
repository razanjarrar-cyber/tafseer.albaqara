// تفسير سورة البقرة — تطبيق ويب تقدّمي
const $ = (s, el = document) => el.querySelector(s);
const ar = n => Number(n).toLocaleString('ar-EG');
const JUZ_NAMES = { 1: 'الجزء الأول', 2: 'الجزء الثاني', 3: 'الجزء الثالث' };
const SPEEDS = [0.75, 1, 1.25, 1.5, 1.75, 2];

let AYAT = [];          // [{n,t,p,j}]
let CLIPS = [];         // [{id,title,from,to,src,speaker,added,duration}]
let current = null;     // clip being played

const audio = $('#audio');
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
};

/* ---------- data ---------- */
async function loadData() {
  AYAT = await (await fetch('data/ayat.json')).json();
  let local = [];
  try { local = await (await fetch('data/clips.json', { cache: 'no-cache' })).json(); } catch {}
  CLIPS = local.map(c => ({ ...c, origin: 'repo' }));
  render();
}

function sortClips() {
  CLIPS.sort((a, b) => a.from - b.from || a.to - b.to || String(a.added || '').localeCompare(String(b.added || '')));
}
const clipsFor = n => CLIPS.filter(c => c.from <= n && n <= c.to);
const rangeText = c => c.from === c.to ? `الآية ${ar(c.from)}` : `الآيات ${ar(c.from)}–${ar(c.to)}`;
const pagesFor = c => [...new Set(AYAT.filter(a => a.n >= c.from && a.n <= c.to).map(a => a.p))];
const clipTitle = c => c.title || `تفسير ${rangeText(c)}`;
const fmt = s => { if (!isFinite(s)) return '0:00'; s = Math.floor(s); const m = Math.floor(s / 60), x = s % 60; return `${m}:${String(x).padStart(2, '0')}`; };

/* ---------- render ---------- */
function render() {
  sortClips();
  const covered = new Set(); CLIPS.forEach(c => { for (let i = c.from; i <= c.to; i++) covered.add(i); });
  $('#stats').textContent = `${ar(CLIPS.length)} تسجيل · ${ar(covered.size)} من ${ar(286)} آية مغطاة`;
  renderTree(); renderList();
}

function renderTree() {
  const open = new Set([...document.querySelectorAll('#tree details[open]')].map(d => d.dataset.key));
  const root = $('#tree'); root.innerHTML = '';
  for (const j of [1, 2, 3]) {
    const ayat = AYAT.filter(a => a.j === j);
    const jClips = CLIPS.filter(c => c.to >= ayat[0].n && c.from <= ayat.at(-1).n);
    const jd = el('details', { class: 'juz', 'data-key': 'j' + j });
    if (open.has('j' + j) || (!open.size && j === 1)) jd.open = true;
    jd.append(summary(JUZ_NAMES[j], `الآيات ${ar(ayat[0].n)}–${ar(ayat.at(-1).n)}`, jClips.length));
    const pages = [...new Set(ayat.map(a => a.p))];
    for (const p of pages) {
      const pa = ayat.filter(a => a.p === p);
      const pClips = CLIPS.filter(c => c.to >= pa[0].n && c.from <= pa.at(-1).n);
      const pd = el('details', { 'data-key': 'p' + p });
      if (open.has('p' + p)) pd.open = true;
      pd.append(summary(`صفحة ${ar(p)}`, `الآيات ${ar(pa[0].n)}–${ar(pa.at(-1).n)}`, pClips.length));
      // build ayat lazily on first open
      pd.addEventListener('toggle', () => { if (pd.open && !pd.dataset.built) buildAyat(pd, pa); });
      if (pd.open) buildAyat(pd, pa);
      jd.append(pd);
    }
    root.append(jd);
  }
}
function buildAyat(pd, pa) {
  pd.dataset.built = 1;
  for (const a of pa) {
    const n = clipsFor(a.n).length;
    const row = el('div', { class: 'ayah' + (n ? ' has' : ''), role: 'button', tabindex: 0 });
    row.append(el('span', { class: 'num' }, ar(a.n)), el('span', { class: 't' }, a.t),
      el('span', { class: 'badge' + (n ? '' : ' empty') }, n ? `${ar(n)} 🎧` : '—'));
    row.onclick = () => openAyah(a);
    pd.append(row);
  }
}
function summary(title, sub, count) {
  const s = el('summary');
  const m = el('span', { class: 'sum-main' }, title); m.append(el('span', { class: 'sum-sub' }, sub));
  s.append(m, el('span', { class: 'badge' + (count ? '' : ' empty') }, count ? `${ar(count)} تسجيل` : 'لا يوجد بعد'));
  return s;
}

function renderList() {
  const root = $('#list'); root.innerHTML = '';
  if (!CLIPS.length) { root.append(el('p', { class: 'empty-note' }, 'لا توجد تسجيلات بعد.')); return; }
  let lastJ = 0;
  for (const c of CLIPS) {
    const j = AYAT[c.from - 1].j;
    if (j !== lastJ) { root.append(el('h3', { class: 'group-h' }, JUZ_NAMES[j])); lastJ = j; }
    root.append(clipCard(c));
  }
}
function clipCard(c) {
  const b = el('button', { class: 'clip' + (current && current.id === c.id ? ' current' : '') });
  const info = el('span', { class: 'info' });
  info.append(el('strong', {}, clipTitle(c)),
    el('span', { class: 'muted' }, [rangeText(c), `صفحة ${pagesFor(c).map(ar).join('، ')}`, c.speaker, c.duration ? fmt(c.duration) : ''].filter(Boolean).join(' · ')));
  b.append(el('span', { class: 'play-ic' }, '▶'), info);
  b.onclick = () => { closeDialogs(); play(c, true); };
  return b;
}

function openAyah(a) {
  $('#ayahSheetTitle').textContent = `الآية ${ar(a.n)} · صفحة ${ar(a.p)}`;
  $('#ayahSheetText').textContent = a.t;
  const box = $('#ayahSheetClips'); box.innerHTML = '';
  const cs = clipsFor(a.n);
  if (!cs.length) box.append(el('p', { class: 'empty-note' }, 'لا يوجد تسجيل لهذه الآية بعد.'));
  cs.forEach(c => box.append(clipCard(c)));
  $('#ayahSheet').showModal();
}

/* ---------- player ---------- */
function play(c, expand) {
  if (!current || current.id !== c.id) {
    current = c;
    audio.src = c.src;
    audio.playbackRate = store.get('speed', 1);
    const pos = store.get('pos:' + c.id, 0);
    audio.addEventListener('loadedmetadata', () => { if (pos && pos < audio.duration - 5) audio.currentTime = pos; }, { once: true });
    $('#pTitle').textContent = $('#mTitle').textContent = clipTitle(c);
    $('#pRange').textContent = $('#mRange').textContent = rangeText(c);
    buildPages(c);
    setMediaSession(c);
    history.replaceState(null, '', '#clip=' + encodeURIComponent(c.id));
    renderList();
  }
  audio.play().catch(() => {});
  $('#mini').hidden = false;
  if (expand) showPlayer(true);
}
function buildPages(c) {
  const box = $('#pages'), dots = $('#pageDots'); box.innerHTML = ''; dots.innerHTML = '';
  const ps = pagesFor(c);
  ps.forEach((p, i) => {
    const f = el('figure');
    f.append(el('img', { src: `pages/${String(p).padStart(2, '0')}.webp`, alt: `صفحة ${p} من المصحف`, loading: i ? 'lazy' : 'eager' }),
      el('figcaption', {}, `صفحة ${ar(p)}`));
    box.append(f); dots.append(el('span', { class: i ? '' : 'on' }));
  });
  dots.hidden = ps.length < 2;
  box.scrollLeft = 0;
}
$('#pages').addEventListener('scroll', () => {
  const box = $('#pages'); const i = Math.round(Math.abs(box.scrollLeft) / box.clientWidth);
  [...$('#pageDots').children].forEach((d, k) => d.classList.toggle('on', k === i));
}, { passive: true });

function showPlayer(on) { $('#player').hidden = !on; document.body.style.overflow = on ? 'hidden' : ''; }
$('#playerMin').onclick = () => showPlayer(false);
$('#mini').onclick = e => { if (!e.target.closest('#miniPlay')) showPlayer(true); };
const toggle = () => audio.paused ? audio.play() : audio.pause();
$('#play').onclick = toggle; $('#miniPlay').onclick = toggle;
$('#back').onclick = () => audio.currentTime = Math.max(0, audio.currentTime - 15);
$('#fwd').onclick = () => audio.currentTime = Math.min(audio.duration || 0, audio.currentTime + 15);
$('#speed').onclick = () => {
  const i = (SPEEDS.indexOf(audio.playbackRate) + 1) % SPEEDS.length;
  audio.playbackRate = SPEEDS[i]; store.set('speed', SPEEDS[i]); updateSpeed();
};
const updateSpeed = () => $('#speed').textContent = `${audio.playbackRate}×`;
audio.addEventListener('ratechange', updateSpeed);
$('#next').onclick = () => { const i = CLIPS.findIndex(c => c.id === current?.id); if (CLIPS[i + 1]) play(CLIPS[i + 1]); };
$('#seek').oninput = e => { if (audio.duration) audio.currentTime = e.target.value / 1000 * audio.duration; };
audio.addEventListener('timeupdate', () => {
  const r = audio.duration ? audio.currentTime / audio.duration : 0;
  $('#seek').value = r * 1000; $('#mProg').style.width = r * 100 + '%';
  $('#tCur').textContent = fmt(audio.currentTime); $('#tDur').textContent = fmt(audio.duration);
  if (current && Math.floor(audio.currentTime) % 5 === 0) store.set('pos:' + current.id, audio.currentTime);
});
const playState = () => { const p = audio.paused ? '▶' : '❚❚'; $('#play').textContent = p; $('#miniPlay').textContent = p; };
audio.addEventListener('play', playState); audio.addEventListener('pause', playState);
audio.addEventListener('ended', () => { if (current) store.set('pos:' + current.id, 0); });

function setMediaSession(c) {
  if (!('mediaSession' in navigator)) return;
  navigator.mediaSession.metadata = new MediaMetadata({ title: clipTitle(c), artist: c.speaker || 'تفسير سورة البقرة', album: rangeText(c),
    artwork: [{ src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' }] });
  navigator.mediaSession.setActionHandler('seekbackward', () => $('#back').click());
  navigator.mediaSession.setActionHandler('seekforward', () => $('#fwd').click());
  navigator.mediaSession.setActionHandler('nexttrack', () => $('#next').click());
}

/* ---------- share ---------- */
const clipUrl = c => location.origin + location.pathname + '#clip=' + encodeURIComponent(c.id);
$('#pShare').onclick = () => { $('#shareMsg').textContent = ''; $('#shareSheet').showModal(); };
$('#shareLink').onclick = async () => {
  const c = current, data = { title: clipTitle(c), text: `تفسير سورة البقرة — ${rangeText(c)}`, url: clipUrl(c) };
  if (navigator.share) { try { await navigator.share(data); } catch {} } else { copy(data.url); }
};
$('#copyLink').onclick = () => copy(clipUrl(current));
$('#shareFile').onclick = async () => {
  const c = current; $('#shareMsg').textContent = 'جاري تجهيز الملف…';
  try {
    const blob = await (await fetch(c.src)).blob();
    const ext = (blob.type.split('/')[1] || 'm4a').replace('mpeg', 'mp3').replace('mp4', 'm4a');
    const file = new File([blob], `تفسير البقرة ${c.from}-${c.to}.${ext}`, { type: blob.type || 'audio/mp4' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file], title: clipTitle(c), text: `تفسير سورة البقرة — ${rangeText(c)}` });
      $('#shareMsg').textContent = '';
    } else {
      const a = el('a', { href: URL.createObjectURL(blob), download: file.name }); a.click();
      $('#shareMsg').textContent = 'تم تنزيل الملف، يمكنك إرساله من التنزيلات.';
    }
  } catch (e) { $('#shareMsg').textContent = 'تعذّرت مشاركة الملف.'; }
};
async function copy(t) { try { await navigator.clipboard.writeText(t); $('#shareMsg').textContent = 'تم نسخ الرابط ✓'; } catch { prompt('انسخي الرابط:', t); } }

/* ---------- admin (uploads commit straight to the GitHub repo) ---------- */
const REPO = 'razanjarrar-cyber/tafseer.albaqara', BRANCH = 'main';
const GH = 'https://api.github.com/repos/' + REPO;
let ghToken = '';
const adminToken = () => ghToken;
const isAdmin = () => !!ghToken;
const ADMIN_DOMAIN = '@tafseer-albaqara.app';
const FB = 'https://www.gstatic.com/firebasejs/10.12.2/';
let fbx = null; // lazily loaded Firebase auth + firestore
async function firebase() {
  if (fbx) return fbx;
  const [{ initializeApp }, au, fs] = await Promise.all([import(FB + 'firebase-app.js'), import(FB + 'firebase-auth.js'), import(FB + 'firebase-firestore.js')]);
  const cfg = await (await fetch('/__/firebase/init.json')).json();
  const app = initializeApp(cfg);
  fbx = { au, fs, auth: au.getAuth(app), db: fs.getFirestore(app) };
  return fbx;
}
// The GitHub key lives in Firestore at admin/github; rules let only the admin account read or write it.
async function loadKey() {
  const { fs, db } = await firebase();
  const snap = await fs.getDoc(fs.doc(db, 'admin', 'github'));
  return snap.exists() ? snap.data().token : '';
}
const b64 = buf => { let s = ''; const b = new Uint8Array(buf); for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000)); return btoa(s); };
const utf8b64 = str => b64(new TextEncoder().encode(str));
async function gh(path, opts = {}) {
  const r = await fetch(GH + path, { ...opts, headers: { Authorization: 'Bearer ' + adminToken(), Accept: 'application/vnd.github+json', ...(opts.headers || {}) } });
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).message || r.status);
  return r.json();
}
let updateAdminUI = function () {
  $('#adminBtn').hidden = !isAdmin();
  $('#adminLink').textContent = isAdmin() ? 'تسجيل خروج الأدمن' : 'دخول الأدمن';
}
async function verifyToken(t) {
  const r = await fetch(GH, { headers: { Authorization: 'Bearer ' + t, Accept: 'application/vnd.github+json' } });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.permissions || !j.permissions.push) throw new Error('المفتاح لا يملك صلاحية الكتابة على المستودع');
}
$('#adminLink').onclick = async () => {
  if (isAdmin()) {
    if (confirm('تسجيل الخروج من حساب المشرفة على هذا الجهاز؟')) { const { au, auth } = await firebase(); await au.signOut(auth); ghToken = ''; updateAdminUI(); }
    return;
  }
  $('#loginMsg').textContent = ''; $('#loginForm').hidden = false; $('#keyForm').hidden = true; $('#loginSheet').showModal();
};
$('#loginForm').onsubmit = async e => {
  e.preventDefault();
  const f = new FormData(e.target); let user = f.get('user').trim().toLowerCase();
  if (!user.includes('@')) user += ADMIN_DOMAIN;
  const msg = t => $('#loginMsg').textContent = t;
  msg('جاري الدخول…');
  try {
    const { au, auth } = await firebase();
    await au.signInWithEmailAndPassword(auth, user, f.get('pass'));
    e.target.reset();
    await afterSignIn();
  } catch (err) {
    const c = err.code || '';
    msg(/invalid-credential|wrong-password|user-not-found|invalid-email/.test(c) ? 'اسم المستخدم أو كلمة المرور غير صحيحة.'
      : /too-many-requests/.test(c) ? 'محاولات كثيرة، حاولي بعد قليل.'
      : /permission-denied/.test(c) ? 'هذا الحساب ليس حساب المشرفة.' : 'تعذّر الدخول: ' + (err.message || c));
  }
};
async function afterSignIn() {
  const t = await loadKey();
  if (t) { ghToken = t; updateAdminUI(); $('#loginSheet').close(); return; }
  // first time: ask once for the GitHub key and keep it in Firestore
  $('#loginForm').hidden = true; $('#keyForm').hidden = false; $('#keyMsg').textContent = '';
}
$('#keyForm').onsubmit = async e => {
  e.preventDefault();
  const t = new FormData(e.target).get('token').trim();
  $('#keyMsg').textContent = 'جاري التحقق…';
  try {
    await verifyToken(t);
    const { fs, db } = await firebase();
    await fs.setDoc(fs.doc(db, 'admin', 'github'), { token: t, updated: new Date().toISOString() });
    ghToken = t; updateAdminUI(); e.target.reset(); $('#loginSheet').close();
  } catch (err) { $('#keyMsg').textContent = 'تعذّر الحفظ: ' + (err.message || err.code); }
};
// keep the admin signed in across visits
(async () => {
  try {
    const { au, auth } = await firebase();
    au.onAuthStateChanged(auth, async u => {
      if (u && !ghToken) { try { ghToken = await loadKey(); } catch {} updateAdminUI(); }
    });
  } catch {}
})();
$('#adminBtn').onclick = () => {
  const last = CLIPS.reduce((m, c) => Math.max(m, c.to), 0);
  const f = $('#uploadForm');
  if (!f.from.value && last < 286) { f.from.value = last + 1; }
  $('#upMsg').textContent = ''; $('#adminSheet').showModal();
};
$('#uploadForm').onsubmit = async e => {
  e.preventDefault();
  const form = e.target, f = new FormData(form), file = f.get('file');
  const from = +f.get('from'), to = +f.get('to');
  const msg = t => $('#upMsg').textContent = t;
  if (from > to) return msg('رقم "من" يجب ألا يكون أكبر من "إلى".');
  if (file.size > 95 * 1024 * 1024) return msg('الملف أكبر من 95 ميجا.');
  const btn = form.querySelector('button[type=submit]'); btn.disabled = true;
  try {
    const base = from === to ? `${from}` : `${from}-${to}`;
    let id = base; let n = 2; while (CLIPS.some(c => c.id === id)) id = `${base}_${n++}`;
    const ext = (file.name.split('.').pop() || 'm4a').toLowerCase().replace('mp4', 'm4a');
    const path = `audio/${id}.${ext}`;
    msg('جاري قراءة الملف…');
    const duration = await new Promise(r => { const a = new Audio(); a.preload = 'metadata'; a.src = URL.createObjectURL(file); a.onloadedmetadata = () => r(Math.round(a.duration) || null); a.onerror = () => r(null); });
    msg('جاري رفع الملف الصوتي…');
    await gh('/contents/' + path, { method: 'PUT', body: JSON.stringify({ message: `Add recording ${id} (ayat ${from}-${to})`, content: b64(await file.arrayBuffer()), branch: BRANCH }) });
    msg('جاري تحديث قائمة التسجيلات…');
    const clip = { id, from, to, src: path, title: f.get('title') || '', speaker: f.get('speaker') || '', duration, added: new Date().toISOString().slice(0, 10) };
    for (let attempt = 0; attempt < 3; attempt++) {
      const cur = await gh('/contents/data/clips.json?ref=' + BRANCH, { cache: 'no-store' });
      const list = JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(cur.content.replace(/\n/g, '')), c => c.charCodeAt(0))));
      list.push(clip); list.sort((a, b) => a.from - b.from || a.to - b.to);
      try {
        await gh('/contents/data/clips.json', { method: 'PUT', body: JSON.stringify({ message: `List recording ${id}`, content: utf8b64(JSON.stringify(list, null, 2) + '\n'), sha: cur.sha, branch: BRANCH }) });
        break;
      } catch (err) { if (attempt === 2) throw err; }
    }
    CLIPS.push({ ...clip, src: URL.createObjectURL(file), origin: 'local' }); render();
    form.reset(); msg('تم الرفع ✓ سيظهر للجميع خلال دقيقتين تقريباً.');
  } catch (err) { msg('فشل الرفع: ' + err.message); }
  btn.disabled = false;
};
updateAdminUI();

/* ---------- misc ---------- */
function el(tag, attrs = {}, text) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  if (text != null) e.textContent = text;
  return e;
}
function closeDialogs() { document.querySelectorAll('dialog[open]').forEach(d => d.close()); }
document.addEventListener('click', e => {
  if (e.target.matches('[data-close]')) e.target.closest('dialog').close();
  if (e.target.tagName === 'DIALOG') e.target.close(); // backdrop tap
});
document.querySelectorAll('.tabs button').forEach(b => b.onclick = () => {
  document.querySelectorAll('.tabs button').forEach(x => x.classList.toggle('active', x === b));
  document.querySelectorAll('.view').forEach(v => v.hidden = v.id !== b.dataset.tab);
  store.set('tab', b.dataset.tab);
});
function openFromHash() {
  const m = location.hash.match(/clip=([^&]+)/);
  const c = m && CLIPS.find(x => x.id === decodeURIComponent(m[1]));
  if (c && (!current || current.id !== c.id)) { play(c, true); audio.pause(); }
}
window.addEventListener('hashchange', openFromHash);
window.addEventListener('popstate', () => showPlayer(false));

// welcome screen: guest or admin (skipped for shared clip links and a signed-in admin)
function hideWelcome() { $('#welcome').hidden = true; try { sessionStorage.setItem('entered', '1'); } catch {} }
let entered = false; try { entered = sessionStorage.getItem('entered') === '1'; } catch {}
if (!entered && !/clip=/.test(location.hash)) $('#welcome').hidden = false;
$('#guestBtn').onclick = hideWelcome;
$('#welcomeAdmin').onclick = () => $('#adminLink').click();
const _upd = updateAdminUI; updateAdminUI = () => { _upd(); if (isAdmin()) hideWelcome(); };

if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js');
const tab = store.get('tab', 'tree'); document.querySelector(`.tabs [data-tab="${tab}"]`)?.click();
loadData().then(openFromHash);
