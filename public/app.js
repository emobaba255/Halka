/* Okul — tek sayfa arayüzü (bağımlılıksız) */
const $ = (s, r = document) => r.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const S = { user: null, communities: [], unread: 0, menu: null, notes: null, feed: { category: '', sort: 'new', q: '' }, calMonth: null, replyTo: null };

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

// ---------- Biçimlendirme ----------
const initials = n => String(n || '?').trim().split(/\s+/).slice(0, 2).map(w => w[0]).join('').toLocaleUpperCase('tr');
const avatar = (name, color, level, cls = '') => `<span class="av ${cls}" style="--c:${esc(color)}" aria-hidden="true">${esc(initials(name))}${level ? `<b>${level}</b>` : ''}</span>`;
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
const rich = s => esc(s).replace(/https?:\/\/[^\s<]+/g, u => `<a href="${u}" target="_blank" rel="noopener noreferrer">${u}</a>`);

// ---------- Üst çubuk ----------
function renderTop() {
  const u = S.user;
  const switcher = u ? `
    <div class="switcher">
      <button class="btn sm" data-act="menu" data-menu="comm" aria-expanded="${S.menu === 'comm'}">Topluluklarım ▾</button>
      ${S.menu === 'comm' ? `<div class="menu left">
        ${S.communities.map(c => `<a href="#/c/${esc(c.slug)}"><span class="cicon" style="--c:${esc(c.color)}">${esc(c.emoji)}</span><span class="grow">${esc(c.name)}</span></a>`).join('') || '<div class="muted small" style="padding:10px">Henüz bir topluluğa katılmadın.</div>'}
        <hr><a href="#/">🔎 Toplulukları keşfet</a><a href="#/new">➕ Topluluk kur</a></div>` : ''}
    </div>` : '';
  const right = u ? `
    <div class="switcher">
      <button class="iconbtn" data-act="menu" data-menu="notes" aria-label="Bildirimler">🔔${S.unread ? `<span class="dot">${S.unread}</span>` : ''}</button>
      ${S.menu === 'notes' ? `<div class="menu right" style="width:320px">${renderNotes()}</div>` : ''}
    </div>
    <div class="switcher">
      <button class="iconbtn" style="border:0;padding:0" data-act="menu" data-menu="user" aria-label="Hesap menüsü">${avatar(u.name, u.color)}</button>
      ${S.menu === 'user' ? `<div class="menu right">
        <div style="padding:8px 10px"><b>${esc(u.name)}</b><div class="muted small">${esc(u.email)}</div></div><hr>
        <a href="#/u/${u.id}">👤 Profilim</a><a href="#/new">➕ Topluluk kur</a>
        <button class="item" data-act="logout">↩ Çıkış yap</button></div>` : ''}
    </div>` : `<a class="btn ghost" href="#/login">Giriş yap</a><a class="btn primary" href="#/register">Kayıt ol</a>`;
  $('#top').innerHTML = `<div class="wrap row topbar"><a class="logo" href="#/"><i></i><span class="hide-sm">Okul</span></a>${switcher}<span class="grow"></span>${right}</div>`;
}
function renderNotes() {
  if (!S.notes) return '<div class="muted small" style="padding:12px">Yükleniyor…</div>';
  if (!S.notes.length) return '<div class="muted small" style="padding:12px">Henüz bildirimin yok.</div>';
  const verb = { like_post: 'gönderini beğendi', like_comment: 'yorumunu beğendi', comment: 'gönderine yorum yaptı', reply: 'yorumuna yanıt verdi' };
  return S.notes.map(n => `<a href="#/c/${esc(n.slug)}/p/${n.post_id}">${avatar(n.actor_name, n.actor_color, 0, 'sm')}
    <span class="grow small"><b>${esc(n.actor_name)}</b> ${verb[n.type] || ''}: <span class="muted">${esc(n.post_title)}</span><br><span class="muted">${ago(n.created_at)}</span></span>
    ${n.is_read ? '' : '<span class="tag">yeni</span>'}</a>`).join('');
}

