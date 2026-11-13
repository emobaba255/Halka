/* Okul — tek sayfa arayüzü (bağımlılıksız) */
const $ = (s, r = document) => r.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const S = { user: null, communities: [], unread: 0, unreadMessages: 0, thread: null, live: null, menu: null, notes: null, feed: { category: '', sort: 'new', q: '' }, calMonth: null, replyTo: null };

async function api(path, method = 'GET', body) {
  const res = await fetch('/api' + path, { method, headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error || 'Bir şeyler ters gitti'), { status: res.status });
  return data;
}
let toastTimer;
function toast(msg) {
  const t = $('#toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), 2600);
}
const go = hash => { if (location.hash === hash) route(); else location.hash = hash; };

// ---------- Simgeler, logo, onay penceresi ----------
const ICONS = {
  camera: '<path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/>',
  rotr: '<path d="M23 4v6h-6"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>',
  rotl: '<path d="M1 4v6h6"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/>',
  link: '<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>',
  edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>',
  award: '<circle cx="12" cy="8" r="7"/><path d="M8.21 13.89 7 23l5-3 5 3-1.21-9.12"/>',
  mail: '<path d="M4 4h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z"/><path d="m22 6-10 7L2 6"/>',
  bell: '<path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/>',
  like: '<path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3z"/><path d="M7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3"/>',
  comment: '<path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/>',
  pin: '<path d="m19 21-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/>',
  users: '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
  user: '<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
  search: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  lock: '<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
  globe: '<circle cx="12" cy="12" r="10"/><path d="M2 12h20"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>',
  settings: '<path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6"/>',
  chart: '<path d="M12 20V10M18 20V4M6 20v-4"/>',
  clip: '<path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/>',
  clock: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
  logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5"/><path d="M21 12H9"/>',
  video: '<path d="m23 7-7 5 7 5V7z"/><rect x="1" y="5" width="15" height="14" rx="2"/>',
  book: '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>',
  card: '<rect x="1" y="4" width="22" height="16" rx="2"/><path d="M1 10h22"/>',
  calendar: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
};
const ic = name => `<svg class="ic" viewBox="0 0 24 24" aria-hidden="true">${ICONS[name] || ''}</svg>`;
// Logo: mezuniyet kepi takmış "O"
const logoMark = (cls = '') => `<svg class="mark ${cls}" viewBox="0 0 48 48" aria-hidden="true"><defs><linearGradient id="lg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#2f74ee"/><stop offset="1" stop-color="#1848b0"/></linearGradient></defs><rect width="48" height="48" rx="12" fill="url(#lg)"/><circle cx="24" cy="29" r="9" fill="none" stroke="#fff" stroke-width="5"/><path d="M24 8.5 41 15.5 24 22.5 7 15.5z" fill="#f2c14e" stroke="#2260d4" stroke-width="2" stroke-linejoin="round"/><path d="M36.5 18v6.5" stroke="#f2c14e" stroke-width="2.4" stroke-linecap="round" fill="none"/></svg>`;
// Tarayıcının ham onay kutuları yerine kendi penceremiz. Onayda true (ya da yazılan metin), vazgeçmede false (ya da null) döner.
function ask({ title, text = '', ok = 'Evet', cancel = 'Vazgeç', danger = false, input = '' }) {
  return new Promise(done => {
    const d = document.createElement('dialog');
    d.className = 'modal';
    d.innerHTML = `<form method="dialog" class="stack"><h3>${esc(title)}</h3>${text ? `<p class="muted">${esc(text)}</p>` : ''}
      ${input ? `<textarea maxlength="300" rows="3" placeholder="${esc(input)}" aria-label="${esc(input)}"></textarea>` : ''}
      <div class="row" style="justify-content:flex-end"><button class="btn" value="no">${esc(cancel)}</button><button class="btn ${danger ? 'dangerfill' : 'primary'}" value="ok" data-ok>${esc(ok)}</button></div></form>`;
    d.addEventListener('close', () => {
      const yes = d.returnValue === 'ok', v = input ? (yes ? d.querySelector('textarea').value.trim() : null) : yes;
      d.remove(); done(v);
    });
    document.body.append(d);
    d.showModal();
  });
}

// ---------- Biçimlendirme ----------
const initials = n => String(n || '?').trim().split(/\s+/).slice(0, 2).map(w => w[0]).join('').toLocaleUpperCase('tr');
const avatar = (name, color, level, cls = '', img = '') => `<span class="av ${cls}" style="--c:${esc(color)}" aria-hidden="true">${img ? `<img src="${esc(img)}" alt="">` : esc(initials(name))}${level ? `<b>${level}</b>` : ''}</span>`;
function ago(ts) {
  const s = (Date.now() - ts) / 1000;
  if (s < 60) return 'az önce';
  if (s < 3600) return `${Math.floor(s / 60)} dk önce`;
  if (s < 86400) return `${Math.floor(s / 3600)} sa önce`;
  if (s < 86400 * 30) return `${Math.floor(s / 86400)} gün önce`;
  return new Date(ts).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short', year: 'numeric' });
}
const fmtDate = (ts, opts) => new Date(ts).toLocaleDateString('tr-TR', opts);
const fmtTime = ts => new Date(ts).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
// Görseli tarayıcıda küçültüp sunucuya yükler; yüklenen dosyanın adresini döndürür
async function upload(file, max = 1600) {
  if (!file || !file.size) return '';
  if (!/^image\/(png|jpeg|webp|gif)$/.test(file.type)) throw new Error('Yalnızca PNG, JPEG, WebP veya GIF yüklenebilir');
  let dataUrl;
  if (file.type === 'image/gif') {
    if (file.size > 3.5e6) throw new Error('GIF en fazla 3,5 MB olabilir');
    dataUrl = await new Promise((ok, no) => { const r = new FileReader(); r.onload = () => ok(r.result); r.onerror = no; r.readAsDataURL(file); });
  } else {
    const bmp = await createImageBitmap(file).catch(() => { throw new Error('Görsel okunamadı'); });
    const k = Math.min(1, max / Math.max(bmp.width, bmp.height));
    const cv = document.createElement('canvas'); cv.width = Math.round(bmp.width * k); cv.height = Math.round(bmp.height * k);
    const ctx = cv.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, cv.width, cv.height); ctx.drawImage(bmp, 0, 0, cv.width, cv.height);
    dataUrl = cv.toDataURL('image/jpeg', 0.85);
  }
  return (await api('/upload', 'POST', { dataUrl })).url;
}
async function uploadFile(file) {
  if (!file || !file.size) return { url: '', name: '' };
  if (file.size > 8 * 1024 * 1024) throw new Error('Dosya en fazla 8 MB olabilir');
  const dataUrl = await new Promise((ok, no) => { const r = new FileReader(); r.onload = () => ok(r.result); r.onerror = () => no(new Error('Dosya okunamadı')); r.readAsDataURL(file); });
  return api('/upload-file', 'POST', { name: file.name, dataUrl });
}
const afterAuth = () => { let h = '#/'; try { h = sessionStorage.getItem('after') || h; sessionStorage.removeItem('after'); } catch { /* depolama kapalıysa ana sayfa */ } return h; };
const rich = s => esc(s).replace(/https?:\/\/[^\s<]+/g, u => `<a href="${u}" target="_blank" rel="noopener noreferrer">${u}</a>`);

// ---------- Üst çubuk ----------
function renderTop() {
  const u = S.user;
  const switcher = u ? `
    <div class="switcher">
      <button class="btn sm" data-act="menu" data-menu="comm" aria-expanded="${S.menu === 'comm'}"><span class="hide-sm">Topluluklarım</span><span class="only-sm">Topluluklar</span><span class="only-xs" aria-label="Topluluklar">${ic('users')}</span> ▾</button>
      ${S.menu === 'comm' ? `<div class="menu left">
        ${S.communities.map(c => `<a href="#/c/${esc(c.slug)}"><span class="cicon" style="--c:${esc(c.color)}">${esc(c.emoji)}</span><span class="grow">${esc(c.name)}</span></a>`).join('') || '<div class="muted small" style="padding:10px">Henüz bir topluluğa katılmadın.</div>'}
        <hr><a href="#/">${ic('search')} Toplulukları keşfet</a></div>` : ''}
    </div>` : '';
  const right = u ? `
    <a class="iconbtn" href="#/m" aria-label="Mesajlar">${ic('mail')}${S.unreadMessages ? `<span class="dot">${S.unreadMessages}</span>` : ''}</a>
    <div class="switcher">
      <button class="iconbtn" data-act="menu" data-menu="notes" aria-label="Bildirimler">${ic('bell')}${S.unread ? `<span class="dot">${S.unread}</span>` : ''}</button>
      ${S.menu === 'notes' ? `<div class="menu right" style="width:320px">${renderNotes()}</div>` : ''}
    </div>
    <div class="switcher">
      <button class="iconbtn" style="border:0;padding:0" data-act="menu" data-menu="user" aria-label="Hesap menüsü">${avatar(u.name, u.color, 0, '', u.avatar)}</button>
      ${S.menu === 'user' ? `<div class="menu right">
        <div style="padding:8px 10px"><b>${esc(u.name)}</b><div class="muted small">${esc(u.email)}</div></div><hr>
        <a href="#/u/${u.id}">${ic('user')} Profilim</a><a href="#/settings">${ic('edit')} Profil ayarları</a><a href="#/m">${ic('mail')} Mesajlar</a><hr><a href="#/teach">${ic('award')} Eğitim ver</a>
        <button class="item" data-act="logout">${ic('logout')} Çıkış yap</button></div>` : ''}
    </div>` : `<a class="btn ghost hide-sm" href="#/teach">Eğitim ver</a><a class="btn ghost" href="#/login">Giriş yap</a><a class="btn primary" href="#/register">Kayıt ol</a>`;
  $('#top').innerHTML = `<div class="wrap row topbar"><a class="logo" href="#/" aria-label="Okul ana sayfa">${logoMark()}<span>Okul</span></a>${switcher}<span class="grow"></span>${right}</div>`;
}
function renderNotes() {
  if (!S.notes) return '<div class="muted small" style="padding:12px">Yükleniyor…</div>';
  if (!S.notes.length) return '<div class="muted small" style="padding:12px">Henüz bildirimin yok.</div>';
  const verb = { like_post: 'gönderini beğendi', like_comment: 'yorumunu beğendi', comment: 'gönderine yorum yaptı', reply: 'yorumuna yanıt verdi', request: 'katılmak istiyor', approved: 'katılma isteğini onayladı', live: 'canlı yayın başlattı' };
  return S.notes.map(n => {
    const href = n.type === 'request' ? `#/c/${esc(n.slug)}/admin/members` : n.type === 'live' ? `#/c/${esc(n.slug)}/live` : n.post_title != null ? `#/c/${esc(n.slug)}/p/${n.post_id}` : `#/c/${esc(n.slug)}`;
    return `<a href="${href}">${avatar(n.actor_name, n.actor_color, 0, 'sm', n.actor_avatar)}
    <span class="grow small"><b>${esc(n.actor_name)}</b> ${verb[n.type] || ''}: <span class="muted">${esc(n.post_title ?? n.community_name)}</span><br><span class="muted">${ago(n.created_at)}</span></span>
    ${n.is_read ? '' : '<span class="tag">yeni</span>'}</a>`;
  }).join('');
}

