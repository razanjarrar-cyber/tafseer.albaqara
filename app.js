// تفسير سورة البقرة — تطبيق ويب تقدّمي
const $ = (s, el = document) => el.querySelector(s);
const ar = n => Number(n).toLocaleString('ar-EG');
const JUZ_NAMES = { 1: 'الجزء الأول', 2: 'الجزء الثاني', 3: 'الجزء الثالث' };
const SPEEDS = [0.75, 1, 1.25, 1.5, 1.75, 2];
const FB_VER = '10.12.2';

let AYAT = [];          // [{n,t,p,j}]
let CLIPS = [];         // [{id,title,from,to,src,speaker,added,duration}]
let current = null;     // clip being played
let fb = null;          // firebase handles when configured

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
  if (window.FIREBASE_CONFIG) {
    try { await initFirebase(); } catch (e) { console.warn('Firebase', e); }
  }
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

/* ---------- firebase (optional) ---------- */
async function initFirebase() {
  const base = `https://www.gstatic.com/firebasejs/${FB_VER}/`;
  const [{ initializeApp }, fsMod, stMod, authMod] = await Promise.all([
    import(base + 'firebase-app.js'), import(base + 'firebase-firestore.js'),
    import(base + 'firebase-storage.js'), import(base + 'firebase-auth.js')]);
  const app = initializeApp(window.FIREBASE_CONFIG);
  fb = { fs: fsMod, st: stMod, au: authMod, db: fsMod.getFirestore(app), storage: stMod.getStorage(app), auth: authMod.getAuth(app) };
  const snap = await fsMod.getDocs(fsMod.collection(fb.db, 'clips'));
  const remote = snap.docs.map(d => ({ id: d.id, ...d.data(), origin: 'firebase' }));
  CLIPS = CLIPS.filter(c => c.origin !== 'firebase').concat(remote);
  render(); openFromHash();
  $('#adminBtn').hidden = false;
  authMod.onAuthStateChanged(fb.auth, renderAuth);
}
function isAdmin(u) { return u && (window.ADMIN_EMAILS || []).includes(u.email); }
function renderAuth(u) {
  const box = $('#authBox'); box.innerHTML = '';
  $('#uploadForm').hidden = !isAdmin(u);
  if (!u) {
    const b = el('button', { class: 'wide' }, 'تسجيل الدخول بحساب Google');
    b.onclick = () => fb.au.signInWithPopup(fb.auth, new fb.au.GoogleAuthProvider());
    box.append(el('p', { class: 'muted' }, 'رفع التسجيلات متاح للمشرفة فقط.'), b);
  } else {
    const out = el('button', { class: 'wide secondary' }, 'تسجيل الخروج'); out.onclick = () => fb.au.signOut(fb.auth);
    box.append(el('p', { class: 'muted' }, isAdmin(u) ? `مسجّلة باسم ${u.email}` : `الحساب ${u.email} لا يملك صلاحية الرفع.`), out);
  }
}
$('#adminBtn').onclick = () => $('#adminSheet').showModal();
$('#uploadForm').onsubmit = async e => {
  e.preventDefault();
  const f = new FormData(e.target), file = f.get('file');
  const from = +f.get('from'), to = +f.get('to');
  if (from > to) { $('#upMsg').textContent = 'رقم "من" يجب أن يكون أصغر من "إلى".'; return; }
  const id = `${String(from).padStart(3, '0')}-${String(to).padStart(3, '0')}-${Date.now().toString(36)}`;
  const ext = (file.name.split('.').pop() || 'm4a').toLowerCase();
  const ref = fb.st.ref(fb.storage, `audio/${id}.${ext}`);
  const prog = $('#upProg'); prog.hidden = false; $('#upMsg').textContent = 'جاري الرفع…';
  const task = fb.st.uploadBytesResumable(ref, file, { contentType: file.type || 'audio/mp4' });
  task.on('state_changed', s => prog.value = s.bytesTransferred / s.totalBytes * 100);
  try {
    await task;
    const src = await fb.st.getDownloadURL(ref);
    const duration = await new Promise(r => { const a = new Audio(); a.preload = 'metadata'; a.src = URL.createObjectURL(file); a.onloadedmetadata = () => r(Math.round(a.duration)); a.onerror = () => r(null); });
    const doc = { from, to, src, title: f.get('title') || '', speaker: f.get('speaker') || '', duration, added: new Date().toISOString() };
    await fb.fs.setDoc(fb.fs.doc(fb.db, 'clips', id), doc);
    CLIPS.push({ id, ...doc, origin: 'firebase' }); render();
    $('#upMsg').textContent = 'تم الرفع ✓'; e.target.reset(); prog.hidden = true;
  } catch (err) { $('#upMsg').textContent = 'فشل الرفع: ' + err.message; }
};

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

if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js');
const tab = store.get('tab', 'tree'); document.querySelector(`.tabs [data-tab="${tab}"]`)?.click();
loadData().then(openFromHash);