// ---------- Yönlendirici ----------
async function refreshMe() {
  const me = await api('/me');
  Object.assign(S, { user: me.user, communities: me.communities, unread: me.unread });
}
let routeSeq = 0;
async function route() {
  const seq = ++routeSeq;
  const parts = location.hash.replace(/^#\/?/, '').split('/').filter(Boolean).map(decodeURIComponent);
  S.menu = null; S.replyTo = null;
  renderTop();
  const app = $('#app');
  try {
    let html;
    const [a, b, c, d, e] = parts;
    if (!a) html = await viewDiscover();
    else if (a === 'login' || a === 'register') html = S.user ? (go('#/'), '') : viewAuth(a);
    else if (!S.user && a !== 'c') return go('#/login');
    else if (a === 'new') html = viewNew();
    else if (a === 'u') html = await viewProfile(b);
    else if (a === 'c') html = await viewCommunity(b, c, d, e);
    else html = '<div class="wrap empty">Sayfa bulunamadı.</div>';
    if (seq !== routeSeq) return;
    app.innerHTML = html;
  } catch (err) {
    if (seq !== routeSeq) return;
    if (err.status === 401) return go('#/login');
    app.innerHTML = `<div class="wrap empty"><h2>${esc(err.message)}</h2><p style="margin-top:12px"><a class="btn" href="#/">Ana sayfaya dön</a></p></div>`;
  }
}

// ---------- Keşfet ----------
let discoverQ = '';
async function viewDiscover() {
  const { items } = await api('/communities?q=' + encodeURIComponent(discoverQ));
  return `<div class="wrap">
    <section class="hero">
      <h1>Topluluğunu ve kurslarını<br>tek bir yerde topla</h1>
      <p class="muted">Tartışmalar, dersler, etkinlikler ve üyeleri motive eden bir puan sistemi. Bir topluluğa katıl ya da kendininkini dakikalar içinde kur.</p>
      <form class="search row" data-form="discover"><input type="search" name="q" placeholder="Topluluk ara…" value="${esc(discoverQ)}" aria-label="Topluluk ara"><button class="btn primary">Ara</button></form>
    </section>
    <div class="grid">${items.map(c => `
      <a class="card ccard" href="#/c/${esc(c.slug)}" style="--c:${esc(c.color)}">
        <div class="band"><span>${esc(c.emoji)}</span></div>
        <div class="body stack">
          <div><h3>${esc(c.name)}</h3><p class="muted small">${esc(c.tagline)}</p></div>
          <div class="row small muted"><span class="tag">${esc(c.category)}</span><span>${c.members} üye</span><span>${c.is_private ? '🔒 Özel' : '🌍 Açık'}</span></div>
        </div></a>`).join('') || '<div class="empty" style="grid-column:1/-1">Aramana uyan topluluk bulunamadı.</div>'}
    </div></div>`;
}

// ---------- Giriş / kayıt ----------
function viewAuth(mode) {
  const reg = mode === 'register';
  return `<div class="wrap"><div class="card auth stack">
    <h2>${reg ? 'Hesap oluştur' : 'Tekrar hoş geldin'}</h2>
    <form class="stack" data-form="${mode}">
      ${reg ? '<div><label for="f-name">Ad Soyad</label><input id="f-name" type="text" name="name" required minlength="2" maxlength="60" autocomplete="name"></div>' : ''}
      <div><label for="f-email">E-posta</label><input id="f-email" type="email" name="email" required autocomplete="email"></div>
      <div><label for="f-pass">Şifre</label><input id="f-pass" type="password" name="password" required minlength="${reg ? 8 : 1}" autocomplete="${reg ? 'new-password' : 'current-password'}"></div>
      <button class="btn primary block">${reg ? 'Kayıt ol' : 'Giriş yap'}</button>
    </form>
    <p class="small muted">${reg ? 'Zaten hesabın var mı? <a href="#/login"><b>Giriş yap</b></a>' : 'Hesabın yok mu? <a href="#/register"><b>Kayıt ol</b></a>'}</p>
    ${reg ? '' : '<p class="small muted">Denemek için: <b>demo@okul.app</b> / <b>demo1234</b> <button class="linkbtn" data-act="demo" style="color:var(--accent)">Demo ile gir →</button></p>'}
  </div></div>`;
}

// ---------- Topluluk kur ----------
function viewNew() {
  return `<div class="wrap"><div class="card narrow stack">
    <h2>Yeni topluluk kur</h2>
    <form class="stack" data-form="newCommunity">
      <div class="row" style="align-items:flex-end">
        <div style="width:80px"><label for="n-emoji">Simge</label><input id="n-emoji" type="text" name="emoji" value="⭕" maxlength="4"></div>
        <div class="grow"><label for="n-name">Topluluk adı</label><input id="n-name" type="text" name="name" required minlength="3" maxlength="50"></div>
      </div>
      <div><label for="n-tag">Kısa tanım</label><input id="n-tag" type="text" name="tagline" maxlength="100" placeholder="Tek cümleyle topluluğun ne hakkında?"></div>
      <div><label for="n-cat">Kategori</label><select id="n-cat" name="category">${['Genel', 'Tasarım', 'Yazılım', 'İş', 'Spor', 'Sağlık', 'Müzik', 'Dil', 'Hobi'].map(c => `<option>${c}</option>`).join('')}</select></div>
      <div><label for="n-desc">Açıklama</label><textarea id="n-desc" name="description" maxlength="3000" rows="5"></textarea></div>
      <label class="check"><input type="checkbox" name="isPrivate"> Özel topluluk (keşfette 🔒 olarak görünür)</label>
      <button class="btn primary">Topluluğu kur</button>
    </form></div></div>`;
}

// ---------- Profil ----------
async function viewProfile(id) {
  const { user: u, communities, posts } = await api('/users/' + encodeURIComponent(id));
  const mine = u.id === S.user.id;
  return `<div class="wrap"><div class="narrow stack">
    <div class="card stack">
      <div class="row">${avatar(u.name, u.color, 0, 'lg')}<div class="grow"><h2>${esc(u.name)}</h2><p class="muted small">${fmtDate(u.created_at, { month: 'long', year: 'numeric' })} tarihinden beri üye</p></div></div>
      <p class="body-text">${rich(u.bio) || '<span class="muted">Henüz bir şey yazılmamış.</span>'}</p>
      ${mine ? `<details class="adminbox"><summary class="btn sm">Profili düzenle</summary>
        <form class="stack" data-form="profile">
          <div><label for="p-name">Ad Soyad</label><input id="p-name" type="text" name="name" value="${esc(u.name)}" required minlength="2" maxlength="60"></div>
          <div><label for="p-bio">Hakkında</label><textarea id="p-bio" name="bio" maxlength="300">${esc(u.bio)}</textarea></div>
          <button class="btn primary">Kaydet</button></form></details>` : ''}
    </div>
    <div class="card stack"><h3>Topluluklar</h3>
      ${communities.map(c => `<a class="row" href="#/c/${esc(c.slug)}"><span class="cicon" style="--c:${esc(c.color)}">${esc(c.emoji)}</span><span class="grow">${esc(c.name)} ${c.role === 'admin' ? '<span class="tag gold">Yönetici</span>' : ''}</span><span class="small muted">Seviye ${c.level} · ${c.points} puan</span></a>`).join('') || '<p class="muted">Henüz topluluk yok.</p>'}
    </div>
    <div class="card stack"><h3>Son gönderiler</h3>
      ${posts.map(p => `<a class="row" href="#/c/${esc(p.slug)}/p/${p.id}"><span class="grow"><b>${esc(p.title)}</b><br><span class="small muted">${esc(p.community)} · ${ago(p.created_at)}</span></span></a>`).join('') || '<p class="muted">Ortak topluluklarınızda gönderi yok.</p>'}
    </div></div></div>`;
}

// ---------- Topluluk kabuğu ----------
let C = null; // geçerli topluluk verisi
const TABS = [['', 'Topluluk'], ['classroom', 'Sınıf'], ['calendar', 'Takvim'], ['members', 'Üyeler'], ['leaderboard', 'Sıralama'], ['about', 'Hakkında']];

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
  else main = tabAbout();
  const cur = tab === 'p' ? '' : tab, c = C.community, base = `#/c/${esc(c.slug)}`;
  return `
    <nav class="tabs" aria-label="Topluluk bölümleri"><div class="wrap">
      ${(isMember ? TABS : TABS.slice(-1)).map(([k, l]) => `<a class="${k === cur ? 'on' : ''}" href="${base}${k ? '/' + k : ''}">${l}</a>`).join('')}
    </div></nav>
    <div class="wrap layout ${full ? 'full' : ''}"><div class="stack">${main}</div>${full ? '' : sidebar()}</div>`;
}
function sidebar() {
  const c = C.community;
  return `<aside class="side stack">
    <div class="card stack" style="--c:${esc(c.color)}">
      <div class="banner"></div>
      <div class="row"><span class="cicon lg" style="--c:${esc(c.color)};margin-top:-28px;background:var(--surface);border:1px solid var(--line)">${esc(c.emoji)}</span></div>
      <div><h3>${esc(c.name)}</h3><p class="small muted">${esc(c.tagline)}</p></div>
      <div class="stats small"><div><b>${C.stats.members}</b><span class="muted">üye</span></div><div><b>${C.stats.posts}</b><span class="muted">gönderi</span></div><div><b>${C.stats.courses}</b><span class="muted">kurs</span></div></div>
      ${C.role ? `<div class="row spread small"><span>${C.role === 'admin' ? '<span class="tag gold">Yönetici</span>' : '<span class="tag">Üye</span>'} Seviye ${C.me.level} · ${C.me.points} puan</span>${C.role === 'admin' ? '' : '<button class="linkbtn" data-act="leave">Ayrıl</button>'}</div>`
        : `<button class="btn primary block" data-act="join">Topluluğa katıl</button>`}
    </div>
    ${C.role ? `<div class="card stack"><div class="row spread"><h3>En aktifler</h3><a class="small muted" href="#/c/${esc(c.slug)}/leaderboard">Tümü →</a></div>
      ${C.top.map((u, i) => `<a class="row" href="#/u/${u.id}"><span class="rank ${i === 0 ? 'r1' : ''}">${i + 1}</span>${avatar(u.name, u.color, u.level, 'sm')}<span class="grow">${esc(u.name)}</span><span class="small muted">${u.points}</span></a>`).join('')}</div>` : ''}
  </aside>`;
}