// ---------- Yönlendirici ----------
async function refreshMe() {
  const me = await api('/me');
  Object.assign(S, { user: me.user, communities: me.communities, unread: me.unread, unreadMessages: me.unreadMessages || 0 });
}
let routeSeq = 0, lastHash = null;
async function route() {
  const seq = ++routeSeq;
  document.body.classList.add('loading');
  const parts = location.hash.replace(/^#\/?/, '').split('/').filter(Boolean).map(decodeURIComponent);
  S.menu = null; S.replyTo = null; S.live = null;
  renderTop();
  const app = $('#app');
  try {
    let html;
    const [a, b, c, d, e] = parts;
    if (!a) html = await viewDiscover();
    else if (a === 'login' || a === 'register') html = S.user ? (go('#/'), '') : viewAuth(a);
    else if (a === 'forgot') html = viewForgot();
    else if (a === 'reset') html = viewReset(b || '');
    else if (a === 'i') html = await viewInvite(b || '');
    else if (a === 'teach') html = viewTeach();
    else if (!S.user && a !== 'c') return go('#/login');
    else if (a === 'new') html = viewNew();
    else if (a === 'settings') html = viewSettings();
    else if (a === 'u') html = await viewProfile(b);
    else if (a === 'm') html = await viewMessages(b);
    else if (a === 'c') html = await viewCommunity(b, c, d, e);
    else html = '<div class="wrap empty">Sayfa bulunamadı.</div>';
    if (seq !== routeSeq) return;
    app.innerHTML = html;
    // Başka bir sayfaya geçildiyse en üste dön; aynı sayfa yenileniyorsa (beğeni, oy vb.) konumu koru
    if (location.hash !== lastHash) { lastHash = location.hash; window.scrollTo(0, 0); }
    for (const th of document.querySelectorAll('.thread')) th.scrollTop = th.scrollHeight;
  } catch (err) {
    if (seq !== routeSeq) return;
    if (err.status === 401) return go('#/login');
    app.innerHTML = `<div class="wrap empty"><h2>${esc(err.message)}</h2><p style="margin-top:12px"><a class="btn" href="#/">Ana sayfaya dön</a></p></div>`;
  } finally {
    if (seq === routeSeq) document.body.classList.remove('loading');
  }
}

// ---------- Ana sayfa (öğrenmek isteyenler için) ----------
let discoverQ = '', discoverCat = '';
const feature = (icon, title, text) => `<div class="feature"><span class="ficon">${ic(icon)}</span><div><b>${title}</b><p class="small">${text}</p></div></div>`;
const step = (n, title, text) => `<div class="step"><span>${n}</span><div><b>${title}</b><p class="small muted">${text}</p></div></div>`;
function communityCard(c) {
  return `<a class="card ccard" href="#/c/${esc(c.slug)}">
    <div class="band" ${c.cover ? `style="background-image:url('${esc(c.cover)}')"` : ''}>${c.live ? '<em class="tag live-tag">● CANLI</em>' : ''}<span>${esc(c.emoji)}</span></div>
    <div class="body stack">
      <div><h3>${esc(c.name)}</h3><p class="muted small">${esc(c.tagline)}</p></div>
      <div class="row small muted" style="flex-wrap:wrap"><span class="tag">${esc(c.category)}</span><span>${ic('users')} ${c.members} üye</span><span>${ic('book')} ${c.courses} kurs</span>${c.price_text ? `<span class="tag gold">${esc(c.price_text)}</span>` : '<span class="tag">Ücretsiz</span>'}</div>
    </div></a>`;
}
async function viewDiscover() {
  const qs = new URLSearchParams();
  if (discoverQ) qs.set('q', discoverQ);
  if (discoverCat) qs.set('category', discoverCat);
  const { items } = await api('/communities?' + qs);
  const landing = S.user ? '' : `<section class="landing"><div class="wrap">
      <div class="brand">${logoMark('xl')}<span>Okul</span></div>
      <h1>Öğrenmek istediğin her şey,<br>seninle öğrenen bir toplulukla</h1>
      <p>Kurslara katıl, takıldığın yerde sor, canlı derslere gir. Kendi hızında ama yalnız kalmadan öğren.</p>
      <form class="search row hero-search" data-form="discover"><input type="search" name="q" placeholder="Ne öğrenmek istiyorsun?" value="${esc(discoverQ)}" aria-label="Ne öğrenmek istiyorsun?"><button class="btn gold">${ic('search')} Ara</button></form>
      <div class="row cta"><a class="btn gold lg" href="#/register">Ücretsiz katıl</a><a class="btn ghostlight lg" href="#/login">Giriş yap</a></div>
      <div class="features">
        ${feature('book', 'Adım adım kurslar', 'Bölümlere ayrılmış dersler, videolar ve dosyalar. Kaldığın yerden devam et.')}
        ${feature('users', 'Soru sor, birlikte öğren', 'Takıldığında topluluğa yaz; eğitmen ve diğer öğrenciler yanıtlasın.')}
        ${feature('video', 'Canlı dersler', 'Canlı yayınlara katıl, sohbetten anında soru sor.')}
        ${feature('award', 'Seviye atla', 'Katkıların puan kazandırır; seviyen yükseldikçe yeni kurslar açılır.')}
      </div></div></section>
    <section class="wrap"><div class="steps">
      ${step(1, 'Topluluğunu seç', 'İlgi alanına uygun bir topluluğa katıl.')}
      ${step(2, 'Derslere başla', 'Kursları kendi hızında takip et, ilerlemeni gör.')}
      ${step(3, 'Paylaş ve ilerle', 'Soru sor, işini paylaş, canlı derslere katıl.')}
    </div></section>`;
  const mine = S.user ? `<div class="wrap"><div style="margin:28px 0 14px"><h2>Merhaba ${esc(S.user.name.split(' ')[0])}, öğrenmeye devam et</h2><p class="small muted">Üyesi olduğun topluluklar</p></div>
      ${S.communities.length ? `<div class="mine">${S.communities.map(c => `<a class="card row" href="#/c/${esc(c.slug)}"><span class="cicon lg">${esc(c.emoji)}</span><span class="grow"><b>${esc(c.name)}</b><br><span class="small" style="color:var(--accent);font-weight:600">Devam et →</span></span></a>`).join('')}</div>`
        : '<div class="card empty">Henüz bir topluluğa katılmadın. Aşağıdan ilgini çeken birini seç.</div>'}</div>` : '';
  return `${landing}${mine}<div class="wrap" id="kesfet">
    <div style="margin:30px 0 14px"><h2>Toplulukları keşfet</h2><p class="small muted">İlgini çeken konuyu seç, hemen öğrenmeye başla.</p></div>
    <div class="filters" style="margin-bottom:12px">${['', ...CATEGORY_LIST.slice(1)].map(k => `<button class="chip ${discoverCat === k ? 'on' : ''}" data-act="discoverCat" data-v="${esc(k)}">${esc(k || 'Tümü')}</button>`).join('')}</div>
    ${S.user ? `<form class="search row" data-form="discover" style="margin-bottom:18px"><input type="search" name="q" placeholder="Topluluk ya da konu ara…" value="${esc(discoverQ)}" aria-label="Topluluk ara"><button class="btn primary">${ic('search')}<span class="hide-sm"> Ara</span></button></form>` : ''}
    <div class="grid">${items.map(communityCard).join('') || '<div class="card empty" style="grid-column:1/-1">Bu aramaya uyan topluluk bulunamadı.</div>'}</div>
    <a class="teachband card" href="#/teach"><span class="ficon">${ic('award')}</span><span class="grow"><b>Eğitmen misin?</b><br><span class="small muted">Bildiğini öğret: kendi topluluğunu ve kurslarını oluştur.</span></span><span class="btn">Eğitim ver →</span></a>
  </div>`;
}

// ---------- Eğitim ver (eğitmenler için) ----------
function viewTeach() {
  const f = (icon, title, text) => `<div class="card tfeature"><span class="ficon">${ic(icon)}</span><div><b>${title}</b><p class="small muted">${text}</p></div></div>`;
  return `<section class="teach-hero"><div class="wrap">
      <span class="tag gold">Eğitmenler için</span>
      <h1>Bildiğini öğret,<br>topluluğunu büyüt</h1>
      <p class="muted">Kurslarını, öğrencilerini ve canlı derslerini tek bir yerden yönet. Kurulumu birkaç dakika sürer.</p>
      <div class="row cta"><button class="btn primary lg" data-act="teachStart">Topluluğunu kur</button><a class="btn lg" href="#/">Önce toplulukları gez</a></div>
    </div></section>
    <div class="wrap stack" style="padding-bottom:20px">
      <div class="tgrid">
        ${f('book', 'Kurslar', 'Derslerini bölümlere ayır, video ve dosya ekle. İstersen kursları belirli bir seviyeye ulaşanlara aç.')}
        ${f('users', 'Topluluk akışı', 'Duyuru, soru-cevap ve anketlerle öğrencilerinle aynı yerde ol.')}
        ${f('video', 'Canlı yayın', 'Canlı dersini toplulukta göster; öğrenciler sohbetten soru sorsun.')}
        ${f('card', 'Üyelik geliri', 'Ücretsiz, aylık ya da tek seferlik üyelik. Ücreti ve ödeme bilgisini sen belirlersin.')}
        ${f('settings', 'Yönetim paneli', 'Üyeler, istekler, süreler, istatistikler ve tüm ayarlar tek panelde.')}
        ${f('link', 'Davet bağlantısı', 'Öğrencilerini tek bir bağlantıyla topluluğuna getir.')}
      </div>
      <div><h2>Nasıl başlarım?</h2></div>
      <div class="steps">
        ${step(1, 'Topluluğunu kur', 'Ad, açıklama ve üyelik türünü seç.')}
        ${step(2, 'İçeriğini ekle', 'Kurslarını ve ilk duyurunu oluştur.')}
        ${step(3, 'Öğrencilerini davet et', 'Davet bağlantını paylaş, isteklerini panelden yönet.')}
      </div>
      <div class="card notice small">Ödemeler doğrudan senin hesabına yapılır: üye ödeme bilgini görür, ödemeyi aldığında üyeliği panelden onaylarsın. Kartla otomatik tahsilat henüz yok.</div>
      <div style="text-align:center;padding:10px 0 20px"><button class="btn primary lg" data-act="teachStart">Topluluğunu kur</button></div>
    </div>`;
}

// ---------- Giriş / kayıt ----------
function viewAuth(mode) {
  const reg = mode === 'register';
  return `<div class="wrap"><div class="card auth stack">
    <div class="brand dark">${logoMark('lg')}<span>Okul</span></div>
    <h2>${reg ? 'Hesap oluştur' : 'Tekrar hoş geldin'}</h2>
    <form class="stack" data-form="${mode}">
      ${reg ? '<div><label for="f-name">Ad Soyad</label><input id="f-name" type="text" name="name" required minlength="2" maxlength="60" autocomplete="name"></div>' : ''}
      <div><label for="f-email">E-posta</label><input id="f-email" type="email" name="email" required autocomplete="email"></div>
      <div><label for="f-pass">Şifre</label><input id="f-pass" type="password" name="password" required minlength="${reg ? 8 : 1}" autocomplete="${reg ? 'new-password' : 'current-password'}"></div>
      <button class="btn primary block">${reg ? 'Kayıt ol' : 'Giriş yap'}</button>
    </form>
    <p class="small muted">${reg ? 'Zaten hesabın var mı? <a href="#/login"><b>Giriş yap</b></a>' : 'Hesabın yok mu? <a href="#/register"><b>Kayıt ol</b></a>'}</p>
    ${reg ? '' : '<p class="small"><a href="#/forgot" style="color:var(--accent);font-weight:600">Şifremi unuttum</a></p>'}
    ${reg ? '' : '<p class="small muted">Denemek için: <b>demo@okul.app</b> / <b>demo1234</b> <button class="linkbtn" data-act="demo" style="color:var(--accent)">Demo ile gir →</button></p>'}
  </div></div>`;
}

// ---------- Topluluk kur ----------
function viewNew() {
  return `<div class="wrap"><div class="newgrid">
    <div class="card stack">
      <div><h2>Yeni topluluk kur</h2><p class="small muted">Bilgileri sonradan yönetim panelinden değiştirebilirsin.</p></div>
      <form class="stack" data-form="newCommunity">
        <div class="row" style="align-items:flex-end">
          <div style="width:80px"><label for="n-emoji">Simge</label><input id="n-emoji" type="text" name="emoji" value="🎓" maxlength="4"></div>
          <div class="grow"><label for="n-name">Topluluk adı</label><input id="n-name" type="text" name="name" required minlength="3" maxlength="50" placeholder="Örn. İngilizce Konuşma Kulübü"></div>
        </div>
        <div><label for="n-tag">Kısa tanım</label><input id="n-tag" type="text" name="tagline" maxlength="100" placeholder="Tek cümleyle: burada ne öğrenilir?"></div>
        <div><label for="n-cat">Kategori</label><select id="n-cat" name="category">${CATEGORY_LIST.map(c => `<option>${c}</option>`).join('')}</select></div>
        <div><label for="n-desc">Açıklama</label><textarea id="n-desc" name="description" maxlength="3000" rows="5" placeholder="Kimler için? Neler öğrenilecek? Nasıl ilerlenecek?"></textarea></div>
        <label class="check"><input type="checkbox" name="isPrivate"> Özel topluluk (katılmak için yönetici onayı gerekir)</label>
        <div class="row" style="align-items:flex-end"><div class="grow"><label for="n-ptype">Üyelik türü</label><select id="n-ptype" name="priceType"><option value="free">Ücretsiz</option><option value="monthly">Aylık ücretli</option><option value="once">Tek seferlik ücretli</option></select></div>
          <div style="width:130px"><label for="n-price">Ücret (₺)</label><input id="n-price" type="number" name="priceAmount" min="1" max="1000000" step="1" placeholder="200"></div></div>
        <div><label for="n-pay">Ödeme bilgisi (istek gönderenlere gösterilir)</label><textarea id="n-pay" name="payInfo" maxlength="1000" rows="2" placeholder="IBAN, ödeme bağlantısı ya da talimatlar"></textarea></div>
        <button class="btn primary lg">Topluluğu kur</button>
      </form></div>
    <div class="stack newpreview"><p class="small muted" style="font-weight:600">Keşfet sayfasında böyle görünecek</p>
      <div class="card ccard" style="pointer-events:none">
        <div class="band"><span id="nvEmoji">🎓</span></div>
        <div class="body stack">
          <div><h3 id="nvName">Topluluk adı</h3><p class="muted small" id="nvTag">Kısa tanımın burada görünür</p></div>
          <div class="row small muted" style="flex-wrap:wrap"><span class="tag" id="nvCat">Genel</span><span>${ic('users')} 1 üye</span><span class="tag gold" id="nvPrice">Ücretsiz</span></div>
        </div></div>
      <p class="small muted">Kapak görselini topluluğu kurduktan sonra yönetim panelinden ekleyebilirsin.</p></div>
  </div></div>`;
}

// ---------- Profil ----------
async function viewProfile(id) {
  const { user: u, communities, posts, canMessage } = await api('/users/' + encodeURIComponent(id));
  const mine = u.id === S.user.id, pts = communities.reduce((a, c) => a + c.points, 0);
  let host = '';
  try { host = u.link ? new URL(u.link).hostname.replace(/^www\./, '') : ''; } catch { /* bozuk bağlantı gösterilmez */ }
  return `<div class="wrap"><div class="narrow stack">
    <div class="card profile">
      <div class="profile-band"></div>
      <div class="profile-head">${avatar(u.name, u.color, 0, 'xl', u.avatar)}
        <div class="row" style="flex-wrap:wrap">${mine ? `<a class="btn" href="#/settings">${ic('edit')} Profili düzenle</a>` : canMessage ? `<a class="btn primary" href="#/m/${u.id}">${ic('mail')} Mesaj gönder</a>` : ''}</div></div>
      <div class="stack">
        <div><h1>${esc(u.name)}</h1>${u.title ? `<p style="font-weight:600">${esc(u.title)}</p>` : ''}
          <p class="muted small">${fmtDate(u.created_at, { month: 'long', year: 'numeric' })} tarihinden beri üye${host ? ` · <a href="${esc(u.link)}" target="_blank" rel="noopener noreferrer" style="color:var(--accent);font-weight:600">${ic('link')} ${esc(host)}</a>` : ''}</p></div>
        <p class="body-text">${rich(u.bio) || `<span class="muted">${mine ? 'Kendinden kısaca bahset; profilini düzenleyerek ekleyebilirsin.' : 'Henüz bir şey yazılmamış.'}</span>`}</p>
        <div class="stats small"><div><b>${communities.length}</b><span class="muted">topluluk</span></div><div><b>${pts}</b><span class="muted">puan</span></div><div><b>${posts.length}</b><span class="muted">gönderi</span></div></div>
      </div>
    </div>
    <div class="card stack"><h3>Topluluklar</h3>
      ${communities.map(c => `<a class="row" href="#/c/${esc(c.slug)}"><span class="cicon">${esc(c.emoji)}</span><span class="grow">${esc(c.name)} ${c.role === 'admin' ? '<span class="tag gold">Yönetici</span>' : ''}</span><span class="small muted">Seviye ${c.level} · ${c.points} puan</span></a>`).join('') || '<p class="muted">Henüz topluluk yok.</p>'}
    </div>
    <div class="card stack"><h3>Son gönderiler</h3>
      ${posts.map(p => `<a class="row" href="#/c/${esc(p.slug)}/p/${p.id}"><span class="grow"><b>${esc(p.title)}</b><br><span class="small muted">${esc(p.community)} · ${ago(p.created_at)}</span></span></a>`).join('') || '<p class="muted">Ortak topluluklarınızda gönderi yok.</p>'}
    </div></div></div>`;
}

// ---------- Profil ayarları ----------
function viewSettings() {
  const u = S.user;
  return `<div class="wrap"><div class="narrow stack">
    <div class="row spread" style="flex-wrap:wrap"><h1>Profil ayarları</h1><a class="btn" href="#/u/${u.id}">Profilimi gör</a></div>
    <div class="card stack"><h3>Profil fotoğrafı</h3>
      <div class="row" style="flex-wrap:wrap;gap:18px">${avatar(u.name, u.color, 0, 'xl', u.avatar)}
        <div class="stack grow" style="min-width:200px"><p class="small muted">Fotoğrafını seçince kırpma ekranı açılır: sürükleyerek konumlandır, yakınlaştır, döndür. Kaydetmeden önce nasıl görüneceğini görürsün.</p>
          <div class="row" style="flex-wrap:wrap"><label class="btn primary">${ic('camera')} ${u.avatar ? 'Fotoğrafı değiştir' : 'Fotoğraf yükle'}<input type="file" accept="image/png,image/jpeg,image/webp" data-pick="avatar" hidden></label>
            ${u.avatar ? '<button class="btn danger" data-act="removeAvatar">Kaldır</button>' : ''}</div></div></div></div>
    <form class="card stack" data-form="profile"><h3>Bilgiler</h3>
      <div><label for="p-name">Ad Soyad</label><input id="p-name" type="text" name="name" value="${esc(u.name)}" required minlength="2" maxlength="60" autocomplete="name"></div>
      <div><label for="p-title">Unvan</label><input id="p-title" type="text" name="title" value="${esc(u.title)}" maxlength="60" placeholder="Örn. Grafik tasarım öğrencisi"></div>
      <div><label for="p-bio">Hakkında <span class="muted" id="bioCount" style="font-weight:400">${(u.bio || '').length}/300</span></label><textarea id="p-bio" name="bio" maxlength="300" rows="4" placeholder="Neyle ilgileniyorsun, ne öğrenmek istiyorsun?">${esc(u.bio)}</textarea></div>
      <div><label for="p-link">Web sitesi ya da sosyal medya bağlantısı</label><input id="p-link" type="text" name="link" value="${esc(u.link)}" maxlength="200" placeholder="ornek.com" inputmode="url" autocapitalize="off"></div>
      <div><p class="small muted" style="font-weight:600;margin-bottom:6px">Başkalarına böyle görünür</p>
        <div class="pcard row" style="align-items:flex-start">${avatar(u.name, u.color, 0, '', u.avatar)}<div class="grow"><b id="pvName">${esc(u.name)}</b><div class="small" id="pvTitle" style="font-weight:600">${esc(u.title)}</div><div class="small muted body-text" id="pvBio">${esc(u.bio)}</div></div></div></div>
      <div><button class="btn primary">Bilgileri kaydet</button></div></form>
    <form class="card stack" data-form="password"><h3>Şifre</h3>
      <div><label for="pw-cur">Mevcut şifre</label><input id="pw-cur" type="password" name="current" required autocomplete="current-password"></div>
      <div><label for="pw-new">Yeni şifre</label><input id="pw-new" type="password" name="next" required minlength="8" autocomplete="new-password"></div>
      <div><label for="pw-again">Yeni şifre (tekrar)</label><input id="pw-again" type="password" name="again" required minlength="8" autocomplete="new-password"></div>
      <div><button class="btn primary">Şifreyi güncelle</button></div></form>
    <div class="card row spread" style="flex-wrap:wrap"><div><h3>Hesap</h3><p class="small muted">${esc(u.email)}</p></div><button class="btn" data-act="logout">${ic('logout')} Çıkış yap</button></div>
  </div></div>`;
}

// ---------- Fotoğraf kırpma ----------
// Seçilen görseli sürükleme, yakınlaştırma ve döndürmeyle konumlandırır; onayda kırpılmış JPEG'i (data URL) döndürür.
function cropImage(file, { aspect = 1, round = true, outW = 400, title = 'Fotoğrafı düzenle' } = {}) {
  return new Promise(done => {
    if (!file || !/^image\/(png|jpeg|webp)$/.test(file.type)) { toast('Yalnızca PNG, JPEG veya WebP yüklenebilir'); return done(null); }
    const url = URL.createObjectURL(file), im = new Image();
    im.onerror = () => { URL.revokeObjectURL(url); toast('Görsel okunamadı'); done(null); };
    im.onload = () => {
      const VW = Math.min(round ? 300 : 440, innerWidth - 76), VH = Math.round(VW / aspect), dpr = Math.min(window.devicePixelRatio || 1, 2);
      const st = { zoom: 1, rot: 0, ox: 0, oy: 0 };
      const d = document.createElement('dialog');
      d.className = 'modal cropper';
      d.innerHTML = `<form method="dialog" class="stack"><h3>${esc(title)}</h3>
        <div class="crop-wrap" style="width:${VW}px;height:${VH}px"><canvas class="stage" width="${VW * dpr}" height="${VH * dpr}" style="width:${VW}px;height:${VH}px" tabindex="0" aria-label="Görseli sürükleyerek konumlandır"></canvas>${round ? '<div class="crop-mask"></div>' : ''}</div>
        <p class="small muted" style="text-align:center">Sürükleyerek konumlandır, kaydırarak ya da iki parmakla yakınlaştır.</p>
        <div class="row"><span class="small muted">${ic('search')}</span><input class="grow" type="range" min="1" max="4" step="0.01" value="1" aria-label="Yakınlaştırma">
          <button type="button" class="btn sm" data-rot="-90" aria-label="Sola döndür">${ic('rotl')}</button><button type="button" class="btn sm" data-rot="90" aria-label="Sağa döndür">${ic('rotr')}</button></div>
        <div class="row crop-pv"><span class="small muted">Önizleme</span>${round
          ? '<canvas class="pv r" width="192" height="192" style="width:96px;height:96px"></canvas><canvas class="pv r" width="96" height="96" style="width:48px;height:48px"></canvas><canvas class="pv r" width="64" height="64" style="width:32px;height:32px"></canvas>'
          : `<canvas class="pv" width="480" height="${Math.round(480 / aspect)}" style="width:240px;height:${Math.round(240 / aspect)}px;border-radius:10px"></canvas>`}</div>
        <div class="row" style="justify-content:flex-end"><button class="btn" value="no">Vazgeç</button><button class="btn primary" value="ok" data-ok>Kaydet</button></div></form>`;
      const cv = d.querySelector('canvas.stage'), range = d.querySelector('input[type=range]');
      const dims = () => (st.rot % 180 ? [im.naturalHeight, im.naturalWidth] : [im.naturalWidth, im.naturalHeight]);
      const base = () => { const [w, h] = dims(); return Math.max(VW / w, VH / h); }; // görsel her zaman kırpma alanını doldurur
      const clamp = () => {
        const [w, h] = dims(), s = base() * st.zoom, mx = Math.max(0, (w * s - VW) / 2), my = Math.max(0, (h * s - VH) / 2);
        st.ox = Math.min(mx, Math.max(-mx, st.ox)); st.oy = Math.min(my, Math.max(-my, st.oy));
      };
      const paint = (ctx, W, H) => {
        const k = W / VW, s = base() * st.zoom * k;
        ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, W, H);
        ctx.translate(W / 2 + st.ox * k, H / 2 + st.oy * k); ctx.rotate(st.rot * Math.PI / 180); ctx.scale(s, s);
        ctx.imageSmoothingQuality = 'high'; ctx.drawImage(im, -im.naturalWidth / 2, -im.naturalHeight / 2);
      };
      const draw = () => {
        clamp(); paint(cv.getContext('2d'), cv.width, cv.height);
        for (const p of d.querySelectorAll('canvas.pv')) { const c = p.getContext('2d'); c.imageSmoothingQuality = 'high'; c.drawImage(cv, 0, 0, p.width, p.height); }
      };
      const setZoom = z => { st.zoom = Math.min(4, Math.max(1, z)); range.value = st.zoom; draw(); };
      const pts = new Map(); let pinch = 0;
      cv.addEventListener('pointerdown', e => { cv.setPointerCapture(e.pointerId); pts.set(e.pointerId, [e.clientX, e.clientY]); pinch = 0; });
      cv.addEventListener('pointermove', e => {
        const prev = pts.get(e.pointerId); if (!prev) return;
        pts.set(e.pointerId, [e.clientX, e.clientY]);
        if (pts.size === 1) { st.ox += e.clientX - prev[0]; st.oy += e.clientY - prev[1]; draw(); }
        else if (pts.size === 2) { const [a, b] = [...pts.values()], dist = Math.hypot(a[0] - b[0], a[1] - b[1]); if (pinch) setZoom(st.zoom * dist / pinch); pinch = dist; }
      });
      const up = e => { pts.delete(e.pointerId); pinch = 0; };
      cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
      cv.addEventListener('wheel', e => { e.preventDefault(); setZoom(st.zoom * (e.deltaY < 0 ? 1.08 : 1 / 1.08)); }, { passive: false });
      cv.addEventListener('keydown', e => {
        const m = { ArrowLeft: [-12, 0], ArrowRight: [12, 0], ArrowUp: [0, -12], ArrowDown: [0, 12] }[e.key];
        if (m) { e.preventDefault(); st.ox += m[0]; st.oy += m[1]; draw(); }
        if (e.key === '+' || e.key === '=') setZoom(st.zoom * 1.1);
        if (e.key === '-') setZoom(st.zoom / 1.1);
      });
      range.addEventListener('input', () => setZoom(Number(range.value)));
      d.querySelectorAll('[data-rot]').forEach(b => b.addEventListener('click', () => { st.rot = (st.rot + Number(b.dataset.rot) + 360) % 360; st.ox = st.oy = 0; draw(); }));
      d.addEventListener('close', () => {
        let out = null;
        if (d.returnValue === 'ok') { const o = document.createElement('canvas'); o.width = outW; o.height = Math.round(outW / aspect); paint(o.getContext('2d'), o.width, o.height); out = o.toDataURL('image/jpeg', 0.9); }
        URL.revokeObjectURL(url); d.remove(); done(out);
      });
      document.body.append(d); d.showModal(); draw();
    };
    im.src = url;
  });
}

// ---------- Şifre sıfırlama ----------
function viewForgot() {
  return `<div class="wrap"><div class="card auth stack"><h2>Şifremi unuttum</h2>
    <p class="small muted">Hesabının e-posta adresini yaz; şifre sıfırlama bağlantısı gönderelim.</p>
    <form class="stack" data-form="forgot"><div><label for="fg-email">E-posta</label><input id="fg-email" type="email" name="email" required autocomplete="email"></div>
      <button class="btn primary block">Bağlantı gönder</button></form>
    <p class="small muted"><a href="#/login"><b>← Girişe dön</b></a></p></div></div>`;
}
function viewReset(token) {
  return `<div class="wrap"><div class="card auth stack"><h2>Yeni şifre belirle</h2>
    <form class="stack" data-form="reset" data-token="${esc(token)}">
      <div><label for="rs-pass">Yeni şifre</label><input id="rs-pass" type="password" name="password" required minlength="8" autocomplete="new-password"></div>
      <div><label for="rs-again">Yeni şifre (tekrar)</label><input id="rs-again" type="password" name="again" required minlength="8" autocomplete="new-password"></div>
      <button class="btn primary block">Şifreyi kaydet</button></form></div></div>`;
}

// ---------- Davet ----------
async function viewInvite(code) {
  const { community: c } = await api('/invite/' + encodeURIComponent(code));
  return `<div class="wrap"><div class="card auth stack" style="text-align:center">
    <div style="font-size:46px">${esc(c.emoji)}</div><div><h2>${esc(c.name)}</h2><p class="muted">${esc(c.tagline)}</p></div>
    <p class="small muted">${c.members} üye · Bu topluluğa davet edildin</p>
    <button class="btn primary block" data-act="acceptInvite" data-code="${esc(code)}">${S.user ? 'Daveti kabul et ve katıl' : 'Kayıt ol ve katıl'}</button>
    ${S.user ? '' : '<p class="small muted">Zaten hesabın varsa kayıt ekranındaki “Giriş yap” bağlantısını kullan; giriş yapınca buraya dönersin.</p>'}</div></div>`;
}