// ---------- Akış ----------
async function tabFeed() {
  const c = C.community, f = S.feed;
  const qs = new URLSearchParams({ sort: f.sort }); if (f.category) qs.set('category', f.category); if (f.q) qs.set('q', f.q);
  const { posts } = await api(`/communities/${encodeURIComponent(c.slug)}/posts?${qs}`);
  return `
    <details class="card adminbox"><summary class="row">${avatar(S.user.name, S.user.color)}<span class="muted grow">Bir şeyler paylaş…</span></summary>
      <form class="stack" data-form="post">
        <input type="text" name="title" placeholder="Başlık" required minlength="3" maxlength="140" aria-label="Başlık">
        <textarea name="body" placeholder="Ne paylaşmak istersin?" required maxlength="8000" rows="5" aria-label="İçerik"></textarea>
        <div class="row"><select name="category" style="width:auto" aria-label="Kategori">${c.categories.map(k => `<option>${esc(k)}</option>`).join('')}</select><span class="grow"></span><button class="btn primary">Paylaş</button></div>
      </form></details>
    <div class="row" style="flex-wrap:wrap">
      <div class="filters grow">${['', ...c.categories].map(k => `<button class="chip ${f.category === k ? 'on' : ''}" data-act="feedCat" data-v="${esc(k)}">${esc(k || 'Tümü')}</button>`).join('')}</div>
      <select style="width:auto" data-change="feedSort" aria-label="Sıralama"><option value="new" ${f.sort === 'new' ? 'selected' : ''}>En yeni</option><option value="top" ${f.sort === 'top' ? 'selected' : ''}>En beğenilen</option></select>
    </div>
    <form data-form="feedSearch"><input type="search" name="q" value="${esc(f.q)}" placeholder="Gönderilerde ara…" aria-label="Gönderilerde ara"></form>
    ${posts.map(p => `
      <article class="card post ${p.pinned ? 'pinned' : ''}" data-act="open" data-href="#/c/${esc(c.slug)}/p/${p.id}">
        ${p.pinned ? '<div class="small" style="color:var(--gold);font-weight:700;margin-bottom:8px">📌 Sabitlendi</div>' : ''}
        ${byline(p)}
        <h3><a href="#/c/${esc(c.slug)}/p/${p.id}">${esc(p.title)}</a></h3>
        <p class="muted clamp body-text">${esc(p.body)}</p>
        <div class="row" style="margin-top:12px">${likeBtn('post', p)}<span class="small muted">💬 ${p.comments} yorum</span></div>
      </article>`).join('') || '<div class="card empty">Burada henüz gönderi yok. İlkini sen paylaş!</div>'}`;
}
const byline = p => `<div class="row">${avatar(p.author_name, p.author_color, p.author_level)}<div class="grow"><a href="#/u/${p.user_id}" data-stop><b>${esc(p.author_name)}</b></a><div class="small muted">${ago(p.created_at)}${p.category ? ` · <span class="tag">${esc(p.category)}</span>` : ''}</div></div></div>`;
const likeBtn = (type, t) => `<button class="like ${t.liked ? 'on' : ''}" data-act="like" data-type="${type}" data-id="${t.id}" aria-pressed="${!!t.liked}" ${t.user_id === S.user.id ? 'disabled title="Kendi içeriğini beğenemezsin"' : ''}>👍 <span>${t.likes}</span></button>`;