// ---------- Özel mesajlar ----------
const bubbles = ms => ms.map(m => `<div class="msg ${m.from_id === S.user.id ? 'me' : ''}"><div class="body-text">${rich(m.body)}</div><small>${ago(m.created_at)}</small></div>`).join('')
  || '<p class="muted small" style="text-align:center;margin:auto">Henüz mesaj yok. İlk mesajı sen yaz.</p>';
async function viewMessages(id) {
  let thread = '';
  if (id) {
    const t = await api('/messages/' + encodeURIComponent(id));
    S.thread = { id: t.user.id, last: t.messages.at(-1)?.id || 0 };
    thread = `<div class="card dm-thread">
      <div class="row"><a class="btn sm dm-back" href="#/m" aria-label="Konuşmalara dön">←</a>${avatar(t.user.name, t.user.color, 0, '', t.user.avatar)}<a href="#/u/${t.user.id}"><b>${esc(t.user.name)}</b></a></div>
      <div id="thread" class="thread">${bubbles(t.messages)}</div>
      <form class="row" data-form="message" data-to="${t.user.id}" style="align-items:flex-end"><textarea class="grow" name="body" required maxlength="4000" rows="1" placeholder="Mesaj yaz…" aria-label="Mesaj" style="min-height:44px"></textarea><button class="btn primary">Gönder</button></form></div>`;
  } else S.thread = null;
  const { conversations } = await api('/messages'); // konuşma açıldıktan sonra: okunmamış sayıları güncel gelir
  refreshMe().then(renderTop);
  const list = conversations.map(c => `<a class="row dm-item ${String(c.id) === String(id) ? 'on' : ''}" href="#/m/${c.id}">${avatar(c.name, c.color, 0, '', c.avatar)}
    <span class="grow"><span class="row spread"><b>${esc(c.name)}</b><span class="small muted">${ago(c.created_at)}</span></span>
    <span class="small muted clamp1">${c.from_id === S.user.id ? 'Sen: ' : ''}${esc(c.body)}</span></span>${c.unread ? `<span class="dot static">${c.unread}</span>` : ''}</a>`).join('');
  return `<div class="wrap"><div class="dm ${id ? 'open' : ''}">
    <div class="card stack dm-list"><h2>Mesajlar</h2>${list || '<p class="muted small">Henüz mesajın yok. Bir üyenin profilindeki “Mesaj gönder” düğmesiyle başlayabilirsin.</p>'}</div>
    ${thread || '<div class="card empty dm-thread dm-empty">Soldan bir konuşma seç.</div>'}</div></div>`;
}

// ---------- Topluluk kabuğu ----------
let C = null; // geçerli topluluk verisi
const TABS = [['', 'Topluluk'], ['classroom', 'Sınıf'], ['calendar', 'Takvim'], ['members', 'Üyeler'], ['leaderboard', 'Sıralama'], ['about', 'Hakkında']];

function tabsFor() {
  const t = C.community.tabs, list = TABS.filter(([k]) => !(k in t) || t[k]);
  if (C.community.live) list.splice(1, 0, ['live', '<span class="live-dot"></span> Canlı']);
  if (C.role === 'admin') list.push(['admin', ic('settings') + ' Panel']);
  return list;
}
async function viewCommunity(slug, tab = '', x, y) {
  C = await api('/communities/' + encodeURIComponent(slug));
  const isMember = !!C.role;
  if (!isMember) tab = 'about';
  let main, full = false;
  if (tab === '') main = await tabFeed();
  else if (tab === 'p') main = await tabPost(x);
  else if (tab === 'classroom') { main = x ? await tabCourse(x, y) : await tabClassroom(); full = !!x; }
  else if (tab === 'calendar') main = await tabCalendar();
  else if (tab === 'members') main = await tabMembers();
  else if (tab === 'leaderboard') main = await tabLeaderboard();
  else if (tab === 'live') { main = await tabLive(); full = true; }
  else if (tab === 'admin' && C.role === 'admin') { main = await tabAdmin(x); full = true; }
  else main = tabAbout();
  const cur = tab === 'p' ? '' : tab, c = C.community, base = `#/c/${esc(c.slug)}`;
  return `
    ${communityHeader()}
    <nav class="tabs" aria-label="Topluluk bölümleri"><div class="wrap">
      ${(isMember ? tabsFor() : TABS.slice(-1)).map(([k, l]) => `<a class="${k === cur ? 'on' : ''}" href="${base}${k ? '/' + k : ''}">${l}</a>`).join('')}
    </div></nav>
    <div class="wrap layout ${full ? 'full' : ''}"><div class="stack">${main}</div>${full ? '' : sidebar()}</div>`;
}
function communityHeader() {
  const c = C.community;
  return `<section class="chead"><div class="chead-cover" ${c.cover ? `style="background-image:url('${esc(c.cover)}')"` : ''}></div>
    <div class="wrap chead-row"><span class="cicon xl">${esc(c.emoji)}</span>
      <div class="grow chead-text"><h1>${esc(c.name)}</h1>${c.tagline ? `<p class="muted">${esc(c.tagline)}</p>` : ''}
        <div class="row small muted" style="flex-wrap:wrap;margin-top:6px"><span>${ic('users')} ${C.stats.members} üye</span><span>${c.is_private ? ic('lock') + ' Özel' : ic('globe') + ' Açık'}</span>${c.price_text ? `<span class="tag gold">${esc(c.price_text)}</span>` : ''}${c.live ? `<a class="tag live-tag" href="#/c/${esc(c.slug)}/live">● CANLI</a>` : ''}</div></div>
      ${C.role === 'admin' ? `<a class="btn" href="#/c/${esc(c.slug)}/admin">${ic('settings')} Yönet</a>` : ''}
    </div></section>`;
}
function sidebar() {
  const c = C.community, base = `#/c/${esc(c.slug)}`, ev = C.nextEvent;
  return `<aside class="side stack">
    <div class="card stack">
      <div class="stats small" style="border-top:0;padding-top:0"><div><b>${C.stats.members}</b><span class="muted">üye</span></div><div><b>${C.stats.posts}</b><span class="muted">gönderi</span></div><div><b>${C.stats.courses}</b><span class="muted">kurs</span></div></div>
      ${C.role ? `<div class="row spread small"><span>${C.role === 'admin' ? '<span class="tag gold">Yönetici</span>' : '<span class="tag">Üye</span>'} Seviye ${C.me.level} · ${C.me.points} puan</span>${C.role === 'admin' ? '' : '<button class="linkbtn" data-act="leave">Ayrıl</button>'}</div>${C.paid_until ? `<p class="small muted">Üyeliğin ${fmtDate(C.paid_until, { day: 'numeric', month: 'long', year: 'numeric' })} tarihine kadar geçerli.</p>` : ''}`
        : '<p class="small muted">Gönderiler, kurslar ve etkinlikler üyelere açıktır.</p>'}
    </div>
    ${C.role && c.description ? `<div class="card stack"><h3>Hakkında</h3><p class="small muted clamp4 body-text">${esc(c.description)}</p><a class="small" style="color:var(--accent);font-weight:600" href="${base}/about">Devamını oku →</a></div>` : ''}
    ${ev ? `<a class="card stack" href="${base}/calendar"><h3>Yaklaşan etkinlik</h3><div class="row" style="align-items:flex-start"><div class="datebox"><small>${fmtDate(ev.starts_at, { month: 'short' })}</small><b>${new Date(ev.starts_at).getDate()}</b></div><div class="grow"><b>${esc(ev.title)}</b><div class="small muted">${fmtDate(ev.starts_at, { weekday: 'long' })} ${fmtTime(ev.starts_at)}</div></div></div></a>` : ''}
    ${C.role ? `<div class="card stack"><div class="row spread"><h3>En aktifler</h3><a class="small muted" href="${base}/leaderboard">Tümü →</a></div>
      ${C.top.map((u, i) => `<a class="row" href="#/u/${u.id}"><span class="rank ${i === 0 ? 'r1' : ''}">${i + 1}</span>${avatar(u.name, u.color, u.level, 'sm', u.avatar)}<span class="grow">${esc(u.name)}</span><span class="small muted">${u.points}</span></a>`).join('')}</div>` : ''}
  </aside>`;
}

// ---------- Akış ----------
async function tabFeed() {
  const c = C.community, f = S.feed;
  const qs = new URLSearchParams({ sort: f.sort }); if (f.category) qs.set('category', f.category); if (f.q) qs.set('q', f.q);
  const { posts } = await api(`/communities/${encodeURIComponent(c.slug)}/posts?${qs}`);
  const canPost = c.post_role !== 'admin' || C.role === 'admin';
  let hideStart = false;
  try { hideStart = localStorage.getItem('start:' + c.slug) === '1'; } catch { /* depolama kapalıysa kart görünür kalır */ }
  const start = C.me.posts === 0 && C.role !== 'admin' && !hideStart ? `<div class="card stack startcard"><div class="row spread"><h3>Hoş geldin! Buradan başla</h3><button class="linkbtn" data-act="hideStart">Kapat</button></div>
      <div class="startsteps">
        ${canPost ? `<button class="startstep" data-act="openComposer"><span>1</span><b>Kendini tanıt</b><small>Kısa bir merhaba gönderisi yaz</small></button>` : ''}
        ${c.tabs.classroom ? `<a class="startstep" href="#/c/${esc(c.slug)}/classroom"><span>${canPost ? 2 : 1}</span><b>İlk derse başla</b><small>Kurslara göz at</small></a>` : ''}
        ${c.tabs.members ? `<a class="startstep" href="#/c/${esc(c.slug)}/members"><span>${(canPost ? 2 : 1) + (c.tabs.classroom ? 1 : 0)}</span><b>Üyelerle tanış</b><small>Kimler var, bir bak</small></a>` : ''}
      </div></div>` : '';
  return `${start}
    ${c.live ? `<a class="card live-banner row" href="#/c/${esc(c.slug)}/live"><span class="tag live-tag">● CANLI</span><b class="grow">${esc(c.live.title)}</b><span class="btn sm primary">İzle</span></a>` : ''}
    ${canPost ? `<details class="card adminbox" id="composer"><summary class="row">${avatar(S.user.name, S.user.color, 0, '', S.user.avatar)}<span class="muted grow">Bir şeyler paylaş…</span></summary>
      <form class="stack" data-form="post">
        <input type="text" name="title" placeholder="Başlık" required minlength="3" maxlength="140" aria-label="Başlık">
        <textarea name="body" placeholder="Ne paylaşmak istersin? (YouTube bağlantısı yapıştırırsan video gömülür)" required maxlength="8000" rows="5" aria-label="İçerik"></textarea>
        <details class="adminbox"><summary class="linkbtn" style="color:var(--accent)">＋ Görsel, dosya ya da anket ekle</summary><div class="stack">
          <div><label for="post-img">Görsel</label><input id="post-img" type="file" name="image" accept="image/png,image/jpeg,image/webp,image/gif"></div>
          <div><label for="post-file">Dosya (PDF, ZIP, DOCX, XLSX, PPTX, TXT, CSV — en çok 8 MB)</label><input id="post-file" type="file" name="file" accept=".pdf,.zip,.docx,.xlsx,.pptx,.txt,.csv"></div>
          <div><label for="post-poll">Anket seçenekleri (her satıra bir seçenek, 2–6 adet)</label><textarea id="post-poll" name="poll" rows="3" maxlength="600" style="min-height:60px"></textarea></div>
        </div></details>
        <div class="row"><select name="category" style="width:auto" aria-label="Kategori">${c.categories.map(k => `<option>${esc(k)}</option>`).join('')}</select><span class="grow"></span><button class="btn primary">Paylaş</button></div>
      </form></details>` : ''}
    <div class="row" style="flex-wrap:wrap">
      <div class="filters grow">${['', ...c.categories].map(k => `<button class="chip ${f.category === k ? 'on' : ''}" data-act="feedCat" data-v="${esc(k)}">${esc(k || 'Tümü')}</button>`).join('')}</div>
      <select style="width:auto" data-change="feedSort" aria-label="Sıralama"><option value="new" ${f.sort === 'new' ? 'selected' : ''}>En yeni</option><option value="top" ${f.sort === 'top' ? 'selected' : ''}>En beğenilen</option></select>
    </div>
    <form data-form="feedSearch"><input type="search" name="q" value="${esc(f.q)}" placeholder="Gönderilerde ara…" aria-label="Gönderilerde ara"></form>
    ${posts.map(p => `
      <article class="card post ${p.pinned ? 'pinned' : ''}" data-act="open" data-href="#/c/${esc(c.slug)}/p/${p.id}">
        ${p.pinned ? '<div class="small" style="color:var(--gold);font-weight:700;margin-bottom:8px">' + ic('pin') + ' Sabitlendi</div>' : ''}
        ${byline(p)}
        <h3><a href="#/c/${esc(c.slug)}/p/${p.id}">${esc(p.title)}</a></h3>
        <p class="muted clamp body-text">${esc(p.body)}</p>
        ${p.image ? `<img class="post-img thumb" src="${esc(p.image)}" alt="" loading="lazy">` : ''}
        <div class="row" style="margin-top:12px;flex-wrap:wrap">${likeBtn('post', p)}<span class="small muted">${ic('comment')} ${p.comments} yorum</span>${p.poll ? '<span class="tag">' + ic('chart') + ' Anket</span>' : ''}${p.file ? '<span class="tag">' + ic('clip') + ' Dosya</span>' : ''}</div>
      </article>`).join('') || '<div class="card empty">Burada henüz gönderi yok.</div>'}`;
}
const ytId = s => /(?:youtu\.be\/|youtube\.com\/(?:watch\?(?:\S*&)?v=|embed\/|shorts\/|live\/))([\w-]{11})/.exec(String(s || ''))?.[1] || '';
const ytFrame = (id, title, extra = '') => `<div class="video"><iframe src="https://www.youtube-nocookie.com/embed/${esc(id)}${extra}" title="${esc(title)}" allow="accelerometer; autoplay; encrypted-media; picture-in-picture" allowfullscreen loading="lazy"></iframe></div>`;
const fileLink = (url, name) => (url ? `<a class="file" href="${esc(url)}" download="${esc(name)}">${ic('clip')} <span>${esc(name)}</span><b>İndir</b></a>` : '');
function pollBox(p) {
  const pl = p.poll;
  if (!pl) return '';
  return `<div class="poll">${pl.options.map((o, i) => {
    const pct = pl.total ? Math.round(o.votes * 100 / pl.total) : 0;
    return `<button class="poll-opt ${pl.my === i ? 'on' : ''}" data-act="vote" data-id="${p.id}" data-i="${i}" aria-pressed="${pl.my === i}"><i style="width:${pct}%"></i><span>${pl.my === i ? '✓ ' : ''}${esc(o.text)}</span><b>%${pct}</b></button>`;
  }).join('')}<div class="small muted">${pl.total} oy${pl.my != null ? ' · oyunu değiştirebilirsin' : ' · oy vermek için bir seçeneğe dokun'}</div></div>`;
}
const byline = p => `<div class="row">${avatar(p.author_name, p.author_color, p.author_level, '', p.author_avatar)}<div class="grow"><a href="#/u/${p.user_id}" data-stop><b>${esc(p.author_name)}</b></a><div class="small muted">${ago(p.created_at)}${p.category ? ` · <span class="tag">${esc(p.category)}</span>` : ''}</div></div></div>`;
const likeBtn = (type, t) => `<button class="like ${t.liked ? 'on' : ''}" data-act="like" data-type="${type}" data-id="${t.id}" aria-pressed="${!!t.liked}" ${t.user_id === S.user.id ? 'disabled title="Kendi içeriğini beğenemezsin"' : ''}>${ic('like')} <span>${t.likes}</span></button>`;

async function tabPost(id) {
  const { post: p, comments, role } = await api('/posts/' + encodeURIComponent(id));
  const c = C.community, canDel = t => t.user_id === S.user.id || role === 'admin';
  const roots = comments.filter(x => !x.parent_id);
  const one = (x, reply) => `<div class="comment">${avatar(x.author_name, x.author_color, x.author_level, reply ? 'sm' : '', x.author_avatar)}<div class="grow">
      <div class="bubble"><a href="#/u/${x.user_id}"><b>${esc(x.author_name)}</b></a> <span class="small muted">${ago(x.created_at)}</span><div class="body-text">${rich(x.body)}</div></div>
      <div class="row" style="margin-top:5px">${likeBtn('comment', x)}<button class="linkbtn" data-act="reply" data-id="${x.parent_id || x.id}" data-name="${esc(x.author_name)}">Yanıtla</button>${canDel(x) ? `<button class="linkbtn" data-act="delComment" data-id="${x.id}">Sil</button>` : ''}</div>
    </div></div>`;
  return `<a class="small muted" href="#/c/${esc(c.slug)}">← Akışa dön</a>
    <article class="card stack">
      ${byline(p)}
      <h2>${esc(p.title)}</h2>
      <div class="body-text">${rich(p.body)}</div>
      ${p.image ? `<a href="${esc(p.image)}" target="_blank" rel="noopener"><img class="post-img" src="${esc(p.image)}" alt="Gönderi görseli"></a>` : ''}
      ${ytId(p.body) ? ytFrame(ytId(p.body), p.title) : ''}
      ${pollBox(p)}
      ${fileLink(p.file, p.file_name)}
      <div class="row" style="flex-wrap:wrap">${likeBtn('post', p)}<span class="small muted">${ic('comment')} ${p.comments} yorum</span><span class="grow"></span>
        ${role === 'admin' ? `<button class="btn sm" data-act="pin" data-id="${p.id}">${p.pinned ? 'Sabitlemeyi kaldır' : ic('pin') + ' Sabitle'}</button>` : ''}
        ${canDel(p) ? `<button class="btn sm danger" data-act="delPost" data-id="${p.id}">Sil</button>` : ''}</div>
    </article>
    <section class="card stack"><h3>Yorumlar</h3>
      ${roots.map(r => `<div>${one(r)}<div class="replies stack">${comments.filter(x => x.parent_id === r.id).map(x => one(x, true)).join('')}</div></div>`).join('') || '<p class="muted">İlk yorumu sen yap.</p>'}
      <form class="stack" data-form="comment" data-post="${p.id}" id="commentForm">
        <div class="small muted" id="replyInfo" hidden></div>
        <div class="row" style="align-items:flex-start">${avatar(S.user.name, S.user.color, 0, '', S.user.avatar)}<textarea class="grow" name="body" required maxlength="3000" rows="2" placeholder="Yorumunu yaz…" aria-label="Yorum" style="min-height:44px"></textarea></div>
        <div style="text-align:right"><button class="btn primary">Gönder</button></div>
      </form></section>`;
}

// ---------- Sınıf ----------
async function tabClassroom() {
  const slug = C.community.slug;
  const { courses, myLevel } = await api(`/communities/${encodeURIComponent(slug)}/courses`);
  return `<div class="row spread"><h2>Sınıf</h2></div>
    ${C.role === 'admin' ? `<details class="card adminbox"><summary>${ic('plus')} Yeni kurs ekle</summary>
      <form class="stack" data-form="course">
        <div class="row" style="align-items:flex-end"><div style="width:80px"><label for="c-emoji">Simge</label><input id="c-emoji" type="text" name="emoji" value="📘" maxlength="4"></div>
        <div class="grow"><label for="c-title">Kurs adı</label><input id="c-title" type="text" name="title" required minlength="3" maxlength="80"></div></div>
        <div><label for="c-desc">Açıklama</label><textarea id="c-desc" name="description" maxlength="400" rows="2"></textarea></div>
        <div><label for="c-lvl">Kimler açabilir?</label><select id="c-lvl" name="minLevel">${[1, 2, 3, 4, 5, 6, 7, 8, 9].map(l => `<option value="${l}">${l === 1 ? 'Tüm üyeler' : `Seviye ${l} ve üzeri`}</option>`).join('')}</select></div>
        <button class="btn primary">Kursu oluştur</button></form></details>` : ''}
    <div class="grid" style="padding:0;grid-template-columns:repeat(auto-fill,minmax(230px,1fr))">
    ${courses.map(k => {
      const pct = k.total ? Math.round(k.done * 100 / k.total) : 0, locked = C.role !== 'admin' && myLevel < k.min_level;
      const inner = `<div class="row spread"><span style="font-size:34px">${esc(k.emoji)}</span>${k.min_level > 1 ? `<span class="tag gold">${locked ? ic('lock') + ' ' : ''}Seviye ${k.min_level}+</span>` : ''}</div>
        <div><h3>${esc(k.title)}</h3><p class="small muted clamp">${esc(k.description)}</p></div>
        ${locked ? `<p class="small muted">Seviye ${k.min_level}'e ulaşınca açılır. Şu an Seviye ${myLevel}'desin.</p>`
          : `<div><div class="bar" role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100"><i style="width:${pct}%"></i></div><div class="small muted" style="margin-top:4px">${k.done}/${k.total} ders · %${pct}</div></div>`}`;
      return locked ? `<div class="card stack locked">${inner}</div>` : `<a class="card stack" href="#/c/${esc(slug)}/classroom/${k.id}">${inner}</a>`;
    }).join('') || '<div class="card empty" style="grid-column:1/-1">Henüz kurs eklenmemiş.</div>'}</div>`;
}
async function tabCourse(courseId, lessonId) {
  const slug = C.community.slug;
  const { course, lessons } = await api('/courses/' + encodeURIComponent(courseId));
  const cur = lessons.find(l => String(l.id) === String(lessonId)) || lessons.find(l => !l.done) || lessons[0];
  const modules = [...new Set(lessons.map(l => l.module))];
  const done = lessons.filter(l => l.done).length, pct = lessons.length ? Math.round(done * 100 / lessons.length) : 0;
  const idx = cur ? lessons.indexOf(cur) : -1, next = lessons[idx + 1];
  const href = l => `#/c/${esc(slug)}/classroom/${course.id}/${l.id}`;
  return `<a class="small muted" href="#/c/${esc(slug)}/classroom">← Tüm kurslar</a>
  <div class="course">
    <div class="card stack">
      <div><h3>${esc(course.emoji)} ${esc(course.title)}</h3><div class="bar" style="margin-top:10px"><i style="width:${pct}%"></i></div><div class="small muted" style="margin-top:4px">%${pct} tamamlandı</div></div>
      ${modules.map(m => `<div><div class="small muted" style="font-weight:700;margin-bottom:4px">${esc(m)}</div>
        ${lessons.filter(l => l.module === m).map(l => `<a class="lesson-link ${cur && l.id === cur.id ? 'on' : ''}" href="${href(l)}"><span class="tick ${l.done ? 'done' : ''}">✓</span><span class="grow">${esc(l.title)}</span></a>`).join('')}</div>`).join('')}
      ${C.role === 'admin' ? `<details class="adminbox"><summary class="btn sm block">${ic('plus')} Ders ekle</summary>
        <form class="stack" data-form="lesson" data-course="${course.id}">
          <div><label for="l-mod">Bölüm</label><input id="l-mod" type="text" name="module" required maxlength="60" list="mods" value="${esc(modules.at(-1) || '')}"><datalist id="mods">${modules.map(m => `<option value="${esc(m)}">`).join('')}</datalist></div>
          <div><label for="l-title">Ders adı</label><input id="l-title" type="text" name="title" required minlength="2" maxlength="100"></div>
          <div><label for="l-video">YouTube bağlantısı (isteğe bağlı)</label><input id="l-video" type="url" name="video" maxlength="200"></div>
          <div><label for="l-file">Ders dosyası (isteğe bağlı)</label><input id="l-file" type="file" name="file" accept=".pdf,.zip,.docx,.xlsx,.pptx,.txt,.csv"></div>
          <div><label for="l-content">İçerik</label><textarea id="l-content" name="content" maxlength="10000" rows="5"></textarea></div>
          <button class="btn primary">Dersi ekle</button></form></details>
        <button class="btn sm danger" data-act="delCourse" data-id="${course.id}">Kursu sil</button>` : ''}
    </div>
    <div class="card stack">${cur ? `
      <div class="small muted">${esc(cur.module)}</div><h2>${esc(cur.title)}</h2>
      ${cur.video ? ytFrame(cur.video, cur.title) : ''}
      <div class="body-text">${rich(cur.content)}</div>
      ${fileLink(cur.file, cur.file_name)}
      <div class="row" style="flex-wrap:wrap;border-top:1px solid var(--line);padding-top:14px">
        <button class="btn ${cur.done ? '' : 'primary'}" data-act="complete" data-id="${cur.id}" data-next="${!cur.done && next ? href(next) : ''}">${cur.done ? '✓ Tamamlandı (geri al)' : 'Tamamlandı olarak işaretle'}</button>
        <span class="grow"></span>${next ? `<a class="btn" href="${href(next)}">Sonraki ders →</a>` : ''}
      </div>` : '<div class="empty">Bu kursta henüz ders yok.</div>'}
    </div>
  </div>`;
}