async function tabPost(id) {
  const { post: p, comments, role } = await api('/posts/' + encodeURIComponent(id));
  const c = C.community, canDel = t => t.user_id === S.user.id || role === 'admin';
  const roots = comments.filter(x => !x.parent_id);
  const one = (x, reply) => `<div class="comment">${avatar(x.author_name, x.author_color, x.author_level, reply ? 'sm' : '')}<div class="grow">
      <div class="bubble"><a href="#/u/${x.user_id}"><b>${esc(x.author_name)}</b></a> <span class="small muted">${ago(x.created_at)}</span><div class="body-text">${rich(x.body)}</div></div>
      <div class="row" style="margin-top:5px">${likeBtn('comment', x)}<button class="linkbtn" data-act="reply" data-id="${x.parent_id || x.id}" data-name="${esc(x.author_name)}">Yanıtla</button>${canDel(x) ? `<button class="linkbtn" data-act="delComment" data-id="${x.id}">Sil</button>` : ''}</div>
    </div></div>`;
  return `<a class="small muted" href="#/c/${esc(c.slug)}">← Akışa dön</a>
    <article class="card stack">
      ${byline(p)}
      <h2>${esc(p.title)}</h2>
      <div class="body-text">${rich(p.body)}</div>
      <div class="row" style="flex-wrap:wrap">${likeBtn('post', p)}<span class="small muted">💬 ${p.comments} yorum</span><span class="grow"></span>
        ${role === 'admin' ? `<button class="btn sm" data-act="pin" data-id="${p.id}">${p.pinned ? 'Sabitlemeyi kaldır' : '📌 Sabitle'}</button>` : ''}
        ${canDel(p) ? `<button class="btn sm danger" data-act="delPost" data-id="${p.id}">Sil</button>` : ''}</div>
    </article>
    <section class="card stack"><h3>Yorumlar</h3>
      ${roots.map(r => `<div>${one(r)}<div class="replies stack">${comments.filter(x => x.parent_id === r.id).map(x => one(x, true)).join('')}</div></div>`).join('') || '<p class="muted">İlk yorumu sen yap.</p>'}
      <form class="stack" data-form="comment" data-post="${p.id}" id="commentForm">
        <div class="small muted" id="replyInfo" hidden></div>
        <div class="row" style="align-items:flex-start">${avatar(S.user.name, S.user.color)}<textarea class="grow" name="body" required maxlength="3000" rows="2" placeholder="Yorumunu yaz…" aria-label="Yorum" style="min-height:44px"></textarea></div>
        <div style="text-align:right"><button class="btn primary">Gönder</button></div>
      </form></section>`;
}