// ---------- Takvim ----------
async function tabCalendar() {
  const slug = C.community.slug;
  const { events } = await api(`/communities/${encodeURIComponent(slug)}/events`);
  const m = S.calMonth || (S.calMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const y = m.getFullYear(), mo = m.getMonth();
  const start = new Date(y, mo, 1 - ((new Date(y, mo, 1).getDay() + 6) % 7)); // Pazartesi başlangıç
  const todayKey = new Date().toDateString();
  let cells = '';
  for (let i = 0; i < 42; i++) {
    const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
    if (i % 7 === 0 && i > 0 && d.getMonth() !== mo) break; // ay bittiyse boş hafta çizme
    const evs = events.filter(e => new Date(e.starts_at).toDateString() === d.toDateString());
    cells += `<div class="${d.getMonth() !== mo ? 'out' : ''} ${d.toDateString() === todayKey ? 'today' : ''}"><span class="n">${d.getDate()}</span>
      ${evs.map(e => `<button class="ev" data-act="showEvent" data-id="${e.id}" title="${esc(e.title)}">${fmtTime(e.starts_at)} ${esc(e.title)}</button>`).join('')}</div>`;
  }
  const upcoming = events.filter(e => e.starts_at + e.duration_min * 6e4 >= Date.now());
  const evCard = e => `<div class="row" id="ev-${e.id}" style="align-items:flex-start">
    <div class="datebox"><small>${fmtDate(e.starts_at, { month: 'short' })}</small><b>${new Date(e.starts_at).getDate()}</b></div>
    <div class="grow"><b>${esc(e.title)}</b><div class="small muted">${fmtDate(e.starts_at, { weekday: 'long' })} ${fmtTime(e.starts_at)} · ${e.duration_min} dk</div>
      <div class="small body-text">${rich(e.description)}</div>${e.link ? `<a class="small" style="color:var(--accent);font-weight:600" href="${esc(e.link)}" target="_blank" rel="noopener noreferrer">Katılım bağlantısı ↗</a>` : ''}</div>
    ${C.role === 'admin' ? `<button class="linkbtn" data-act="delEvent" data-id="${e.id}">Sil</button>` : ''}</div>`;
  return `
    ${C.role === 'admin' ? `<details class="card adminbox"><summary>${ic('plus')} Etkinlik ekle</summary>
      <form class="stack" data-form="event">
        <div><label for="e-title">Etkinlik adı</label><input id="e-title" type="text" name="title" required minlength="3" maxlength="100"></div>
        <div class="row" style="align-items:flex-end"><div class="grow"><label for="e-when">Tarih ve saat</label><input id="e-when" type="datetime-local" name="when" required></div>
          <div style="width:110px"><label for="e-dur">Süre (dk)</label><input id="e-dur" type="number" name="duration" value="60" min="5" max="1440"></div></div>
        <div><label for="e-link">Bağlantı (isteğe bağlı)</label><input id="e-link" type="url" name="link" maxlength="300" placeholder="https://"></div>
        <div><label for="e-desc">Açıklama</label><textarea id="e-desc" name="description" maxlength="1000" rows="2"></textarea></div>
        <button class="btn primary">Etkinliği ekle</button></form></details>` : ''}
    <div class="card stack">
      <div class="row spread"><button class="btn sm" data-act="calNav" data-d="-1" aria-label="Önceki ay">←</button><h2>${m.toLocaleDateString('tr-TR', { month: 'long', year: 'numeric' })}</h2><button class="btn sm" data-act="calNav" data-d="1" aria-label="Sonraki ay">→</button></div>
      <div class="cal">${['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'].map(d => `<div class="head">${d}</div>`).join('')}${cells}</div>
    </div>
    <div class="card stack"><h3>Yaklaşan etkinlikler</h3>${upcoming.map(evCard).join('') || '<p class="muted">Planlanmış etkinlik yok.</p>'}</div>
    ${events.length > upcoming.length ? `<details class="card adminbox"><summary>Geçmiş etkinlikler (${events.length - upcoming.length})</summary><div class="stack">${events.filter(e => !upcoming.includes(e)).reverse().map(evCard).join('')}</div></details>` : ''}`;
}

// ---------- Üyeler ----------
async function tabMembers() {
  const { members, requests } = await api(`/communities/${encodeURIComponent(C.community.slug)}/members`);
  const isAdmin = C.role === 'admin';
  return `${requests.length ? `<div class="card stack" style="border-color:var(--gold)"><h3>Katılma istekleri (${requests.length})</h3>
      ${requests.map(r => `<div class="row" style="align-items:flex-start;flex-wrap:wrap">${avatar(r.name, r.color, 0, '', r.avatar)}
        <span class="grow"><a href="#/u/${r.id}"><b>${esc(r.name)}</b></a><br><span class="small muted">${esc(r.note) || 'Not bırakılmadı'} · ${ago(r.created_at)}</span></span>
        <button class="btn sm primary" data-act="decide" data-id="${r.id}" data-ok="1">Onayla</button><button class="btn sm" data-act="decide" data-id="${r.id}">Reddet</button></div>`).join('')}</div>` : ''}
    <div class="row spread"><h2>Üyeler <span class="muted">(${members.length})</span></h2></div>
    <input type="search" placeholder="Üye ara…" data-input="memberFilter" aria-label="Üye ara">
    <div class="card stack" id="memberList">${members.map(u => `
      <div class="row" data-name="${esc(u.name.toLocaleLowerCase('tr'))}" style="align-items:flex-start">
        <a href="#/u/${u.id}">${avatar(u.name, u.color, u.level, '', u.avatar)}</a>
        <span class="grow"><a href="#/u/${u.id}"><b>${esc(u.name)}</b></a> ${u.role === 'admin' ? '<span class="tag gold">Yönetici</span>' : ''}<br><span class="small muted">${esc(u.bio)}</span></span>
        <span class="small muted" style="text-align:right;white-space:nowrap">${u.points} puan<br>${fmtDate(u.joined_at, { day: 'numeric', month: 'short', year: 'numeric' })}
          ${isAdmin && u.id !== C.owner.id && u.id !== S.user.id ? `<br><button class="linkbtn" style="color:var(--danger)" data-act="kick" data-id="${u.id}" data-name="${esc(u.name)}">Çıkar</button>` : ''}</span>
      </div>`).join('')}</div>`;
}

// ---------- Sıralama ----------
async function tabLeaderboard() {
  const d = await api(`/communities/${encodeURIComponent(C.community.slug)}/leaderboard`);
  const board = (title, rows) => `<div class="card stack"><h3>${title}</h3>${rows.map((u, i) => `
    <a class="row" href="#/u/${u.id}"><span class="rank ${i === 0 ? 'r1' : ''}">${i + 1}</span>${avatar(u.name, u.color, u.level, 'sm', u.avatar)}<span class="grow">${esc(u.name)}</span><b style="color:var(--accent)">+${u.points}</b></a>`).join('') || '<p class="muted small">Bu dönemde puan kazanan yok.</p>'}</div>`;
  const span = d.me.next ? d.me.next - d.me.floor : 1, pct = d.me.next ? Math.round((d.me.points - d.me.floor) * 100 / span) : 100;
  return `
    <div class="card stack">
      <div class="row">${avatar(S.user.name, S.user.color, d.me.level, 'lg', S.user.avatar)}<div class="grow"><h2>Seviye ${d.me.level} — ${esc(d.me.name)}</h2>
        <p class="muted small">${d.me.next ? `Sonraki seviyeye <b>${d.me.next - d.me.points}</b> puan kaldı` : 'En yüksek seviyedesin!'} · Toplam ${d.me.points} puan</p>
        <div class="bar" style="margin-top:8px"><i style="width:${pct}%"></i></div></div></div>
      <p class="small muted">Gönderilerine ve yorumlarına gelen her beğeni 1 puan kazandırır.</p>
      <div class="levels">${d.levels.map(l => `<div><span class="lvnum ${l.level <= d.me.level ? 'reached' : ''}">${l.level}</span><span class="small"><b>${esc(l.name)}</b><br><span class="muted">${l.min}+ puan · üyelerin %${l.pct}'i</span></span></div>`).join('')}</div>
    </div>
    <div class="boards">${board('Son 7 gün', d.week)}${board('Son 30 gün', d.month)}${board('Tüm zamanlar', d.all)}</div>`;
}

// ---------- Hakkında ----------
function joinBox(block) {
  const c = C.community, gated = c.is_private || c.price_text;
  const pay = c.pay_info ? `<div class="notice small"><b>Ödeme bilgisi</b><div class="body-text">${rich(c.pay_info)}</div></div>` : '';
  if (C.pending) return `<div class="stack"><p class="small"><b>${ic('clock')} ${C.expired ? 'Yenileme' : 'Katılma'} isteğin yönetici onayı bekliyor.</b></p>${pay}
    <div><button class="btn sm" data-act="cancelRequest">İsteği geri çek</button></div></div>`;
  if (C.expired) return `<div class="stack"><p class="small"><b>Üyeliğinin süresi doldu.</b> Devam etmek için ${esc(c.price_text || 'üyeliğini')} ödemesini yapıp yenileme isteği gönder.</p>${pay}
    <button class="btn primary ${block ? 'block' : ''}" data-act="join">Ödeme yaptım, üyeliğimi yenile</button></div>`;
  return `<div><button class="btn primary ${block ? 'block' : ''}" data-act="join">${gated ? 'Katılma isteği gönder' : 'Topluluğa katıl'}</button>
    ${c.price_text ? `<p class="small muted" style="margin-top:8px">Üyelik ücreti: <b>${esc(c.price_text)}</b></p>` : ''}
    ${gated ? '<p class="small muted" style="margin-top:4px">İsteğin yönetici tarafından onaylandığında içerikler açılır.</p>' : ''}</div>`;
}
function tabAbout() {
  const c = C.community;
  return `<div class="card stack">
      <h2>Hakkında</h2>
      <div class="row small muted" style="flex-wrap:wrap"><span class="tag">${esc(c.category)}</span>${c.price_text ? `<span class="tag gold">${esc(c.price_text)}</span>` : '<span class="tag">Ücretsiz</span>'}<span>${ic('book')} ${C.stats.courses} kurs</span><span>Kurucu: <a href="${S.user ? '#/u/' + C.owner.id : '#/login'}"><b>${esc(C.owner.name)}</b></a></span><span>${fmtDate(c.created_at, { month: 'long', year: 'numeric' })}</span></div>
      <div class="body-text">${rich(c.description) || '<span class="muted">Açıklama eklenmemiş.</span>'}</div>
      ${C.role ? '' : `<div class="joinwrap">${joinBox(false)}</div>`}
      ${C.role === 'admin' ? `<div><a class="btn" href="#/c/${esc(c.slug)}/admin/settings">${ic('settings')} Yönetim panelinde düzenle</a></div>` : ''}
    </div>`;
}

// ---------- Canlı yayın ----------
const chatLines = ms => ms.map(m => `<div class="chatline"><b>${esc(m.name)}</b> ${rich(m.body)}</div>`).join('');
async function tabLive() {
  const d = await api(slugPath() + '/live');
  if (!d.live) return `<div class="card empty"><h3>Şu an canlı yayın yok</h3><p style="margin-top:6px">Yayın başladığında burada izleyebilir ve sohbete katılabilirsin.</p></div>`;
  S.live = { slug: C.community.slug, last: d.messages.at(-1)?.id || 0 };
  return `<div class="live">
    <div class="stack">${ytFrame(d.live.video, d.live.title, '?autoplay=1')}
      <div class="card"><span class="tag live-tag">● CANLI</span> <b>${esc(d.live.title)}</b><div class="small muted" style="margin-top:4px">${ago(d.live.started)} başladı</div></div></div>
    <div class="card live-chat"><h3>Canlı sohbet</h3>
      <div id="liveChat" class="thread">${chatLines(d.messages) || '<p class="muted small" id="chatEmpty">İlk mesajı sen yaz.</p>'}</div>
      <form class="row" data-form="liveChat"><input class="grow" type="text" name="body" required maxlength="500" placeholder="Mesaj yaz…" autocomplete="off" aria-label="Sohbet mesajı"><button class="btn primary">Gönder</button></form></div>
  </div>`;
}
async function pollLive() {
  if (!S.live || !location.hash.endsWith('/live')) return;
  const d = await api(`/communities/${encodeURIComponent(S.live.slug)}/live?after=${S.live.last}`);
  if (!d.live) return route(); // yayın bitti
  const box = $('#liveChat');
  if (!box || !d.messages.length) return;
  S.live.last = d.messages.at(-1).id;
  $('#chatEmpty')?.remove();
  box.insertAdjacentHTML('beforeend', chatLines(d.messages));
  box.scrollTop = box.scrollHeight;
}

// ---------- Yönetim paneli ----------
const ADMIN_NAV = [['', 'Genel bakış'], ['settings', 'Ayarlar'], ['pricing', 'Üyelik ve ücret'], ['members', 'Üyeler'], ['live', 'Canlı yayın']];
const CATEGORY_LIST = ['Genel', 'Tasarım', 'Yazılım', 'İş', 'Spor', 'Sağlık', 'Müzik', 'Dil', 'Hobi'];
async function tabAdmin(sec = '') {
  const c = C.community, base = `#/c/${esc(c.slug)}/admin`;
  const A = await api(slugPath() + '/admin');
  const nav = `<div><h2>Yönetim paneli</h2><p class="small muted">Yalnızca yöneticiler görür.</p></div>
    <div class="filters">${ADMIN_NAV.map(([k, l]) => `<a class="chip ${k === sec ? 'on' : ''}" href="${base}${k ? '/' + k : ''}">${l}${k === 'members' && A.requests.length ? ` <span class="dot static">${A.requests.length}</span>` : ''}${k === 'live' && c.live ? ' <span class="live-dot"></span>' : ''}</a>`).join('')}</div>`;
  const body = sec === 'settings' ? adminSettings() : sec === 'pricing' ? adminPricing(A) : sec === 'members' ? adminMembers(A) : sec === 'live' ? adminLive() : adminOverview(A);
  return nav + body;
}
const paidLabel = m => (m.role === 'admin' ? 'Yönetici' : !m.paid_until ? 'Süresiz' : m.paid_until < Date.now() ? 'Süresi doldu' : `${fmtDate(m.paid_until, { day: 'numeric', month: 'short', year: 'numeric' })} tarihine kadar`);
function adminOverview(A) {
  const c = C.community, s = A.stats, link = `${location.origin}/#/i/${A.invite_code}`;
  const stat = (v, l, sub = '') => `<div class="card stat"><b>${v}</b><span>${l}</span>${sub ? `<small>${sub}</small>` : ''}</div>`;
  const soon = A.members.filter(m => m.role !== 'admin' && m.paid_until && m.paid_until < Date.now() + 7 * 864e5).sort((a, b) => a.paid_until - b.paid_until);
  return `<div class="statgrid">
      ${stat(s.members, 'Toplam üye', `Son 7 günde +${s.new7} · 30 günde +${s.new30}`)}
      ${stat(A.requests.length, 'Bekleyen istek', A.requests.length ? `<a href="#/c/${esc(c.slug)}/admin/members" style="color:var(--accent);font-weight:600">İncele →</a>` : 'Bekleyen yok')}
      ${stat(s.posts7, 'Gönderi (7 gün)', `${s.comments7} yorum · ${s.likes7} beğeni`)}
      ${c.price_type === 'monthly' ? stat('₺' + s.revenue.toLocaleString('tr-TR'), 'Tahmini aylık gelir', `${s.paying} aktif ücretli üye × ₺${c.price_amount}`) : stat(c.price_text ? esc(c.price_text) : 'Ücretsiz', 'Üyelik türü', `<a href="#/c/${esc(c.slug)}/admin/pricing" style="color:var(--accent);font-weight:600">Değiştir →</a>`)}
    </div>
    <div class="card stack"><h3>Davet bağlantısı</h3>
      <p class="small muted">Bu bağlantıyla gelenler onay ve ödeme beklemeden doğrudan üye olur. Bağlantıyı yenilersen eskisi çalışmaz.</p>
      <div class="row" style="flex-wrap:wrap"><input class="grow" id="inviteLink" type="text" readonly value="${esc(link)}" aria-label="Davet bağlantısı" style="min-width:200px"><button class="btn primary" data-act="copyInvite">Kopyala</button><button class="btn" data-act="resetInvite">Yenile</button></div></div>
    ${soon.length ? `<div class="card stack"><h3>Süresi dolan ya da dolmak üzere olan üyelikler</h3>${soon.map(m => `<div class="row">${avatar(m.name, m.color, 0, 'sm', m.avatar)}<span class="grow">${esc(m.name)}</span><span class="small ${m.paid_until < Date.now() ? 'danger-text' : 'muted'}">${paidLabel(m)}</span><button class="btn sm" data-act="extend" data-id="${m.id}" data-days="30">+30 gün</button></div>`).join('')}</div>` : ''}
    <div class="card stack"><h3>En aktif üyeler</h3>${[...A.members].sort((a, b) => b.points - a.points).slice(0, 5).map((u, i) => `<a class="row" href="#/u/${u.id}"><span class="rank ${i === 0 ? 'r1' : ''}">${i + 1}</span>${avatar(u.name, u.color, u.level, 'sm', u.avatar)}<span class="grow">${esc(u.name)}</span><span class="small muted">${u.points} puan</span></a>`).join('')}</div>`;
}
function adminSettings() {
  const c = C.community, t = c.tabs;
  const tab = (k, l) => `<label class="check"><input type="checkbox" name="tab_${k}" ${t[k] ? 'checked' : ''}> ${l}</label>`;
  return `<form class="stack" data-form="adminSettings">
    <div class="card stack"><h3>Genel</h3>
      <div class="row" style="align-items:flex-end"><div style="width:80px"><label for="a-emoji">Simge</label><input id="a-emoji" type="text" name="emoji" value="${esc(c.emoji)}" maxlength="4"></div>
        <div class="grow"><label for="a-name">Topluluk adı</label><input id="a-name" type="text" name="name" value="${esc(c.name)}" required minlength="3" maxlength="50"></div></div>
      <div><label for="a-tag">Kısa tanım</label><input id="a-tag" type="text" name="tagline" maxlength="100" value="${esc(c.tagline)}"></div>
      <div><label for="a-cat">Kategori</label><select id="a-cat" name="category">${[...new Set([...CATEGORY_LIST, c.category])].map(k => `<option ${k === c.category ? 'selected' : ''}>${esc(k)}</option>`).join('')}</select></div>
      <div><label for="a-desc">Açıklama (Hakkında sayfasında görünür)</label><textarea id="a-desc" name="description" maxlength="3000" rows="6">${esc(c.description)}</textarea></div>
      <div><label>Kapak görseli</label>${c.cover ? `<img class="cover" src="${esc(c.cover)}" alt="" style="margin-bottom:8px">` : '<p class="small muted" style="margin-bottom:8px">Henüz kapak görseli yok; topluluk sayfasının üstünde ve keşfet kartında görünür.</p>'}
        <div class="row" style="flex-wrap:wrap"><label class="btn">${ic('camera')} ${c.cover ? 'Kapağı değiştir' : 'Kapak yükle'}<input type="file" accept="image/png,image/jpeg,image/webp" data-pick="cover" hidden></label>${c.cover ? '<button type="button" class="btn danger" data-act="removeCover">Kaldır</button>' : ''}</div></div>
    </div>
    <div class="card stack"><h3>Erişim ve paylaşım</h3>
      <label class="check"><input type="checkbox" name="isPrivate" ${c.is_private ? 'checked' : ''}> Özel topluluk (katılmak için yönetici onayı gerekir)</label>
      <div><label for="a-post">Kimler gönderi paylaşabilir?</label><select id="a-post" name="postRole"><option value="member" ${c.post_role !== 'admin' ? 'selected' : ''}>Tüm üyeler</option><option value="admin" ${c.post_role === 'admin' ? 'selected' : ''}>Yalnızca yöneticiler (üyeler yorum yapabilir)</option></select></div>
      <div><label for="a-cats">Gönderi kategorileri (virgülle ayır, en çok 8)</label><input id="a-cats" type="text" name="categories" value="${esc(c.categories.join(', '))}" required></div>
    </div>
    <div class="card stack"><h3>Görünen bölümler</h3><p class="small muted">Kullanmadığın bölümleri kapatabilirsin; üyelerin menüsünde görünmez.</p>
      ${tab('classroom', 'Sınıf (kurslar)')}${tab('calendar', 'Takvim')}${tab('members', 'Üyeler')}${tab('leaderboard', 'Sıralama')}
    </div>
    <div><button class="btn primary">Ayarları kaydet</button></div></form>`;
}
function adminPricing(A) {
  const c = C.community;
  const opt = (v, l) => `<option value="${v}" ${c.price_type === v ? 'selected' : ''}>${l}</option>`;
  return `<form class="card stack" data-form="adminPricing"><h3>Üyelik ve ücret</h3>
      <div><label for="pr-type">Üyelik türü</label><select id="pr-type" name="priceType">${opt('free', 'Ücretsiz')}${opt('monthly', 'Aylık ücretli (her ay yenilenir)')}${opt('once', 'Tek seferlik ücretli (ömür boyu erişim)')}</select></div>
      <div><label for="pr-amount">Ücret (₺)</label><input id="pr-amount" type="number" name="priceAmount" min="1" max="1000000" step="1" value="${c.price_amount || ''}" placeholder="Örn. 200"></div>
      <div><label for="pr-pay">Ödeme bilgisi (istek gönderenlere gösterilir)</label><textarea id="pr-pay" name="payInfo" maxlength="1000" rows="4" placeholder="IBAN, alıcı adı, ödeme bağlantısı ya da talimatlar">${esc(c.pay_info)}</textarea></div>
      <div><button class="btn primary">Kaydet</button></div>
    </form>
    <div class="card stack"><h3>Nasıl işler?</h3>
      <ol class="small muted" style="margin:0;padding-left:18px;line-height:1.7">
        <li>Katılmak isteyen kişi istek gönderir ve yazdığın ödeme bilgisini görür.</li>
        <li>Ödemeyi aldığında <b>Üyeler</b> bölümünden isteği onaylarsın.</li>
        <li><b>Aylık</b> üyelikte onay 30 gün erişim açar. Süre dolunca üye içerikleri göremez; yeniden ödeyip yenileme isteği gönderir ya da sen süreyi elle uzatırsın.</li>
        <li><b>Tek seferlik</b> üyelikte onay süresiz erişim açar.</li>
      </ol>
      <p class="small muted">Kartla otomatik tahsilat henüz yok; ödemeler senin hesabına doğrudan yapılır. Şu an ${A.stats.paying} aktif süreli üyen var.</p></div>`;
}
function adminMembers(A) {
  const owner = S.user.id === A.owner_id;
  return `${A.requests.length ? `<div class="card stack" style="border-color:var(--gold)"><h3>Bekleyen istekler (${A.requests.length})</h3>
      ${A.requests.map(r => `<div class="row" style="align-items:flex-start;flex-wrap:wrap">${avatar(r.name, r.color, 0, '', r.avatar)}
        <span class="grow"><a href="#/u/${r.id}"><b>${esc(r.name)}</b></a><br><span class="small muted">${esc(r.note) || 'Not bırakılmadı'} · ${ago(r.created_at)}</span></span>
        <button class="btn sm primary" data-act="decide" data-id="${r.id}" data-ok="1">Onayla</button><button class="btn sm" data-act="decide" data-id="${r.id}">Reddet</button></div>`).join('')}</div>` : ''}
    <div class="card stack"><h3>Üyeler (${A.members.length})</h3>
      ${A.members.map(m => { const fixed = m.id === A.owner_id || m.id === S.user.id; return `<div class="mrow">
        <a class="row grow" href="#/u/${m.id}" style="min-width:180px">${avatar(m.name, m.color, m.level, '', m.avatar)}<span><b>${esc(m.name)}</b> ${m.id === A.owner_id ? '<span class="tag gold">Kurucu</span>' : m.role === 'admin' ? '<span class="tag gold">Yönetici</span>' : ''}<br>
          <span class="small ${m.role !== 'admin' && m.paid_until && m.paid_until < Date.now() ? 'danger-text' : 'muted'}">${paidLabel(m)} · ${m.points} puan</span></span></a>
        <span class="row" style="flex-wrap:wrap;gap:6px">
          ${m.role !== 'admin' ? `<button class="btn sm" data-act="extend" data-id="${m.id}" data-days="30">+30 gün</button>${m.paid_until ? `<button class="btn sm" data-act="unlimited" data-id="${m.id}">Süresiz yap</button>` : ''}` : ''}
          ${owner && !fixed ? `<button class="btn sm" data-act="setRole" data-id="${m.id}" data-role="${m.role === 'admin' ? 'member' : 'admin'}">${m.role === 'admin' ? 'Yöneticilikten al' : 'Yönetici yap'}</button>` : ''}
          ${!fixed ? `<button class="btn sm danger" data-act="kick" data-id="${m.id}" data-name="${esc(m.name)}">Çıkar</button>` : ''}
        </span></div>`; }).join('')}</div>`;
}
function adminLive() {
  const c = C.community;
  if (c.live) return `<div class="card stack"><div><span class="tag live-tag">● CANLI</span> <b>${esc(c.live.title)}</b><div class="small muted" style="margin-top:4px">${ago(c.live.started)} başladı</div></div>
      <div class="row" style="flex-wrap:wrap"><a class="btn primary" href="#/c/${esc(c.slug)}/live">Yayını ve sohbeti aç</a><button class="btn danger" data-act="liveStop">Yayını bitir</button></div></div>`;
  return `<form class="card stack" data-form="liveStart"><h3>Canlı yayın başlat</h3>
      <div><label for="lv-title">Yayın başlığı</label><input id="lv-title" type="text" name="title" required minlength="3" maxlength="100" placeholder="Örn. Haftalık soru-cevap"></div>
      <div><label for="lv-url">YouTube canlı yayın bağlantısı</label><input id="lv-url" type="url" name="url" required maxlength="200" placeholder="https://youtube.com/live/…"></div>
      <div><button class="btn primary">Yayını başlat</button></div></form>
    <div class="card stack"><h3>Nasıl yapılır?</h3>
      <ol class="small muted" style="margin:0;padding-left:18px;line-height:1.7">
        <li>YouTube'da canlı yayınını başlat (yalnızca üyelerin görmesi için görünürlüğü “Liste dışı” seç).</li>
        <li>Yayının bağlantısını kopyalayıp buraya yapıştır ve <b>Yayını başlat</b>'a bas.</li>
        <li>Üyelere bildirim gider, menüde <b>Canlı</b> sekmesi açılır; yayını Okul içinde izler ve buradaki sohbete yazarlar.</li>
        <li>Bitince <b>Yayını bitir</b>'e bas; sekme kapanır, sohbet temizlenir.</li>
      </ol></div>`;
}

// ---------- Eylemler ----------
const slugPath = () => `/communities/${encodeURIComponent(C.community.slug)}`;
const acts = {
  async menu(el) {
    const name = el.dataset.menu;
    S.menu = S.menu === name ? null : name;
    renderTop();
    if (S.menu === 'notes') { S.notes = (await api('/notifications')).items; S.unread = 0; if (S.menu === 'notes') renderTop(); }
  },
  async logout() { await api('/auth/logout', 'POST'); await refreshMe(); go('#/'); },
  async demo() { await api('/auth/login', 'POST', { email: 'demo@okul.app', password: 'demo1234' }); await refreshMe(); go('#/c/tasarim-atolyesi'); },
  async join() {
    if (!S.user) return go('#/register');
    let note = '';
    if (C.community.is_private || C.community.price_text) {
      note = await ask({ title: 'Katılma isteği gönder', text: 'Yöneticiye bir not bırakabilirsin (isteğe bağlı).', input: 'Notun', ok: 'İsteği gönder' });
      if (note === null) return;
    }
    const r = await api(slugPath() + '/join', 'POST', { note });
    await refreshMe();
    if (r.pending) { toast('İsteğin gönderildi, yönetici onayı bekleniyor'); return route(); }
    toast('Topluluğa katıldın'); go(`#/c/${C.community.slug}`);
  },
  async vote(el) { await api(`/posts/${el.dataset.id}/vote`, 'POST', { option: Number(el.dataset.i) }); route(); },
  async acceptInvite(el) {
    if (!S.user) { try { sessionStorage.setItem('after', location.hash); } catch { /* yok say */ } return go('#/register'); }
    const r = await api('/invite/' + el.dataset.code, 'POST'); await refreshMe(); toast('Topluluğa katıldın'); go('#/c/' + r.slug);
  },
  async copyInvite() {
    const inp = $('#inviteLink');
    try { await navigator.clipboard.writeText(inp.value); } catch { inp.select(); document.execCommand('copy'); }
    toast('Davet bağlantısı kopyalandı');
  },
  async resetInvite() { if (!await ask({ title: 'Bağlantı yenilensin mi? Eski bağlantı artık çalışmaz.', danger: true })) return; await api(slugPath() + '/invite', 'POST'); toast('Davet bağlantısı yenilendi'); route(); },
  async extend(el) { await api(`${slugPath()}/members/${el.dataset.id}`, 'POST', { extendDays: Number(el.dataset.days) }); toast('Üyelik 30 gün uzatıldı'); route(); },
  async unlimited(el) { await api(`${slugPath()}/members/${el.dataset.id}`, 'POST', { unlimited: true }); toast('Üyelik süresiz yapıldı'); route(); },
  async setRole(el) { await api(`${slugPath()}/members/${el.dataset.id}`, 'POST', { role: el.dataset.role }); toast('Rol güncellendi'); route(); },
  async liveStop() { if (!await ask({ title: 'Canlı yayın bitirilsin mi? Sohbet temizlenir.', danger: true })) return; await api(slugPath() + '/live', 'DELETE'); toast('Yayın bitirildi'); route(); },
  discoverCat(el) { discoverCat = el.dataset.v; route(); },
  teachStart() { if (S.user) return go('#/new'); try { sessionStorage.setItem('after', '#/new'); } catch { /* yok say */ } go('#/register'); },
  hideStart() { try { localStorage.setItem('start:' + C.community.slug, '1'); } catch { /* yok say */ } route(); },
  openComposer() { const d = $('#composer'); if (!d) return; d.open = true; d.scrollIntoView({ behavior: 'smooth', block: 'center' }); $('input[name=title]', d).focus(); },
  async removeAvatar() { if (!await ask({ title: 'Profil fotoğrafın kaldırılsın mı?', danger: true })) return; await api('/me/avatar', 'PUT', { avatar: '' }); await refreshMe(); toast('Fotoğraf kaldırıldı'); route(); },
  async removeCover() { if (!await ask({ title: 'Kapak görseli kaldırılsın mı?', danger: true })) return; await api(slugPath() + '/cover', 'PUT', { cover: '' }); toast('Kapak kaldırıldı'); route(); },
  async cancelRequest() { await api(slugPath() + '/join', 'DELETE'); toast('İstek geri çekildi'); route(); },
  async decide(el) { await api(`${slugPath()}/requests/${el.dataset.id}`, 'POST', { approve: !!el.dataset.ok }); toast(el.dataset.ok ? 'Üye onaylandı' : 'İstek reddedildi'); route(); },
  async kick(el) { if (!await ask({ title: `${el.dataset.name} topluluktan çıkarılsın mı?`, danger: true })) return; await api(`${slugPath()}/members/${el.dataset.id}`, 'DELETE'); route(); },
  async leave() { if (!await ask({ title: 'Topluluktan ayrılmak istediğine emin misin?', danger: true })) return; await api(slugPath() + '/leave', 'POST'); await refreshMe(); go('#/'); },
  open(el, ev) { if (!ev.target.closest('a,button')) location.hash = el.dataset.href; },
  feedCat(el) { S.feed.category = el.dataset.v; route(); },
  async like(el) {
    const r = await api('/like', 'POST', { type: el.dataset.type, id: Number(el.dataset.id) });
    el.classList.toggle('on', r.liked); el.setAttribute('aria-pressed', r.liked); $('span', el).textContent = r.likes;
  },
  reply(el) {
    S.replyTo = Number(el.dataset.id);
    const info = $('#replyInfo'); info.hidden = false;
    info.innerHTML = `<b>${esc(el.dataset.name)}</b> adlı kişiye yanıt yazıyorsun · <button type="button" class="linkbtn" data-act="cancelReply">Vazgeç</button>`;
    $('#commentForm textarea').focus();
  },
  cancelReply() { S.replyTo = null; $('#replyInfo').hidden = true; },
  async delComment(el) { if (!await ask({ title: 'Yorum silinsin mi?', danger: true })) return; await api('/comments/' + el.dataset.id, 'DELETE'); route(); },
  async delPost(el) { if (!await ask({ title: 'Gönderi silinsin mi?', danger: true })) return; await api('/posts/' + el.dataset.id, 'DELETE'); toast('Gönderi silindi'); go(`#/c/${C.community.slug}`); },
  async pin(el) { await api(`/posts/${el.dataset.id}/pin`, 'POST'); route(); },
  async complete(el) { await api(`/lessons/${el.dataset.id}/complete`, 'POST'); if (el.dataset.next) location.hash = el.dataset.next; else route(); },
  async delCourse(el) { if (!await ask({ title: 'Kurs ve tüm dersleri silinsin mi?', danger: true })) return; await api('/courses/' + el.dataset.id, 'DELETE'); go(`#/c/${C.community.slug}/classroom`); },
  calNav(el) { S.calMonth = new Date(S.calMonth.getFullYear(), S.calMonth.getMonth() + Number(el.dataset.d), 1); route(); },
  showEvent(el) {
    const card = $('#ev-' + el.dataset.id); if (!card) return;
    const d = card.closest('details'); if (d) d.open = true;
    card.scrollIntoView({ behavior: 'smooth', block: 'center' });
  },
  async delEvent(el) { if (!await ask({ title: 'Etkinlik silinsin mi?', danger: true })) return; await api('/events/' + el.dataset.id, 'DELETE'); route(); },
};
const forms = {
  async discover(d) { discoverQ = d.q.trim(); await route(); $('#kesfet')?.scrollIntoView({ behavior: 'smooth' }); },
  async login(d) { await api('/auth/login', 'POST', d); await refreshMe(); go(afterAuth()); },
  async register(d) { await api('/auth/register', 'POST', d); await refreshMe(); toast('Hoş geldin!'); go(afterAuth()); },
  async newCommunity(d) { const r = await api('/communities', 'POST', { ...d, isPrivate: !!d.isPrivate }); await refreshMe(); toast('Topluluğun hazır'); go('#/c/' + r.slug); },
  async profile(d) { await api('/me', 'PUT', { name: d.name, title: d.title, bio: d.bio, link: d.link }); await refreshMe(); toast('Bilgilerin kaydedildi'); route(); },
  async password(d, form) {
    if (d.next !== d.again) throw new Error('Yeni şifreler birbiriyle aynı değil');
    await api('/me/password', 'PUT', { current: d.current, next: d.next }); form.reset(); toast('Şifren güncellendi');
  },
  async forgot(d, form) {
    const r = await api('/auth/forgot', 'POST', d);
    form.outerHTML = `<div class="notice small">${r.mail ? 'Bu adrese kayıtlı bir hesap varsa sıfırlama bağlantısı gönderildi. Gelen kutunu kontrol et.' : 'Bu sunucuda e-posta gönderimi henüz ayarlanmamış. Sıfırlama bağlantısı sunucu günlüğüne yazıldı; site yöneticisine başvur.'}</div>`;
  },
  async reset(d, form) {
    if (d.password !== d.again) throw new Error('Şifreler birbiriyle aynı değil');
    await api('/auth/reset', 'POST', { token: form.dataset.token, password: d.password }); toast('Şifren güncellendi, giriş yapabilirsin'); go('#/login');
  },
  async message(d, form) { await api('/messages/' + form.dataset.to, 'POST', { body: d.body }); route(); },
  async post(d) {
    const image = await upload(d.image), f = await uploadFile(d.file);
    const poll = String(d.poll || '').split('\n').map(s => s.trim()).filter(Boolean);
    const r = await api(slugPath() + '/posts', 'POST', { title: d.title, body: d.body, category: d.category, image, file: f.url, fileName: f.name, poll }); go(`#/c/${C.community.slug}/p/${r.id}`);
  },
  feedSearch(d) { S.feed.q = d.q.trim(); route(); },
  async comment(d, form) { await api(`/posts/${form.dataset.post}/comments`, 'POST', { body: d.body, parentId: S.replyTo }); route(); },
  async course(d) { const r = await api(slugPath() + '/courses', 'POST', d); go(`#/c/${C.community.slug}/classroom/${r.id}`); },
  async lesson(d, form) {
    const f = await uploadFile(d.file);
    const r = await api(`/courses/${form.dataset.course}/lessons`, 'POST', { module: d.module, title: d.title, video: d.video, content: d.content, file: f.url, fileName: f.name }); go(`#/c/${C.community.slug}/classroom/${form.dataset.course}/${r.id}`); },
  async event(d) {
    const startsAt = new Date(d.when).getTime();
    await api(slugPath() + '/events', 'POST', { ...d, startsAt });
    S.calMonth = new Date(new Date(startsAt).getFullYear(), new Date(startsAt).getMonth(), 1);
    toast('Etkinlik eklendi'); route();
  },
  async adminSettings(d) {
    await api(slugPath(), 'PUT', { name: d.name, tagline: d.tagline, description: d.description, category: d.category, emoji: d.emoji, isPrivate: !!d.isPrivate, postRole: d.postRole, categories: d.categories,
      tabs: { classroom: !!d.tab_classroom, calendar: !!d.tab_calendar, members: !!d.tab_members, leaderboard: !!d.tab_leaderboard } });
    await refreshMe(); toast('Ayarlar kaydedildi'); route();
  },
  async adminPricing(d) { await api(slugPath() + '/pricing', 'PUT', d); toast('Üyelik ayarları kaydedildi'); route(); },
  async liveStart(d) { await api(slugPath() + '/live', 'POST', d); toast('Yayın başladı, üyelere bildirim gönderildi'); go(`#/c/${C.community.slug}/live`); },
  async liveChat(d, form) { await api(slugPath() + '/live/chat', 'POST', { body: d.body }); form.reset(); await pollLive(); },
};

document.addEventListener('click', async ev => {
  const el = ev.target.closest('[data-act]');
  if (!ev.target.closest('.switcher') && S.menu) { S.menu = null; renderTop(); }
  // Menüdeki bir bağlantı zaten açık olan sayfaya gidiyorsa sayfa değişmez; menüyü yine de kapat
  if (S.menu && ev.target.closest('.menu a')) setTimeout(() => { if (S.menu) { S.menu = null; renderTop(); } });
  if (!el || el.disabled) return;
  try { await acts[el.dataset.act]?.(el, ev); } catch (err) { toast(err.message); }
});
document.addEventListener('submit', async ev => {
  const form = ev.target.closest('[data-form]');
  if (!form) return;
  ev.preventDefault();
  const btn = $('button:not([type=button])', form);
  if (btn) btn.disabled = true;
  try { await forms[form.dataset.form](Object.fromEntries(new FormData(form)), form); }
  catch (err) { toast(err.message); }
  finally { if (btn) btn.disabled = false; }
});
// Fotoğraf seçildiğinde kırpma ekranını aç; onaylanırsa yükle ve kaydet
document.addEventListener('change', async ev => {
  const kind = ev.target.dataset?.pick, file = ev.target.files?.[0];
  if (!kind || !file) return;
  ev.target.value = '';
  try {
    const dataUrl = kind === 'avatar' ? await cropImage(file, { title: 'Profil fotoğrafını düzenle' }) : await cropImage(file, { aspect: 3, round: false, outW: 1500, title: 'Kapak görselini düzenle' });
    if (!dataUrl) return;
    document.body.classList.add('loading');
    const { url } = await api('/upload', 'POST', { dataUrl });
    if (kind === 'avatar') { await api('/me/avatar', 'PUT', { avatar: url }); await refreshMe(); toast('Profil fotoğrafın güncellendi'); }
    else { await api(slugPath() + '/cover', 'PUT', { cover: url }); toast('Kapak görseli güncellendi'); }
    route();
  } catch (err) { document.body.classList.remove('loading'); toast(err.message); }
});
document.addEventListener('input', ev => {
  const f = ev.target.form?.dataset.form, set = (id, v) => { const el = $(id); if (el) el.textContent = v; };
  if (f === 'profile') {
    const d = Object.fromEntries(new FormData(ev.target.form));
    set('#pvName', d.name || 'Ad Soyad'); set('#pvTitle', d.title); set('#pvBio', d.bio); set('#bioCount', `${d.bio.length}/300`);
  } else if (f === 'newCommunity') {
    const d = Object.fromEntries(new FormData(ev.target.form));
    set('#nvEmoji', d.emoji || '🎓'); set('#nvName', d.name || 'Topluluk adı'); set('#nvTag', d.tagline || 'Kısa tanımın burada görünür'); set('#nvCat', d.category);
    set('#nvPrice', d.priceType === 'free' || !d.priceAmount ? 'Ücretsiz' : `₺${d.priceAmount}${d.priceType === 'monthly' ? ' / ay' : ' tek seferlik'}`);
  }
});
document.addEventListener('change', ev => {
  if (ev.target.dataset.change === 'feedSort') { S.feed.sort = ev.target.value; route(); }
});
document.addEventListener('input', ev => {
  if (ev.target.dataset.input !== 'memberFilter') return;
  const q = ev.target.value.trim().toLocaleLowerCase('tr');
  document.querySelectorAll('#memberList > [data-name]').forEach(a => { a.style.display = a.dataset.name.includes(q) ? '' : 'none'; });
});
document.addEventListener('keydown', ev => {
  if (ev.key === 'Escape' && S.menu) { S.menu = null; renderTop(); }
  // Mesaj kutusunda Enter gönderir, Shift+Enter yeni satır açar (dokunmatik klavyede Gönder düğmesi kullanılır)
  if (ev.key === 'Enter' && !ev.shiftKey && !ev.isComposing && ev.target.matches?.('[data-form=message] textarea') && matchMedia('(pointer:fine)').matches) { ev.preventDefault(); ev.target.form.requestSubmit(); }
});

setInterval(() => { if (!document.hidden) pollLive().catch(() => {}); }, 3000); // canlı sohbet

// Açık konuşmada yeni mesajları ve üst çubuktaki sayaçları düzenli aralıkla yenile
setInterval(async () => {
  if (!S.user || document.hidden) return;
  try {
    if (S.thread && location.hash.startsWith('#/m/')) {
      const t = await api('/messages/' + S.thread.id), last = t.messages.at(-1)?.id || 0, th = $('#thread');
      if (th && last !== S.thread.last) { S.thread.last = last; th.innerHTML = bubbles(t.messages); th.scrollTop = th.scrollHeight; }
    }
    const before = S.unread + ':' + S.unreadMessages;
    await refreshMe();
    if (!S.menu && before !== S.unread + ':' + S.unreadMessages) renderTop();
  } catch { /* geçici ağ hatası: bir sonraki turda yeniden denenir */ }
}, 6000);

$('#year').textContent = new Date().getFullYear();
window.addEventListener('hashchange', route);
refreshMe().then(route, route);