// ---------- Sınıf ----------
async function tabClassroom() {
  const slug = C.community.slug;
  const { courses } = await api(`/communities/${encodeURIComponent(slug)}/courses`);
  return `<div class="row spread"><h2>Sınıf</h2></div>
    ${C.role === 'admin' ? `<details class="card adminbox"><summary>➕ Yeni kurs ekle</summary>
      <form class="stack" data-form="course">
        <div class="row" style="align-items:flex-end"><div style="width:80px"><label for="c-emoji">Simge</label><input id="c-emoji" type="text" name="emoji" value="📘" maxlength="4"></div>
        <div class="grow"><label for="c-title">Kurs adı</label><input id="c-title" type="text" name="title" required minlength="3" maxlength="80"></div></div>
        <div><label for="c-desc">Açıklama</label><textarea id="c-desc" name="description" maxlength="400" rows="2"></textarea></div>
        <button class="btn primary">Kursu oluştur</button></form></details>` : ''}
    <div class="grid" style="padding:0;grid-template-columns:repeat(auto-fill,minmax(230px,1fr))">
    ${courses.map(k => { const pct = k.total ? Math.round(k.done * 100 / k.total) : 0; return `
      <a class="card stack" href="#/c/${esc(slug)}/classroom/${k.id}">
        <div style="font-size:34px">${esc(k.emoji)}</div>
        <div><h3>${esc(k.title)}</h3><p class="small muted clamp">${esc(k.description)}</p></div>
        <div><div class="bar" role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100"><i style="width:${pct}%"></i></div><div class="small muted" style="margin-top:4px">${k.done}/${k.total} ders · %${pct}</div></div>
      </a>`; }).join('') || '<div class="card empty" style="grid-column:1/-1">Henüz kurs eklenmemiş.</div>'}</div>`;
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
      ${C.role === 'admin' ? `<details class="adminbox"><summary class="btn sm block">➕ Ders ekle</summary>
        <form class="stack" data-form="lesson" data-course="${course.id}">
          <div><label for="l-mod">Bölüm</label><input id="l-mod" type="text" name="module" required maxlength="60" list="mods" value="${esc(modules.at(-1) || '')}"><datalist id="mods">${modules.map(m => `<option value="${esc(m)}">`).join('')}</datalist></div>
          <div><label for="l-title">Ders adı</label><input id="l-title" type="text" name="title" required minlength="2" maxlength="100"></div>
          <div><label for="l-video">YouTube bağlantısı (isteğe bağlı)</label><input id="l-video" type="url" name="video" maxlength="200"></div>
          <div><label for="l-content">İçerik</label><textarea id="l-content" name="content" maxlength="10000" rows="5"></textarea></div>
          <button class="btn primary">Dersi ekle</button></form></details>
        <button class="btn sm danger" data-act="delCourse" data-id="${course.id}">Kursu sil</button>` : ''}
    </div>
    <div class="card stack">${cur ? `
      <div class="small muted">${esc(cur.module)}</div><h2>${esc(cur.title)}</h2>
      ${cur.video ? `<div class="video"><iframe src="https://www.youtube-nocookie.com/embed/${esc(cur.video)}" title="${esc(cur.title)}" allow="accelerometer; encrypted-media; picture-in-picture" allowfullscreen loading="lazy"></iframe></div>` : ''}
      <div class="body-text">${rich(cur.content)}</div>
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
    ${C.role === 'admin' ? `<details class="card adminbox"><summary>➕ Etkinlik ekle</summary>
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
  const { members } = await api(`/communities/${encodeURIComponent(C.community.slug)}/members`);
  return `<div class="row spread"><h2>Üyeler <span class="muted">(${members.length})</span></h2></div>
    <input type="search" placeholder="Üye ara…" data-input="memberFilter" aria-label="Üye ara">
    <div class="card stack" id="memberList">${members.map(u => `
      <a class="row" href="#/u/${u.id}" data-name="${esc(u.name.toLocaleLowerCase('tr'))}" style="align-items:flex-start">
        ${avatar(u.name, u.color, u.level)}
        <span class="grow"><b>${esc(u.name)}</b> ${u.role === 'admin' ? '<span class="tag gold">Yönetici</span>' : ''}<br><span class="small muted">${esc(u.bio)}</span></span>
        <span class="small muted" style="text-align:right;white-space:nowrap">${u.points} puan<br>${fmtDate(u.joined_at, { day: 'numeric', month: 'short', year: 'numeric' })}</span>
      </a>`).join('')}</div>`;
}

// ---------- Sıralama ----------
async function tabLeaderboard() {
  const d = await api(`/communities/${encodeURIComponent(C.community.slug)}/leaderboard`);
  const board = (title, rows) => `<div class="card stack"><h3>${title}</h3>${rows.map((u, i) => `
    <a class="row" href="#/u/${u.id}"><span class="rank ${i === 0 ? 'r1' : ''}">${i + 1}</span>${avatar(u.name, u.color, u.level, 'sm')}<span class="grow">${esc(u.name)}</span><b style="color:var(--accent)">+${u.points}</b></a>`).join('') || '<p class="muted small">Bu dönemde puan kazanan yok.</p>'}</div>`;
  const span = d.me.next ? d.me.next - d.me.floor : 1, pct = d.me.next ? Math.round((d.me.points - d.me.floor) * 100 / span) : 100;
  return `
    <div class="card stack">
      <div class="row">${avatar(S.user.name, S.user.color, d.me.level, 'lg')}<div class="grow"><h2>Seviye ${d.me.level} — ${esc(d.me.name)}</h2>
        <p class="muted small">${d.me.next ? `Sonraki seviyeye <b>${d.me.next - d.me.points}</b> puan kaldı` : 'En yüksek seviyedesin!'} · Toplam ${d.me.points} puan</p>
        <div class="bar" style="margin-top:8px"><i style="width:${pct}%"></i></div></div></div>
      <p class="small muted">Gönderilerine ve yorumlarına gelen her beğeni 1 puan kazandırır.</p>
      <div class="levels">${d.levels.map(l => `<div><span class="lvnum ${l.level <= d.me.level ? 'reached' : ''}">${l.level}</span><span class="small"><b>${esc(l.name)}</b><br><span class="muted">${l.min}+ puan · üyelerin %${l.pct}'i</span></span></div>`).join('')}</div>
    </div>
    <div class="boards">${board('Son 7 gün', d.week)}${board('Son 30 gün', d.month)}${board('Tüm zamanlar', d.all)}</div>`;
}

// ---------- Hakkında ----------
function tabAbout() {
  const c = C.community;
  return `<div class="card stack">
      <div class="row"><span class="cicon lg" style="--c:${esc(c.color)}">${esc(c.emoji)}</span><div class="grow"><h1>${esc(c.name)}</h1><p class="muted">${esc(c.tagline)}</p></div></div>
      <div class="row small muted" style="flex-wrap:wrap"><span class="tag">${esc(c.category)}</span><span>${c.is_private ? '🔒 Özel' : '🌍 Açık'}</span><span>👥 ${C.stats.members} üye</span><span>Kurucu: <b>${esc(C.owner.name)}</b></span><span>${fmtDate(c.created_at, { month: 'long', year: 'numeric' })}</span></div>
      <div class="body-text">${rich(c.description) || '<span class="muted">Açıklama eklenmemiş.</span>'}</div>
      ${C.role ? '' : `<div><button class="btn primary" data-act="join">Topluluğa katıl</button><p class="small muted" style="margin-top:8px">Gönderiler, kurslar ve etkinlikler yalnızca üyelere görünür.</p></div>`}
    </div>
    ${C.role === 'admin' ? `<details class="card adminbox"><summary>⚙️ Topluluk ayarları</summary>
      <form class="stack" data-form="settings">
        <div><label for="s-tag">Kısa tanım</label><input id="s-tag" type="text" name="tagline" maxlength="100" value="${esc(c.tagline)}"></div>
        <div><label for="s-desc">Açıklama</label><textarea id="s-desc" name="description" maxlength="3000" rows="6">${esc(c.description)}</textarea></div>
        <label class="check"><input type="checkbox" name="isPrivate" ${c.is_private ? 'checked' : ''}> Özel topluluk</label>
        <button class="btn primary">Kaydet</button></form></details>` : ''}`;
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
    await api(slugPath() + '/join', 'POST'); await refreshMe(); toast('Topluluğa katıldın 🎉'); go(`#/c/${C.community.slug}`);
  },
  async leave() { if (!confirm('Topluluktan ayrılmak istediğine emin misin?')) return; await api(slugPath() + '/leave', 'POST'); await refreshMe(); go('#/'); },
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
  async delComment(el) { if (!confirm('Yorum silinsin mi?')) return; await api('/comments/' + el.dataset.id, 'DELETE'); route(); },
  async delPost(el) { if (!confirm('Gönderi silinsin mi?')) return; await api('/posts/' + el.dataset.id, 'DELETE'); toast('Gönderi silindi'); go(`#/c/${C.community.slug}`); },
  async pin(el) { await api(`/posts/${el.dataset.id}/pin`, 'POST'); route(); },
  async complete(el) { await api(`/lessons/${el.dataset.id}/complete`, 'POST'); if (el.dataset.next) location.hash = el.dataset.next; else route(); },
  async delCourse(el) { if (!confirm('Kurs ve tüm dersleri silinsin mi?')) return; await api('/courses/' + el.dataset.id, 'DELETE'); go(`#/c/${C.community.slug}/classroom`); },
  calNav(el) { S.calMonth = new Date(S.calMonth.getFullYear(), S.calMonth.getMonth() + Number(el.dataset.d), 1); route(); },
  showEvent(el) {
    const card = $('#ev-' + el.dataset.id); if (!card) return;
    const d = card.closest('details'); if (d) d.open = true;
    card.scrollIntoView({ behavior: 'smooth', block: 'center' });
  },
  async delEvent(el) { if (!confirm('Etkinlik silinsin mi?')) return; await api('/events/' + el.dataset.id, 'DELETE'); route(); },
};
const forms = {
  discover(d) { discoverQ = d.q.trim(); route(); },
  async login(d) { await api('/auth/login', 'POST', d); await refreshMe(); go('#/'); },
  async register(d) { await api('/auth/register', 'POST', d); await refreshMe(); toast('Hoş geldin!'); go('#/'); },
  async newCommunity(d) { const r = await api('/communities', 'POST', { ...d, isPrivate: !!d.isPrivate }); await refreshMe(); toast('Topluluğun hazır 🎉'); go('#/c/' + r.slug); },
  async profile(d) { await api('/me', 'PUT', d); await refreshMe(); toast('Profil güncellendi'); route(); },
  async post(d) { const r = await api(slugPath() + '/posts', 'POST', d); go(`#/c/${C.community.slug}/p/${r.id}`); },
  feedSearch(d) { S.feed.q = d.q.trim(); route(); },
  async comment(d, form) { await api(`/posts/${form.dataset.post}/comments`, 'POST', { body: d.body, parentId: S.replyTo }); route(); },
  async course(d) { const r = await api(slugPath() + '/courses', 'POST', d); go(`#/c/${C.community.slug}/classroom/${r.id}`); },
  async lesson(d, form) { const r = await api(`/courses/${form.dataset.course}/lessons`, 'POST', d); go(`#/c/${C.community.slug}/classroom/${form.dataset.course}/${r.id}`); },
  async event(d) {
    const startsAt = new Date(d.when).getTime();
    await api(slugPath() + '/events', 'POST', { ...d, startsAt });
    S.calMonth = new Date(new Date(startsAt).getFullYear(), new Date(startsAt).getMonth(), 1);
    toast('Etkinlik eklendi'); route();
  },
  async settings(d) { await api(slugPath(), 'PUT', { ...d, isPrivate: !!d.isPrivate }); toast('Ayarlar kaydedildi'); route(); },
};

document.addEventListener('click', async ev => {
  const el = ev.target.closest('[data-act]');
  if (!ev.target.closest('.switcher') && S.menu) { S.menu = null; renderTop(); }
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
document.addEventListener('change', ev => {
  if (ev.target.dataset.change === 'feedSort') { S.feed.sort = ev.target.value; route(); }
});
document.addEventListener('input', ev => {
  if (ev.target.dataset.input !== 'memberFilter') return;
  const q = ev.target.value.trim().toLocaleLowerCase('tr');
  document.querySelectorAll('#memberList > a').forEach(a => { a.style.display = a.dataset.name.includes(q) ? '' : 'none'; });
});
document.addEventListener('keydown', ev => { if (ev.key === 'Escape' && S.menu) { S.menu = null; renderTop(); } });

window.addEventListener('hashchange', route);
refreshMe().then(route, route);
