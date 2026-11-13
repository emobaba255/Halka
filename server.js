const express = require('express');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
const { db, hashPassword, checkPassword, COLORS, DEFAULT_CATEGORIES, DATA_DIR } = require('./db');

const app = express();
app.set('trust proxy', 1); // barındırma hizmetinin vekil sunucusu arkasında gerçek IP ve https bilgisini al
app.disable('x-powered-by');
app.use(require('compression')()); // metin dosyalarını sıkıştırarak gönder (mobilde belirgin hız kazancı)
// Güvenlik başlıkları: sayfa başka sitelere gömülemez, yalnızca izin verilen kaynaklardan içerik yüklenir
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader('Content-Security-Policy', [
    "default-src 'self'", "script-src 'self'", "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com", "font-src 'self' https://fonts.gstatic.com",
    "img-src 'self' data: blob:", "media-src 'self' blob:", "frame-src https://www.youtube-nocookie.com", "connect-src 'self'",
    "object-src 'none'", "base-uri 'self'", "form-action 'self'", "frame-ancestors 'none'",
  ].join('; '));
  if (req.secure) res.setHeader('Strict-Transport-Security', 'max-age=15552000');
  next();
});
app.get('/healthz', (req, res) => res.type('text').send('ok'));
app.use('/api/upload', express.json({ limit: '6mb' }));
app.use('/api/upload-file', express.json({ limit: '12mb' }));
app.use(express.json({ limit: '200kb' }));

const all = (sql, ...p) => db.prepare(sql).all(...p);
const one = (sql, ...p) => db.prepare(sql).get(...p);
const run = (sql, ...p) => db.prepare(sql).run(...p);
const now = () => Date.now();

// ---------- Yardımcılar ----------
class HttpError extends Error { constructor(status, msg) { super(msg); this.status = status; } }
const fail = (status, msg) => { throw new HttpError(status, msg); };

function text(v, label, max, min = 1) {
  const s = typeof v === 'string' ? v.trim() : '';
  if (s.length < min) fail(400, `${label} gerekli`);
  if (s.length > max) fail(400, `${label} en fazla ${max} karakter olabilir`);
  return s;
}
const optText = (v, label, max) => text(v ?? '', label, max, 0);

const IMG_RE = /^\/uploads\/[a-f0-9]{32}\.(png|jpg|webp|gif)$/;
const img = v => (typeof v === 'string' && IMG_RE.test(v) ? v : '');
const UPL_RE = /^\/uploads\/[a-f0-9]{32}\.(png|jpg|webp|gif|pdf|zip|docx|xlsx|pptx|txt|csv|mp4|webm|mov)$/;
const VID_RE = /^\/uploads\/[a-f0-9]{32}\.(mp4|webm|mov)$/;
const vidUrl = v => (typeof v === 'string' && VID_RE.test(v) ? v : '');
const FILE_RE = /^\/uploads\/[a-f0-9]{32}\.(pdf|zip|docx|xlsx|pptx|txt|csv)$/;
const fileUrl = v => (typeof v === 'string' && FILE_RE.test(v) ? v : '');
const ytId = s => /(?:youtu\.be\/|youtube\.com\/(?:watch\?(?:\S*&)?v=|embed\/|shorts\/|live\/))([\w-]{11})/.exec(String(s || ''))?.[1] || '';
const newInvite = () => crypto.randomBytes(8).toString('hex');
const TAB_KEYS = ['classroom', 'calendar', 'members', 'leaderboard'];
const tabsOf = c => ({ classroom: 1, calendar: 1, members: 1, leaderboard: 1, ...(c.tabs ? JSON.parse(c.tabs) : {}) });
// Ücret: ücretsiz, aylık ya da tek seferlik
const MIN_PRICE = 5;
function parsePrice(b) {
  const type = ['monthly', 'once'].includes(b.priceType) ? b.priceType : 'free';
  if (type === 'free') return { type, amount: 0, label: '' };
  const amount = parseInt(b.priceAmount, 10);
  // Fiyatlar dolar olarak belirlenir ve gösterilir; ücretli üyelik en az MIN_PRICE dolar olabilir
  if (!Number.isInteger(amount) || amount < MIN_PRICE) fail(400, `Ücretli üyelik en az $${MIN_PRICE} olmalı (tam sayı)`);
  if (amount > 100000) fail(400, 'Ücret en fazla $100.000 olabilir');
  return { type, amount, label: type === 'monthly' ? `$${amount} / ay` : `$${amount} tek seferlik` };
}
const ICON_RE = /^i:[a-z]{2,12}:(blue|navy|gold)$/;
// Simge: hazır simge ("i:ad:renk"), yüklenmiş logo ya da (eski kayıtlar için) kısa bir emoji
function iconVal(v, fallback) {
  const s = typeof v === 'string' ? v.trim() : '';
  if (ICON_RE.test(s) || IMG_RE.test(s)) return s;
  return [...s].slice(0, 2).join('') || fallback;
}
// Görünürlük: 0 herkese açık, 1 özel (onayla katılım), 2 gizli (keşfette görünmez)
const visVal = v => (v === 'hidden' ? 2 : v === 'private' ? 1 : 0);
const sha256 = s => crypto.createHash('sha256').update(s).digest('hex');
function newPassword(v) {
  const p = typeof v === 'string' ? v : '';
  if (p.length < 8) fail(400, 'Şifre en az 8 karakter olmalı');
  if (p.length > 200) fail(400, 'Şifre çok uzun');
  return p;
}

// Yüklenen görseller
const UPLOADS = process.env.UPLOAD_DIR || path.join(DATA_DIR, 'uploads');
fs.mkdirSync(UPLOADS, { recursive: true });
const removeUpload = url => { if (typeof url === 'string' && UPL_RE.test(url)) fs.unlink(path.join(UPLOADS, path.basename(url)), () => {}); };

// Giriş / şifre sıfırlama için basit deneme sınırı (IP başına 10 dakikada 10 hatalı deneme)
const attempts = new Map();
function tooMany(req) {
  const a = attempts.get(req.ip);
  if (a && a.until > now() && a.n >= 10) fail(429, 'Çok fazla deneme yaptın. Birkaç dakika sonra tekrar dene.');
}
function strike(req) {
  const a = attempts.get(req.ip);
  if (!a || a.until < now()) attempts.set(req.ip, { n: 1, until: now() + 10 * 60e3 }); else a.n++;
}
setInterval(() => { for (const [k, a] of attempts) if (a.until < now()) attempts.delete(k); }, 60e3).unref();

// E-posta: SMTP_URL tanımlıysa gerçekten gönderilir, değilse sunucu günlüğüne yazılır
const mailer = process.env.SMTP_URL ? require('nodemailer').createTransport(process.env.SMTP_URL) : null;
async function sendMail(to, subject, body) {
  if (!mailer) return console.log(`[E-posta gönderilmedi: SMTP_URL ayarlı değil]\nKime: ${to}\nKonu: ${subject}\n${body}\n`);
  await mailer.sendMail({ from: process.env.MAIL_FROM || 'Okul <no-reply@localhost>', to, subject, text: body });
}

const LEVELS = [0, 10, 30, 75, 150, 300, 600, 1200, 2500];
const LEVEL_NAMES = ['Çaylak', 'Meraklı', 'Katılımcı', 'Destekçi', 'Usta', 'Rehber', 'Öncü', 'Efsane', 'Bilge'];
function levelOf(points) {
  let l = 1;
  for (let i = 0; i < LEVELS.length; i++) if (points >= LEVELS[i]) l = i + 1;
  return l;
}
function pointsMap(communityId, since = 0) {
  const m = new Map();
  for (const r of all('SELECT author_id, COUNT(*) n FROM likes WHERE community_id=? AND created_at>=? GROUP BY author_id', communityId, since)) m.set(r.author_id, r.n);
  return m;
}
function slugify(name) {
  const map = { ç: 'c', ğ: 'g', ı: 'i', ö: 'o', ş: 's', ü: 'u' };
  return name.toLocaleLowerCase('tr').replace(/[çğıöşü]/g, c => map[c]).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'topluluk';
}
// Kullanıcı tercihleri: bildirim grupları ve özel mesaj alma (varsayılan: hepsi açık)
const PREF_KEYS = ['likes', 'comments', 'live', 'membership', 'messages'];
function prefsOf(raw) {
  let p = {};
  try { p = raw ? JSON.parse(raw) : {}; } catch { /* bozuk kayıt: varsayılanlar */ }
  return Object.fromEntries(PREF_KEYS.map(k => [k, p[k] === 0 ? 0 : 1]));
}
const userPrefs = id => prefsOf(one('SELECT prefs FROM users WHERE id=?', id)?.prefs);
const NOTIFY_GROUP = { like_post: 'likes', like_comment: 'likes', comment: 'comments', reply: 'comments', live: 'live', request: 'membership', approved: 'membership' };
function notify(userId, actorId, type, postId, communityId) {
  if (userId === actorId) return;
  const group = NOTIFY_GROUP[type];
  if (group && !userPrefs(userId)[group]) return; // kullanıcı bu tür bildirimi kapatmış
  run('INSERT INTO notifications(user_id,actor_id,type,post_id,community_id,created_at) VALUES(?,?,?,?,?,?)', userId, actorId, type, postId, communityId, now());
}
// Ders kaynakları: bağlantılar (her satır "Başlık | adres" ya da yalnızca adres) ve dosyalar
function parseLinks(v) {
  const out = [];
  for (const raw of String(v ?? '').split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    if (out.length >= 20) fail(400, 'Bir derse en fazla 20 bağlantı eklenebilir');
    const i = line.lastIndexOf('|');
    const title = i > -1 ? line.slice(0, i).trim() : '';
    let url = (i > -1 ? line.slice(i + 1) : line).trim(), u = null;
    if (!/^https?:\/\//i.test(url)) url = 'https://' + url;
    try { u = new URL(url); } catch { /* aşağıda reddedilir */ }
    if (!u || !/^https?:$/.test(u.protocol) || !u.hostname.includes('.') || url.length > 500) fail(400, `Bağlantı geçersiz: ${line.slice(0, 60)}`);
    out.push({ title: (title || u.hostname.replace(/^www\./, '')).slice(0, 80), url: u.href });
  }
  return out;
}
function parseFiles(v) {
  if (!Array.isArray(v)) return [];
  if (v.length > 10) fail(400, 'Bir derse en fazla 10 dosya eklenebilir');
  return v.map(f => ({ url: fileUrl(f?.url), name: optText(f?.name, 'Dosya adı', 120) || 'dosya' })).filter(f => f.url);
}
const lessonFiles = l => [...(l.file ? [{ url: l.file, name: l.file_name }] : []), ...(l.files ? JSON.parse(l.files) : [])];
const lessonOut = ({ file, file_name, ...l }) => ({ ...l, files: lessonFiles({ file, file_name, files: l.files }), links: l.links ? JSON.parse(l.links) : [] });
const removeLessonUploads = l => { lessonFiles(l).forEach(f => removeUpload(f.url)); removeUpload(l.image); removeUpload(l.video_file); };

// ---------- Oturum ----------
const SESSION_MS = 30 * 864e5; // oturumlar 30 gün geçerli
const sweepSessions = () => { run('DELETE FROM sessions WHERE created_at<?', now() - SESSION_MS); run('DELETE FROM resets WHERE expires_at<?', now()); };
sweepSessions(); setInterval(sweepSessions, 6 * 3600e3).unref();
app.use((req, res, next) => {
  const m = /(?:^|;\s*)sid=([a-f0-9]{48})/.exec(req.headers.cookie || '');
  req.user = m ? one('SELECT u.id,u.name,u.email,u.bio,u.color,u.avatar,u.title,u.link,u.prefs FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token=? AND s.created_at>?', m[1], now() - SESSION_MS) || null : null;
  req.sid = m ? m[1] : null;
  next();
});
function startSession(res, userId) {
  const token = crypto.randomBytes(24).toString('hex');
  run('INSERT INTO sessions(token,user_id,created_at) VALUES(?,?,?)', token, userId, now());
  res.setHeader('Set-Cookie', `sid=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${60 * 60 * 24 * 30}${res.req.secure ? '; Secure' : ''}`);
}
const auth = (req, res, next) => req.user ? next() : res.status(401).json({ error: 'Önce giriş yapmalısın' });

// İstek sınırı: aynı kullanıcı (ya da giriş yapmamışsa aynı IP) belirli sürede en çok `max` istek yapabilir
function limiter(max, windowMs, message) {
  const hits = new Map();
  setInterval(() => { const t = now(); for (const [k, h] of hits) if (h.until < t) hits.delete(k); }, 60e3).unref();
  return (req, res, next) => {
    const key = req.user ? 'u' + req.user.id : 'ip' + req.ip, t = now(), h = hits.get(key);
    if (!h || h.until < t) hits.set(key, { n: 1, until: t + windowMs });
    else if (++h.n > max) return res.status(429).json({ error: message });
    next();
  };
}
const writeLimit = limiter(600, 5 * 60e3, 'Çok hızlı işlem yapıyorsun. Birkaç dakika sonra tekrar dene.');
const registerLimit = limiter(30, 60 * 60e3, 'Bu ağdan çok fazla hesap açıldı. Daha sonra tekrar dene.');
const messageLimit = limiter(40, 60e3, 'Çok hızlı mesaj gönderiyorsun. Biraz bekle.');
// Veri değiştiren tüm isteklere genel sınır (video parçaları hariç; onların kendi denetimi var)
app.use('/api', (req, res, next) => (req.method === 'GET' || req.path.startsWith('/video/') ? next() : writeLimit(req, res, next)));

function loadCommunity(req, res, next) {
  const c = one('SELECT * FROM communities WHERE slug=?', req.params.slug);
  if (!c) return res.status(404).json({ error: 'Topluluk bulunamadı' });
  req.c = c;
  const m = req.user ? membership(req.user.id, c.id) : { role: null, expired: false, paid_until: 0 };
  req.role = m.role; req.expired = m.expired; req.paidUntil = m.paid_until;
  next();
}
const member = (req, res, next) => req.role ? next() : res.status(403).json({ error: 'Bu içerik yalnızca üyelere açık' });
const admin = (req, res, next) => req.role === 'admin' ? next() : res.status(403).json({ error: 'Bu işlem için yönetici olmalısın' });
// Süresi dolmuş ücretli üyelik, yenilenene kadar üye sayılmaz (yöneticiler hariç)
function membership(userId, communityId) {
  const m = one('SELECT role, paid_until FROM memberships WHERE user_id=? AND community_id=?', userId, communityId);
  if (!m) return { role: null, expired: false, paid_until: 0 };
  const expired = m.role !== 'admin' && m.paid_until > 0 && m.paid_until < now();
  return { role: expired ? null : m.role, expired, paid_until: m.paid_until };
}
const roleIn = (userId, communityId) => membership(userId, communityId).role;

// ---------- Kimlik ----------
app.post('/api/auth/register', registerLimit, (req, res) => {
  const name = text(req.body.name, 'Ad', 60, 2);
  const email = text(req.body.email, 'E-posta', 120, 5).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail(400, 'Geçerli bir e-posta gir');
  const password = typeof req.body.password === 'string' ? req.body.password : '';
  if (password.length < 8) fail(400, 'Şifre en az 8 karakter olmalı');
  if (one('SELECT 1 FROM users WHERE email=?', email)) fail(409, 'Bu e-posta zaten kayıtlı');
  const color = COLORS[crypto.randomInt(COLORS.length)];
  const id = Number(run('INSERT INTO users(name,email,pass,color,created_at) VALUES(?,?,?,?,?)', name, email, hashPassword(password), color, now()).lastInsertRowid);
  startSession(res, id);
  res.json({ ok: true });
});
app.post('/api/auth/login', (req, res) => {
  tooMany(req);
  const email = String(req.body.email || '').trim().toLowerCase();
  const u = one('SELECT id,pass FROM users WHERE email=?', email);
  if (!u || !checkPassword(String(req.body.password || ''), u.pass)) { strike(req); fail(401, 'E-posta veya şifre hatalı'); }
  startSession(res, u.id);
  res.json({ ok: true });
});
app.post('/api/auth/logout', (req, res) => {
  if (req.sid) run('DELETE FROM sessions WHERE token=?', req.sid);
  res.setHeader('Set-Cookie', 'sid=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0');
  res.json({ ok: true });
});
const hasDemo = () => !!one("SELECT 1 FROM users WHERE email='demo@okul.app'");
app.get('/api/me', (req, res) => {
  if (!req.user) return res.json({ user: null, communities: [], unread: 0, demo: hasDemo() });
  res.json({
    user: { ...req.user, prefs: prefsOf(req.user.prefs) },
    communities: all('SELECT c.slug,c.name,c.emoji,c.color FROM memberships m JOIN communities c ON c.id=m.community_id WHERE m.user_id=? ORDER BY m.joined_at', req.user.id),
    unread: one('SELECT COUNT(*) n FROM notifications WHERE user_id=? AND is_read=0', req.user.id).n,
    unreadMessages: one('SELECT COUNT(*) n FROM messages WHERE to_id=? AND is_read=0', req.user.id).n,
    demo: hasDemo(),
  });
});
app.put('/api/me', auth, (req, res) => {
  let link = optText(req.body.link, 'Bağlantı', 200);
  if (link) {
    if (!/^https?:\/\//i.test(link)) link = 'https://' + link;
    let ok = false;
    try { ok = /^https?:$/.test(new URL(link).protocol) && new URL(link).hostname.includes('.'); } catch { /* geçersiz adres */ }
    if (!ok) fail(400, 'Geçerli bir bağlantı gir (örn. ornek.com)');
  }
  run('UPDATE users SET name=?, title=?, bio=?, link=? WHERE id=?', text(req.body.name, 'Ad', 60, 2), optText(req.body.title, 'Unvan', 60), optText(req.body.bio, 'Hakkında', 300), link, req.user.id);
  res.json({ ok: true });
});
app.put('/api/me/prefs', auth, (req, res) => {
  const p = Object.fromEntries(PREF_KEYS.map(k => [k, req.body[k] === false || req.body[k] === 0 ? 0 : 1]));
  run('UPDATE users SET prefs=? WHERE id=?', JSON.stringify(p), req.user.id);
  res.json({ prefs: p });
});
app.put('/api/me/email', auth, (req, res) => {
  tooMany(req);
  const u = one('SELECT pass FROM users WHERE id=?', req.user.id);
  if (!checkPassword(String(req.body.password || ''), u.pass)) { strike(req); fail(400, 'Şifre hatalı'); }
  const email = text(req.body.email, 'E-posta', 120, 5).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail(400, 'Geçerli bir e-posta gir');
  if (one('SELECT 1 FROM users WHERE email=? AND id<>?', email, req.user.id)) fail(409, 'Bu e-posta başka bir hesapta kayıtlı');
  run('UPDATE users SET email=? WHERE id=?', email, req.user.id);
  run('DELETE FROM resets WHERE user_id=?', req.user.id);
  res.json({ ok: true });
});
app.put('/api/me/avatar', auth, (req, res) => {
  const avatar = img(req.body.avatar);
  if (req.user.avatar && req.user.avatar !== avatar) removeUpload(req.user.avatar);
  run('UPDATE users SET avatar=? WHERE id=?', avatar, req.user.id);
  res.json({ ok: true });
});
// Hesabı silme: kişisel bilgiler ve oturumlar silinir; gönderi ve yorumlar "Silinmiş kullanıcı" adıyla kalır
app.delete('/api/me', auth, (req, res) => {
  const u = one('SELECT pass FROM users WHERE id=?', req.user.id);
  if (!checkPassword(String(req.body?.password || ''), u.pass)) fail(400, 'Şifre hatalı');
  if (one('SELECT 1 FROM communities WHERE owner_id=?', req.user.id)) fail(400, 'Önce kurduğun toplulukları silmelisin (Yönetim paneli → Ayarlar → Tehlikeli bölge)');
  const id = req.user.id;
  removeUpload(req.user.avatar);
  for (const t of ['sessions', 'memberships', 'join_requests', 'resets', 'poll_votes', 'progress', 'live_chat']) run(`DELETE FROM ${t} WHERE user_id=?`, id);
  run('DELETE FROM likes WHERE user_id=?', id);
  run('DELETE FROM notifications WHERE user_id=? OR actor_id=?', id, id);
  run('DELETE FROM messages WHERE from_id=? OR to_id=?', id, id);
  run("UPDATE users SET name='Silinmiş kullanıcı', email=?, pass=?, bio='', title='', link='', avatar='' WHERE id=?", `silindi-${id}-${crypto.randomBytes(6).toString('hex')}@silindi.invalid`, hashPassword(crypto.randomBytes(24).toString('hex')), id);
  res.setHeader('Set-Cookie', 'sid=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0');
  res.json({ ok: true });
});
app.put('/api/me/password', auth, (req, res) => {
  const u = one('SELECT pass FROM users WHERE id=?', req.user.id);
  if (!checkPassword(String(req.body.current || ''), u.pass)) fail(400, 'Mevcut şifre hatalı');
  run('UPDATE users SET pass=? WHERE id=?', hashPassword(newPassword(req.body.next)), req.user.id);
  run('DELETE FROM sessions WHERE user_id=? AND token<>?', req.user.id, req.sid); // diğer cihazlardan çıkış
  res.json({ ok: true });
});

// ---------- Şifre sıfırlama ----------
app.post('/api/auth/forgot', (req, res) => {
  tooMany(req); strike(req);
  const email = String(req.body.email || '').trim().toLowerCase();
  const u = one('SELECT id FROM users WHERE email=?', email);
  if (u) {
    const token = crypto.randomBytes(24).toString('hex');
    run('DELETE FROM resets WHERE user_id=?', u.id);
    run('INSERT INTO resets(token,user_id,expires_at) VALUES(?,?,?)', sha256(token), u.id, now() + 3600e3);
    // Yayında BASE_URL ortam değişkenini sitenin adresiyle ayarla
    const base = process.env.BASE_URL || `${req.protocol}://${req.get('host')}`;
    sendMail(email, 'Okul — şifre sıfırlama', `Şifreni sıfırlamak için bu bağlantıyı aç (1 saat geçerli):\n${base}/#/reset/${token}\n\nBu isteği sen yapmadıysan bu e-postayı yok sayabilirsin.`)
      .catch(e => console.error('E-posta gönderilemedi:', e.message));
  }
  res.json({ ok: true, mail: !!mailer }); // hesap var mı yok mu belli edilmez
});
app.post('/api/auth/reset', (req, res) => {
  tooMany(req);
  const r = one('SELECT user_id FROM resets WHERE token=? AND expires_at>?', sha256(String(req.body.token || '')), now());
  if (!r) { strike(req); fail(400, 'Bağlantı geçersiz ya da süresi dolmuş'); }
  run('UPDATE users SET pass=? WHERE id=?', hashPassword(newPassword(req.body.password)), r.user_id);
  run('DELETE FROM resets WHERE user_id=?', r.user_id);
  run('DELETE FROM sessions WHERE user_id=?', r.user_id);
  res.json({ ok: true });
});

// ---------- Görsel yükleme ----------
app.post('/api/upload', auth, (req, res) => {
  const m = /^data:image\/(png|jpeg|webp|gif);base64,([A-Za-z0-9+/=]+)$/.exec(String(req.body.dataUrl || ''));
  if (!m) fail(400, 'Yalnızca PNG, JPEG, WebP veya GIF yüklenebilir');
  const buf = Buffer.from(m[2], 'base64');
  if (buf.length > 4 * 1024 * 1024) fail(400, 'Görsel en fazla 4 MB olabilir');
  // Dosyanın ilk baytları bildirilen türle uyuşmalı (uzantısı değiştirilmiş dosyalar reddedilir)
  const head = buf.subarray(0, 12).toString('latin1');
  const real = head.startsWith('\x89PNG') ? 'png' : head.startsWith('\xff\xd8\xff') ? 'jpeg' : head.startsWith('GIF8') ? 'gif' : head.startsWith('RIFF') && head.slice(8, 12) === 'WEBP' ? 'webp' : '';
  if (real !== m[1]) fail(400, 'Dosya geçerli bir görsel değil');
  const name = crypto.randomBytes(16).toString('hex') + '.' + (m[1] === 'jpeg' ? 'jpg' : m[1]);
  fs.writeFileSync(path.join(UPLOADS, name), buf);
  res.json({ url: '/uploads/' + name });
});
app.use('/uploads', express.static(UPLOADS, { maxAge: '30d', setHeaders: (res, p) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  if (!/\.(png|jpg|webp|gif|mp4|webm|mov)$/.test(p)) res.setHeader('Content-Disposition', 'attachment'); // belgeler tarayıcıda açılmaz, indirilir
} }));

// ---------- Özel mesajlar ----------
// Yalnızca ortak bir topluluğu olan (ya da daha önce yazışmış) kişiler mesajlaşabilir
const canMessage = (a, b) => a !== b && !!(
  one('SELECT 1 FROM memberships x JOIN memberships y ON x.community_id=y.community_id WHERE x.user_id=? AND y.user_id=?', a, b) ||
  one('SELECT 1 FROM messages WHERE (from_id=? AND to_id=?) OR (from_id=? AND to_id=?)', a, b, b, a));
app.get('/api/messages', auth, (req, res) => {
  const me = req.user.id;
  res.json({
    conversations: all(`SELECT u.id,u.name,u.color,u.avatar,m.body,m.created_at,m.from_id,
      (SELECT COUNT(*) FROM messages x WHERE x.from_id=u.id AND x.to_id=? AND x.is_read=0) unread
      FROM messages m JOIN users u ON u.id = CASE WHEN m.from_id=? THEN m.to_id ELSE m.from_id END
      WHERE m.id IN (SELECT MAX(id) FROM messages WHERE from_id=? OR to_id=? GROUP BY CASE WHEN from_id=? THEN to_id ELSE from_id END)
      ORDER BY m.id DESC LIMIT 100`, me, me, me, me, me),
  });
});
app.get('/api/messages/:userId', auth, (req, res) => {
  const other = one('SELECT id,name,color,avatar FROM users WHERE id=?', Number(req.params.userId));
  if (!other) fail(404, 'Kullanıcı bulunamadı');
  if (!canMessage(req.user.id, other.id)) fail(403, 'Yalnızca ortak topluluğun olan kişilere mesaj gönderebilirsin');
  run('UPDATE messages SET is_read=1 WHERE from_id=? AND to_id=? AND is_read=0', other.id, req.user.id);
  const messages = all(`SELECT id,from_id,body,created_at FROM messages WHERE (from_id=? AND to_id=?) OR (from_id=? AND to_id=?)
    ORDER BY id DESC LIMIT 200`, req.user.id, other.id, other.id, req.user.id).reverse();
  res.json({ user: other, messages });
});
app.post('/api/messages/:userId', auth, messageLimit, (req, res) => {
  const other = one('SELECT id FROM users WHERE id=?', Number(req.params.userId));
  if (!other) fail(404, 'Kullanıcı bulunamadı');
  if (!canMessage(req.user.id, other.id)) fail(403, 'Yalnızca ortak topluluğun olan kişilere mesaj gönderebilirsin');
  if (!userPrefs(other.id).messages) fail(403, 'Bu kullanıcı özel mesaj almıyor');
  run('INSERT INTO messages(from_id,to_id,body,created_at) VALUES(?,?,?,?)', req.user.id, other.id, text(req.body.body, 'Mesaj', 4000), now());
  res.json({ ok: true });
});

// ---------- Bildirimler ----------
app.get('/api/notifications', auth, (req, res) => {
  const items = all(`SELECT n.id,n.type,n.is_read,n.created_at,n.post_id,u.name actor_name,u.color actor_color,u.avatar actor_avatar,p.title post_title,c.slug,c.name community_name
    FROM notifications n JOIN users u ON u.id=n.actor_id LEFT JOIN posts p ON p.id=n.post_id JOIN communities c ON c.id=n.community_id
    WHERE n.user_id=? ORDER BY n.created_at DESC LIMIT 30`, req.user.id);
  run('UPDATE notifications SET is_read=1 WHERE user_id=?', req.user.id);
  res.json({ items });
});

// ---------- Topluluklar ----------
app.get('/api/communities', (req, res) => {
  const q = `%${String(req.query.q || '').trim()}%`, cat = String(req.query.category || '').trim();
  res.json({
    items: all(`SELECT c.slug,c.name,c.tagline,c.emoji,c.color,c.category,c.is_private,c.price_text,c.cover,(c.live_video<>'') live,
      (SELECT COUNT(*) FROM memberships m WHERE m.community_id=c.id) members,
      (SELECT COUNT(*) FROM courses k WHERE k.community_id=c.id) courses
      FROM communities c WHERE (c.name LIKE ? OR c.tagline LIKE ? OR c.category LIKE ?) AND (?='' OR c.category=?)
        AND (c.is_private<2 OR EXISTS(SELECT 1 FROM memberships x WHERE x.community_id=c.id AND x.user_id=?))
      ORDER BY members DESC, c.created_at DESC LIMIT 60`, q, q, q, cat, cat, req.user?.id ?? 0),
  });
});
app.post('/api/communities', auth, (req, res) => {
  const name = text(req.body.name, 'Topluluk adı', 50, 3);
  const tagline = optText(req.body.tagline, 'Kısa tanım', 100);
  const description = optText(req.body.description, 'Açıklama', 3000);
  const category = optText(req.body.category, 'Kategori', 30) || 'Genel';
  const emoji = iconVal(req.body.emoji, 'i:cap:blue');
  const price = parsePrice(req.body);
  let slug = slugify(name), n = 1;
  while (one('SELECT 1 FROM communities WHERE slug=?', slug)) slug = `${slugify(name)}-${++n}`;
  const id = Number(run(`INSERT INTO communities(slug,name,tagline,description,category,is_private,price_type,price_amount,price_text,pay_info,invite_code,categories,owner_id,color,emoji,created_at)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    slug, name, tagline, description, category, visVal(req.body.visibility), price.type, price.amount, price.label, optText(req.body.payInfo, 'Ödeme bilgisi', 1000),
    newInvite(), JSON.stringify(DEFAULT_CATEGORIES), req.user.id, COLORS[crypto.randomInt(COLORS.length)], emoji, now()).lastInsertRowid);
  run('INSERT INTO memberships(user_id,community_id,role,joined_at) VALUES(?,?,?,?)', req.user.id, id, 'admin', now());
  res.json({ slug });
});
app.get('/api/communities/:slug', loadCommunity, (req, res) => {
  const c = req.c;
  const pts = pointsMap(c.id);
  const top = all('SELECT u.id,u.name,u.color,u.avatar FROM memberships m JOIN users u ON u.id=m.user_id WHERE m.community_id=?', c.id)
    .map(u => ({ ...u, points: pts.get(u.id) || 0 })).sort((a, b) => b.points - a.points).slice(0, 5)
    .map(u => ({ ...u, level: levelOf(u.points) }));
  const myPoints = req.user ? pts.get(req.user.id) || 0 : 0;
  const pending = !!req.user && !req.role && !!one('SELECT 1 FROM join_requests WHERE user_id=? AND community_id=?', req.user.id, c.id);
  res.json({
    community: { slug: c.slug, name: c.name, tagline: c.tagline, description: c.description, category: c.category, is_private: c.is_private, rules: c.rules, price_text: c.price_text, price_type: c.price_type, price_amount: c.price_amount, pay_info: req.role || pending || req.expired ? c.pay_info : '',
      tabs: tabsOf(c), post_role: c.post_role, cover: c.cover, live: c.live_video ? { title: c.live_title, started: c.live_started } : null, color: c.color, emoji: c.emoji, created_at: c.created_at, categories: JSON.parse(c.categories) },
    role: req.role,
    pending, expired: req.expired, paid_until: req.role ? req.paidUntil : 0,
    requests: req.role === 'admin' ? one('SELECT COUNT(*) n FROM join_requests WHERE community_id=?', c.id).n : 0,
    owner: one('SELECT id,name,color,avatar FROM users WHERE id=?', c.owner_id),
    stats: {
      members: one('SELECT COUNT(*) n FROM memberships WHERE community_id=?', c.id).n,
      posts: one('SELECT COUNT(*) n FROM posts WHERE community_id=?', c.id).n,
      courses: one('SELECT COUNT(*) n FROM courses WHERE community_id=?', c.id).n,
    },
    top,
    me: req.role ? { points: myPoints, level: levelOf(myPoints), posts: one('SELECT COUNT(*) n FROM posts WHERE community_id=? AND user_id=?', c.id, req.user.id).n } : null,
    nextEvent: req.role ? one('SELECT id,title,starts_at FROM events WHERE community_id=? AND starts_at>=? ORDER BY starts_at LIMIT 1', c.id, now()) || null : null,
  });
});
app.put('/api/communities/:slug', auth, loadCommunity, admin, (req, res) => {
  const b = req.body, c = req.c;
  const cats = [...new Set(String(b.categories ?? '').split(',').map(s => s.trim()).filter(Boolean))];
  if (cats.length < 1 || cats.length > 8 || cats.some(x => x.length > 24)) fail(400, 'En az 1, en fazla 8 gönderi kategorisi yaz (her biri en çok 24 karakter)');
  const tabs = {};
  for (const k of TAB_KEYS) tabs[k] = b.tabs?.[k] ? 1 : 0;
  const cover = b.cover === undefined ? c.cover : img(b.cover);
  if (c.cover && c.cover !== cover) removeUpload(c.cover);
  const emoji = iconVal(b.emoji, 'i:cap:blue');
  if (c.emoji !== emoji) removeUpload(c.emoji);
  run('UPDATE communities SET name=?, tagline=?, description=?, rules=?, category=?, emoji=?, is_private=?, categories=?, tabs=?, post_role=?, cover=? WHERE id=?',
    text(b.name, 'Topluluk adı', 50, 3), optText(b.tagline, 'Kısa tanım', 100), optText(b.description, 'Açıklama', 3000), optText(b.rules, 'Kurallar', 2000), optText(b.category, 'Kategori', 30) || 'Genel',
    emoji, visVal(b.visibility), JSON.stringify(cats), JSON.stringify(tabs), b.postRole === 'admin' ? 'admin' : 'member', cover, c.id);
  res.json({ ok: true });
});
// Topluluğu kalıcı olarak silme: yalnızca kurucu
app.delete('/api/communities/:slug', auth, loadCommunity, (req, res) => {
  if (req.user.id !== req.c.owner_id) fail(403, 'Topluluğu yalnızca kurucusu silebilir');
  for (const p of all("SELECT image, file FROM posts WHERE community_id=? AND (image<>'' OR file<>'')", req.c.id)) { removeUpload(p.image); removeUpload(p.file); }
  all('SELECT l.* FROM lessons l JOIN courses k ON k.id=l.course_id WHERE k.community_id=?', req.c.id).forEach(removeLessonUploads);
  removeUpload(req.c.cover); removeUpload(req.c.emoji);
  run('DELETE FROM likes WHERE community_id=?', req.c.id);
  run('DELETE FROM notifications WHERE community_id=?', req.c.id);
  run('DELETE FROM communities WHERE id=?', req.c.id); // gönderi, kurs, üyelik vb. bağlı kayıtlar birlikte silinir
  res.json({ ok: true });
});
app.put('/api/communities/:slug/cover', auth, loadCommunity, admin, (req, res) => {
  const cover = img(req.body.cover);
  if (req.c.cover && req.c.cover !== cover) removeUpload(req.c.cover);
  run('UPDATE communities SET cover=? WHERE id=?', cover, req.c.id);
  res.json({ ok: true });
});
app.put('/api/communities/:slug/pricing', auth, loadCommunity, admin, (req, res) => {
  const price = parsePrice(req.body);
  run('UPDATE communities SET price_type=?, price_amount=?, price_text=?, pay_info=? WHERE id=?', price.type, price.amount, price.label, optText(req.body.payInfo, 'Ödeme bilgisi', 1000), req.c.id);
  res.json({ ok: true });
});
// Açık topluluklara doğrudan katılınır; özel ya da ücretli topluluklarda yönetici onayı gerekir
app.post('/api/communities/:slug/join', auth, loadCommunity, (req, res) => {
  if (req.role) return res.json({ ok: true });
  if (req.c.is_private || req.c.price_text) {
    const had = one('SELECT 1 FROM join_requests WHERE user_id=? AND community_id=?', req.user.id, req.c.id);
    run('INSERT OR REPLACE INTO join_requests(user_id,community_id,note,created_at) VALUES(?,?,?,?)', req.user.id, req.c.id, optText(req.body?.note, 'Not', 300), now());
    if (!had) for (const a of all("SELECT user_id FROM memberships WHERE community_id=? AND role='admin'", req.c.id)) notify(a.user_id, req.user.id, 'request', 0, req.c.id);
    return res.json({ pending: true });
  }
  run('INSERT OR REPLACE INTO memberships(user_id,community_id,role,joined_at) VALUES(?,?,?,?)', req.user.id, req.c.id, 'member', now());
  res.json({ ok: true });
});
app.delete('/api/communities/:slug/join', auth, loadCommunity, (req, res) => {
  run('DELETE FROM join_requests WHERE user_id=? AND community_id=?', req.user.id, req.c.id);
  res.json({ ok: true });
});
app.post('/api/communities/:slug/requests/:userId', auth, loadCommunity, admin, (req, res) => {
  const uid = Number(req.params.userId);
  if (!one('SELECT 1 FROM join_requests WHERE user_id=? AND community_id=?', uid, req.c.id)) fail(404, 'İstek bulunamadı');
  run('DELETE FROM join_requests WHERE user_id=? AND community_id=?', uid, req.c.id);
  if (req.body?.approve) {
    // Aylık ücretli toplulukta onay, üyeliği 30 gün açar (yenilemede kalan sürenin üstüne eklenir)
    const prev = one('SELECT paid_until FROM memberships WHERE user_id=? AND community_id=?', uid, req.c.id);
    const until = req.c.price_type === 'monthly' ? Math.max(now(), prev?.paid_until || 0) + 30 * 864e5 : 0;
    if (prev) run('UPDATE memberships SET paid_until=? WHERE user_id=? AND community_id=?', until, uid, req.c.id);
    else run('INSERT INTO memberships(user_id,community_id,role,joined_at,paid_until) VALUES(?,?,?,?,?)', uid, req.c.id, 'member', now(), until);
    notify(uid, req.user.id, 'approved', 0, req.c.id);
  }
  res.json({ ok: true });
});
app.delete('/api/communities/:slug/members/:userId', auth, loadCommunity, admin, (req, res) => {
  const uid = Number(req.params.userId);
  if (uid === req.c.owner_id || uid === req.user.id) fail(400, 'Bu üye çıkarılamaz');
  run('DELETE FROM memberships WHERE user_id=? AND community_id=?', uid, req.c.id);
  res.json({ ok: true });
});
app.post('/api/communities/:slug/leave', auth, loadCommunity, member, (req, res) => {
  if (req.c.owner_id === req.user.id) fail(400, 'Topluluğun kurucusu ayrılamaz');
  run('DELETE FROM memberships WHERE user_id=? AND community_id=?', req.user.id, req.c.id);
  res.json({ ok: true });
});

// ---------- Akış ----------
const POST_SELECT = `SELECT p.id,p.title,p.body,p.category,p.pinned,p.created_at,p.user_id,p.image,p.poll,p.file,p.file_name,u.name author_name,u.color author_color,u.avatar author_avatar,
  (SELECT COUNT(*) FROM likes l WHERE l.target_type='post' AND l.target_id=p.id) likes,
  (SELECT COUNT(*) FROM comments c WHERE c.post_id=p.id) comments,
  (SELECT COUNT(*) FROM likes l WHERE l.target_type='post' AND l.target_id=p.id AND l.user_id=?) liked
  FROM posts p JOIN users u ON u.id=p.user_id`;

app.get('/api/communities/:slug/posts', auth, loadCommunity, member, (req, res) => {
  const where = ['p.community_id=?'], params = [req.user.id, req.c.id];
  if (req.query.category) { where.push('p.category=?'); params.push(String(req.query.category)); }
  if (req.query.q) { where.push('(p.title LIKE ? OR p.body LIKE ?)'); const q = `%${String(req.query.q)}%`; params.push(q, q); }
  const order = req.query.sort === 'top' ? 'likes DESC, p.created_at DESC' : 'p.created_at DESC';
  const pts = pointsMap(req.c.id);
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 20, 1), 300);
  const rows = all(`${POST_SELECT} WHERE ${where.join(' AND ')} ORDER BY p.pinned DESC, ${order} LIMIT ?`, ...params, limit + 1);
  const posts = rows.slice(0, limit).map(p => ({ ...p, poll: !!p.poll, author_level: levelOf(pts.get(p.user_id) || 0) }));
  res.json({ posts, more: rows.length > limit });
});
app.post('/api/communities/:slug/posts', auth, loadCommunity, member, (req, res) => {
  const cats = JSON.parse(req.c.categories);
  const category = cats.includes(req.body.category) ? req.body.category : cats[0];
  if (req.c.post_role === 'admin' && req.role !== 'admin') fail(403, 'Bu toplulukta yalnızca yöneticiler gönderi paylaşabilir');
  let poll = '';
  if (Array.isArray(req.body.poll) && req.body.poll.length) {
    const opts = req.body.poll.map(o => optText(o, 'Anket seçeneği', 80)).filter(Boolean);
    if (opts.length < 2 || opts.length > 6) fail(400, 'Anket 2 ile 6 arasında seçenek içermeli');
    poll = JSON.stringify(opts);
  }
  const file = fileUrl(req.body.file);
  const id = Number(run('INSERT INTO posts(community_id,user_id,title,body,category,image,poll,file,file_name,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)',
    req.c.id, req.user.id, text(req.body.title, 'Başlık', 140, 3), text(req.body.body, 'İçerik', 8000), category, img(req.body.image), poll,
    file, file ? optText(req.body.fileName, 'Dosya adı', 120) || 'dosya' : '', now()).lastInsertRowid);
  res.json({ id });
});

function loadPost(req, res, next) {
  const p = one('SELECT * FROM posts WHERE id=?', Number(req.params.id));
  if (!p) return res.status(404).json({ error: 'Gönderi bulunamadı' });
  req.post = p;
  req.role = roleIn(req.user.id, p.community_id);
  next();
}
app.get('/api/posts/:id', auth, loadPost, member, (req, res) => {
  const cid = req.post.community_id, pts = pointsMap(cid);
  const post = one(`${POST_SELECT} WHERE p.id=?`, req.user.id, req.post.id);
  post.author_level = levelOf(pts.get(post.user_id) || 0);
  if (post.poll) {
    const opts = JSON.parse(post.poll), counts = Array(opts.length).fill(0);
    for (const v of all('SELECT option_idx, COUNT(*) n FROM poll_votes WHERE post_id=? GROUP BY option_idx', post.id)) if (v.option_idx < opts.length) counts[v.option_idx] = v.n;
    post.poll = { options: opts.map((t, i) => ({ text: t, votes: counts[i] })), total: counts.reduce((a, b) => a + b, 0),
      my: one('SELECT option_idx FROM poll_votes WHERE post_id=? AND user_id=?', post.id, req.user.id)?.option_idx ?? null };
  } else post.poll = null;
  const comments = all(`SELECT c.id,c.parent_id,c.body,c.created_at,c.user_id,u.name author_name,u.color author_color,u.avatar author_avatar,
    (SELECT COUNT(*) FROM likes l WHERE l.target_type='comment' AND l.target_id=c.id) likes,
    (SELECT COUNT(*) FROM likes l WHERE l.target_type='comment' AND l.target_id=c.id AND l.user_id=?) liked
    FROM comments c JOIN users u ON u.id=c.user_id WHERE c.post_id=? ORDER BY c.created_at`, req.user.id, req.post.id)
    .map(c => ({ ...c, author_level: levelOf(pts.get(c.user_id) || 0) }));
  res.json({ post, comments, role: req.role });
});
app.put('/api/posts/:id', auth, loadPost, member, (req, res) => {
  if (req.post.user_id !== req.user.id) fail(403, 'Yalnızca kendi gönderini düzenleyebilirsin');
  const cats = JSON.parse(one('SELECT categories FROM communities WHERE id=?', req.post.community_id).categories);
  run('UPDATE posts SET title=?, body=?, category=? WHERE id=?', text(req.body.title, 'Başlık', 140, 3), text(req.body.body, 'İçerik', 8000),
    cats.includes(req.body.category) ? req.body.category : req.post.category, req.post.id);
  res.json({ ok: true });
});
app.delete('/api/posts/:id', auth, loadPost, member, (req, res) => {
  if (req.post.user_id !== req.user.id && req.role !== 'admin') fail(403, 'Bu gönderiyi silemezsin');
  run("DELETE FROM likes WHERE target_type='comment' AND target_id IN (SELECT id FROM comments WHERE post_id=?)", req.post.id);
  run("DELETE FROM likes WHERE target_type='post' AND target_id=?", req.post.id);
  run('DELETE FROM notifications WHERE post_id=?', req.post.id);
  run('DELETE FROM posts WHERE id=?', req.post.id);
  removeUpload(req.post.image); removeUpload(req.post.file);
  res.json({ ok: true });
});
app.post('/api/posts/:id/pin', auth, loadPost, admin, (req, res) => {
  run('UPDATE posts SET pinned=? WHERE id=?', req.post.pinned ? 0 : 1, req.post.id);
  res.json({ pinned: !req.post.pinned });
});
app.post('/api/posts/:id/comments', auth, loadPost, member, (req, res) => {
  const body = text(req.body.body, 'Yorum', 3000);
  let parentId = null, parent = null;
  if (req.body.parentId) {
    parent = one('SELECT id,parent_id,user_id FROM comments WHERE id=? AND post_id=?', Number(req.body.parentId), req.post.id);
    if (!parent) fail(400, 'Yanıtlanan yorum bulunamadı');
    parentId = parent.parent_id || parent.id; // tek seviye iç içe yanıt
  }
  const id = Number(run('INSERT INTO comments(post_id,user_id,parent_id,body,created_at) VALUES(?,?,?,?,?)', req.post.id, req.user.id, parentId, body, now()).lastInsertRowid);
  notify(req.post.user_id, req.user.id, 'comment', req.post.id, req.post.community_id);
  if (parent && parent.user_id !== req.post.user_id) notify(parent.user_id, req.user.id, 'reply', req.post.id, req.post.community_id);
  res.json({ id });
});
app.delete('/api/comments/:id', auth, (req, res) => {
  const c = one('SELECT c.*, p.community_id FROM comments c JOIN posts p ON p.id=c.post_id WHERE c.id=?', Number(req.params.id));
  if (!c) fail(404, 'Yorum bulunamadı');
  if (c.user_id !== req.user.id && roleIn(req.user.id, c.community_id) !== 'admin') fail(403, 'Bu yorumu silemezsin');
  run("DELETE FROM likes WHERE target_type='comment' AND (target_id=? OR target_id IN (SELECT id FROM comments WHERE parent_id=?))", c.id, c.id);
  run('DELETE FROM comments WHERE id=? OR parent_id=?', c.id, c.id);
  res.json({ ok: true });
});
app.post('/api/like', auth, (req, res) => {
  const type = req.body.type === 'comment' ? 'comment' : 'post', id = Number(req.body.id);
  const t = type === 'post'
    ? one('SELECT id, user_id, community_id, id post_id FROM posts WHERE id=?', id)
    : one('SELECT c.id, c.user_id, p.community_id, p.id post_id FROM comments c JOIN posts p ON p.id=c.post_id WHERE c.id=?', id);
  if (!t) fail(404, 'İçerik bulunamadı');
  if (!roleIn(req.user.id, t.community_id)) fail(403, 'Bu içerik yalnızca üyelere açık');
  if (t.user_id === req.user.id) fail(400, 'Kendi içeriğini beğenemezsin');
  const existing = one('SELECT id FROM likes WHERE user_id=? AND target_type=? AND target_id=?', req.user.id, type, id);
  if (existing) run('DELETE FROM likes WHERE id=?', existing.id);
  else {
    run('INSERT INTO likes(user_id,target_type,target_id,author_id,community_id,created_at) VALUES(?,?,?,?,?,?)', req.user.id, type, id, t.user_id, t.community_id, now());
    notify(t.user_id, req.user.id, type === 'post' ? 'like_post' : 'like_comment', t.post_id, t.community_id);
  }
  res.json({ liked: !existing, likes: one('SELECT COUNT(*) n FROM likes WHERE target_type=? AND target_id=?', type, id).n });
});

// ---------- Sınıf (kurslar) ----------
app.get('/api/communities/:slug/courses', auth, loadCommunity, member, (req, res) => {
  res.json({
    myLevel: levelOf(pointsMap(req.c.id).get(req.user.id) || 0),
    courses: all(`SELECT c.id,c.title,c.description,c.emoji,c.min_level,
      (SELECT COUNT(*) FROM lessons l WHERE l.course_id=c.id) total,
      (SELECT COUNT(*) FROM progress p JOIN lessons l ON l.id=p.lesson_id WHERE l.course_id=c.id AND p.user_id=?) done
      FROM courses c WHERE c.community_id=? ORDER BY c.created_at, c.id`, req.user.id, req.c.id),
  });
});
app.post('/api/communities/:slug/courses', auth, loadCommunity, admin, (req, res) => {
  const emoji = iconVal(req.body.emoji, 'i:book:blue');
  const minLevel = Math.min(Math.max(parseInt(req.body.minLevel, 10) || 1, 1), LEVELS.length);
  const id = Number(run('INSERT INTO courses(community_id,title,description,emoji,min_level,created_at) VALUES(?,?,?,?,?,?)',
    req.c.id, text(req.body.title, 'Kurs adı', 80, 3), optText(req.body.description, 'Açıklama', 400), emoji, minLevel, now()).lastInsertRowid);
  res.json({ id });
});
function loadCourse(req, res, next) {
  const c = one('SELECT * FROM courses WHERE id=?', Number(req.params.id));
  if (!c) return res.status(404).json({ error: 'Kurs bulunamadı' });
  req.course = c;
  req.role = roleIn(req.user.id, c.community_id);
  next();
}
app.get('/api/courses/:id', auth, loadCourse, member, (req, res) => {
  const { id, title, description, emoji, min_level } = req.course;
  if (req.role !== 'admin' && levelOf(pointsMap(req.course.community_id).get(req.user.id) || 0) < req.course.min_level)
    fail(403, `Bu kurs Seviye ${req.course.min_level} ve üzeri üyelere açık. Gönderi ve yorumlarına beğeni topladıkça seviyen yükselir.`);
  res.json({
    course: { id, title, description, emoji, min_level },
    lessons: all(`SELECT l.id,l.module,l.title,l.content,l.video,l.file,l.file_name,l.files,l.links,l.image,l.video_file,
      EXISTS(SELECT 1 FROM progress p WHERE p.lesson_id=l.id AND p.user_id=?) done
      FROM lessons l WHERE l.course_id=? ORDER BY l.position, l.id`, req.user.id, id).map(lessonOut),
  });
});
app.put('/api/courses/:id', auth, loadCourse, admin, (req, res) => {
  const emoji = iconVal(req.body.emoji, 'i:book:blue');
  if (req.course.emoji !== emoji) removeUpload(req.course.emoji);
  run('UPDATE courses SET title=?, description=?, emoji=?, min_level=? WHERE id=?', text(req.body.title, 'Kurs adı', 80, 3), optText(req.body.description, 'Açıklama', 400),
    emoji, Math.min(Math.max(parseInt(req.body.minLevel, 10) || 1, 1), LEVELS.length), req.course.id);
  res.json({ ok: true });
});
// Ders düzenleme ve silme
function loadLesson(req, res, next) {
  const l = one('SELECT l.*, k.community_id FROM lessons l JOIN courses k ON k.id=l.course_id WHERE l.id=?', Number(req.params.id));
  if (!l) return res.status(404).json({ error: 'Ders bulunamadı' });
  req.lesson = l;
  req.role = roleIn(req.user.id, l.community_id);
  next();
}
app.put('/api/lessons/:id', auth, loadLesson, admin, (req, res) => {
  const url = optText(req.body.video, 'Video bağlantısı', 200), vid = url ? ytId(url) : '';
  if (url && !vid) fail(400, 'Yalnızca YouTube bağlantıları destekleniyor');
  // Görsel ve video yalnızca gönderildiyse değişir ('' kaldırır)
  const image = req.body.image === undefined ? req.lesson.image : img(req.body.image);
  const videoFile = req.body.videoFile === undefined ? req.lesson.video_file : vidUrl(req.body.videoFile);
  if (image !== req.lesson.image) removeUpload(req.lesson.image);
  if (videoFile !== req.lesson.video_file) removeUpload(req.lesson.video_file);
  // Bağlantı ve dosya listeleri de yalnızca gönderildiyse değişir; listeden çıkarılan dosyalar silinir
  const links = req.body.links === undefined ? req.lesson.links : JSON.stringify(parseLinks(req.body.links));
  const oldFiles = lessonFiles(req.lesson), files = req.body.files === undefined ? oldFiles : parseFiles(req.body.files);
  oldFiles.filter(o => !files.some(f => f.url === o.url)).forEach(o => removeUpload(o.url));
  run("UPDATE lessons SET module=?, title=?, content=?, video=?, image=?, video_file=?, links=?, files=?, file='', file_name='' WHERE id=?", text(req.body.module, 'Bölüm', 60), text(req.body.title, 'Ders adı', 100, 2), optText(req.body.content, 'İçerik', 10000), vid, image, videoFile, links, JSON.stringify(files), req.lesson.id);
  res.json({ ok: true });
});
app.delete('/api/lessons/:id', auth, loadLesson, admin, (req, res) => {
  removeLessonUploads(req.lesson);
  run('DELETE FROM lessons WHERE id=?', req.lesson.id);
  res.json({ ok: true });
});
app.delete('/api/courses/:id', auth, loadCourse, admin, (req, res) => {
  all('SELECT * FROM lessons WHERE course_id=?', req.course.id).forEach(removeLessonUploads);
  run('DELETE FROM courses WHERE id=?', req.course.id);
  res.json({ ok: true });
});
app.post('/api/courses/:id/lessons', auth, loadCourse, admin, (req, res) => {
  const url = optText(req.body.video, 'Video bağlantısı', 200);
  const vid = url ? /(?:youtu\.be\/|[?&]v=|embed\/|shorts\/)([\w-]{11})/.exec(url)?.[1] : '';
  if (url && !vid) fail(400, 'Yalnızca YouTube bağlantıları destekleniyor');
  const pos = one('SELECT COALESCE(MAX(position),0)+1 n FROM lessons WHERE course_id=?', req.course.id).n;
  const id = Number(run('INSERT INTO lessons(course_id,module,title,content,video,links,files,image,video_file,position) VALUES(?,?,?,?,?,?,?,?,?,?)',
    req.course.id, text(req.body.module, 'Bölüm', 60), text(req.body.title, 'Ders adı', 100, 2), optText(req.body.content, 'İçerik', 10000), vid,
    JSON.stringify(parseLinks(req.body.links)), JSON.stringify(parseFiles(req.body.files)), img(req.body.image), vidUrl(req.body.videoFile), pos).lastInsertRowid);
  res.json({ id });
});
app.post('/api/lessons/:id/complete', auth, (req, res) => {
  const l = one('SELECT l.id, c.community_id FROM lessons l JOIN courses c ON c.id=l.course_id WHERE l.id=?', Number(req.params.id));
  if (!l) fail(404, 'Ders bulunamadı');
  if (!roleIn(req.user.id, l.community_id)) fail(403, 'Bu içerik yalnızca üyelere açık');
  const done = one('SELECT 1 FROM progress WHERE user_id=? AND lesson_id=?', req.user.id, l.id);
  if (done) run('DELETE FROM progress WHERE user_id=? AND lesson_id=?', req.user.id, l.id);
  else run('INSERT INTO progress(user_id,lesson_id) VALUES(?,?)', req.user.id, l.id);
  res.json({ done: !done });
});

// ---------- Takvim ----------
app.get('/api/communities/:slug/events', auth, loadCommunity, member, (req, res) => {
  res.json({ events: all('SELECT id,title,description,starts_at,duration_min,link FROM events WHERE community_id=? ORDER BY starts_at', req.c.id) });
});
app.post('/api/communities/:slug/events', auth, loadCommunity, admin, (req, res) => {
  const startsAt = Number(req.body.startsAt);
  if (!Number.isFinite(startsAt) || startsAt < 0) fail(400, 'Geçerli bir tarih seç');
  const link = optText(req.body.link, 'Bağlantı', 300);
  if (link && !/^https?:\/\//i.test(link)) fail(400, 'Bağlantı http(s):// ile başlamalı');
  const dur = Math.min(Math.max(parseInt(req.body.duration, 10) || 60, 5), 1440);
  run('INSERT INTO events(community_id,title,description,starts_at,duration_min,link,created_at) VALUES(?,?,?,?,?,?,?)',
    req.c.id, text(req.body.title, 'Etkinlik adı', 100, 3), optText(req.body.description, 'Açıklama', 1000), startsAt, dur, link, now());
  res.json({ ok: true });
});
app.delete('/api/events/:id', auth, (req, res) => {
  const e = one('SELECT id, community_id FROM events WHERE id=?', Number(req.params.id));
  if (!e) fail(404, 'Etkinlik bulunamadı');
  if (roleIn(req.user.id, e.community_id) !== 'admin') fail(403, 'Bu işlem için yönetici olmalısın');
  run('DELETE FROM events WHERE id=?', e.id);
  res.json({ ok: true });
});

// ---------- Üyeler & sıralama ----------
app.get('/api/communities/:slug/members', auth, loadCommunity, member, (req, res) => {
  const pts = pointsMap(req.c.id);
  res.json({
    members: all('SELECT u.id,u.name,u.title,u.bio,u.color,u.avatar,m.role,m.joined_at FROM memberships m JOIN users u ON u.id=m.user_id WHERE m.community_id=? ORDER BY m.role, m.joined_at', req.c.id)
      .map(u => ({ ...u, points: pts.get(u.id) || 0, level: levelOf(pts.get(u.id) || 0) })),
    requests: req.role === 'admin' ? all('SELECT u.id,u.name,u.color,u.avatar,r.note,r.created_at FROM join_requests r JOIN users u ON u.id=r.user_id WHERE r.community_id=? ORDER BY r.created_at', req.c.id) : [],
  });
});
app.get('/api/communities/:slug/leaderboard', auth, loadCommunity, member, (req, res) => {
  const users = all('SELECT u.id,u.name,u.color,u.avatar FROM memberships m JOIN users u ON u.id=m.user_id WHERE m.community_id=?', req.c.id);
  const allTime = pointsMap(req.c.id);
  const board = since => {
    const pts = since ? pointsMap(req.c.id, since) : allTime;
    return users.map(u => ({ ...u, points: pts.get(u.id) || 0, level: levelOf(allTime.get(u.id) || 0) }))
      .filter(u => u.points > 0).sort((a, b) => b.points - a.points).slice(0, 10);
  };
  const counts = Array(LEVELS.length).fill(0);
  users.forEach(u => counts[levelOf(allTime.get(u.id) || 0) - 1]++);
  const mine = allTime.get(req.user.id) || 0, lv = levelOf(mine);
  res.json({
    week: board(now() - 7 * 864e5), month: board(now() - 30 * 864e5), all: board(0),
    levels: LEVELS.map((min, i) => ({ level: i + 1, name: LEVEL_NAMES[i], min, pct: users.length ? Math.round(counts[i] * 100 / users.length) : 0 })),
    me: { points: mine, level: lv, name: LEVEL_NAMES[lv - 1], next: LEVELS[lv] ?? null, floor: LEVELS[lv - 1] },
  });
});

// ---------- Profil ----------
app.get('/api/users/:id', auth, (req, res) => {
  const u = one('SELECT id,name,title,link,bio,color,avatar,created_at FROM users WHERE id=?', Number(req.params.id));
  if (!u) fail(404, 'Kullanıcı bulunamadı');
  const communities = all('SELECT c.id,c.slug,c.name,c.emoji,c.color,m.role FROM memberships m JOIN communities c ON c.id=m.community_id WHERE m.user_id=? ORDER BY m.joined_at', u.id)
    .map(c => { const pts = one('SELECT COUNT(*) n FROM likes WHERE community_id=? AND author_id=?', c.id, u.id).n; return { ...c, points: pts, level: levelOf(pts) }; });
  // Yalnızca görüntüleyenin de üyesi olduğu toplulukların gönderileri
  const posts = all(`SELECT p.id,p.title,p.created_at,c.slug,c.name community FROM posts p JOIN communities c ON c.id=p.community_id
    WHERE p.user_id=? AND p.community_id IN (SELECT community_id FROM memberships WHERE user_id=?) ORDER BY p.created_at DESC LIMIT 15`, u.id, req.user.id);
  res.json({ user: u, communities: communities.map(({ id, ...c }) => c), posts, canMessage: canMessage(req.user.id, u.id) && !!userPrefs(u.id).messages });
});

// ---------- Yönetim paneli ----------
app.get('/api/communities/:slug/admin', auth, loadCommunity, admin, (req, res) => {
  const c = req.c, t = now(), pts = pointsMap(c.id);
  const n = (sql, ...p) => one(sql, ...p).n;
  const members = all('SELECT u.id,u.name,u.color,u.avatar,m.role,m.joined_at,m.paid_until FROM memberships m JOIN users u ON u.id=m.user_id WHERE m.community_id=? ORDER BY m.role, m.joined_at', c.id)
    .map(u => ({ ...u, points: pts.get(u.id) || 0, level: levelOf(pts.get(u.id) || 0) }));
  const paying = members.filter(m => m.role !== 'admin' && m.paid_until > t).length;
  res.json({
    stats: {
      members: members.length,
      new7: n('SELECT COUNT(*) n FROM memberships WHERE community_id=? AND joined_at>=?', c.id, t - 7 * 864e5),
      new30: n('SELECT COUNT(*) n FROM memberships WHERE community_id=? AND joined_at>=?', c.id, t - 30 * 864e5),
      posts7: n('SELECT COUNT(*) n FROM posts WHERE community_id=? AND created_at>=?', c.id, t - 7 * 864e5),
      comments7: n('SELECT COUNT(*) n FROM comments c JOIN posts p ON p.id=c.post_id WHERE p.community_id=? AND c.created_at>=?', c.id, t - 7 * 864e5),
      likes7: n('SELECT COUNT(*) n FROM likes WHERE community_id=? AND created_at>=?', c.id, t - 7 * 864e5),
      paying, revenue: c.price_type === 'monthly' ? paying * c.price_amount : 0,
    },
    requests: all('SELECT u.id,u.name,u.color,u.avatar,r.note,r.created_at FROM join_requests r JOIN users u ON u.id=r.user_id WHERE r.community_id=? ORDER BY r.created_at', c.id),
    members, invite_code: c.invite_code, owner_id: c.owner_id,
  });
});
app.post('/api/communities/:slug/members/:userId', auth, loadCommunity, admin, (req, res) => {
  const uid = Number(req.params.userId), b = req.body || {};
  const m = one('SELECT role, paid_until FROM memberships WHERE user_id=? AND community_id=?', uid, req.c.id);
  if (!m) fail(404, 'Üye bulunamadı');
  if (b.role) {
    if (req.user.id !== req.c.owner_id) fail(403, 'Yalnızca kurucu yönetici atayabilir');
    if (uid === req.c.owner_id) fail(400, 'Kurucunun rolü değiştirilemez');
    run('UPDATE memberships SET role=? WHERE user_id=? AND community_id=?', b.role === 'admin' ? 'admin' : 'member', uid, req.c.id);
  }
  if (b.extendDays) {
    const d = Math.min(Math.max(parseInt(b.extendDays, 10) || 0, 1), 3660);
    run('UPDATE memberships SET paid_until=? WHERE user_id=? AND community_id=?', Math.max(now(), m.paid_until) + d * 864e5, uid, req.c.id);
  }
  if (b.unlimited) run('UPDATE memberships SET paid_until=0 WHERE user_id=? AND community_id=?', uid, req.c.id);
  res.json({ ok: true });
});

// ---------- Davet bağlantısı ----------
app.post('/api/communities/:slug/invite', auth, loadCommunity, admin, (req, res) => {
  const code = newInvite();
  run('UPDATE communities SET invite_code=? WHERE id=?', code, req.c.id);
  res.json({ code });
});
const byInvite = code => (/^[a-f0-9]{16}$/.test(code) ? one('SELECT * FROM communities WHERE invite_code=?', code) : null);
app.get('/api/invite/:code', (req, res) => {
  const c = byInvite(req.params.code);
  if (!c) fail(404, 'Davet bağlantısı geçersiz ya da yenilenmiş');
  res.json({ community: { slug: c.slug, name: c.name, tagline: c.tagline, emoji: c.emoji, members: one('SELECT COUNT(*) n FROM memberships WHERE community_id=?', c.id).n } });
});
// Davetle gelenler onay ve ödeme beklemeden, süresiz üye olur
app.post('/api/invite/:code', auth, (req, res) => {
  const c = byInvite(req.params.code);
  if (!c) fail(404, 'Davet bağlantısı geçersiz ya da yenilenmiş');
  const m = one('SELECT role FROM memberships WHERE user_id=? AND community_id=?', req.user.id, c.id);
  if (m) run('UPDATE memberships SET paid_until=0 WHERE user_id=? AND community_id=?', req.user.id, c.id);
  else run('INSERT INTO memberships(user_id,community_id,role,joined_at) VALUES(?,?,?,?)', req.user.id, c.id, 'member', now());
  run('DELETE FROM join_requests WHERE user_id=? AND community_id=?', req.user.id, c.id);
  res.json({ slug: c.slug });
});

// ---------- Canlı yayın (görüntü YouTube Live'dan gömülür, sohbet burada tutulur) ----------
const CHAT_SELECT = 'SELECT l.id,l.body,l.created_at,u.name FROM live_chat l JOIN users u ON u.id=l.user_id WHERE l.community_id=?';
app.get('/api/communities/:slug/live', auth, loadCommunity, member, (req, res) => {
  const c = req.c;
  if (!c.live_video) return res.json({ live: null, messages: [] });
  const after = Number(req.query.after) || 0;
  res.json({
    live: { title: c.live_title, video: c.live_video, started: c.live_started },
    messages: after ? all(`${CHAT_SELECT} AND l.id>? ORDER BY l.id LIMIT 200`, c.id, after) : all(`${CHAT_SELECT} ORDER BY l.id DESC LIMIT 100`, c.id).reverse(),
  });
});
app.post('/api/communities/:slug/live', auth, loadCommunity, admin, (req, res) => {
  const title = text(req.body.title, 'Yayın başlığı', 100, 3);
  const video = ytId(optText(req.body.url, 'Yayın bağlantısı', 200));
  if (!video) fail(400, 'Geçerli bir YouTube canlı yayın bağlantısı yapıştır');
  run('DELETE FROM live_chat WHERE community_id=?', req.c.id);
  run('UPDATE communities SET live_video=?, live_title=?, live_started=? WHERE id=?', video, title, now(), req.c.id);
  for (const m of all('SELECT user_id FROM memberships WHERE community_id=?', req.c.id)) notify(m.user_id, req.user.id, 'live', 0, req.c.id);
  res.json({ ok: true });
});
app.delete('/api/communities/:slug/live', auth, loadCommunity, admin, (req, res) => {
  run("UPDATE communities SET live_video='', live_title='', live_started=0 WHERE id=?", req.c.id);
  run('DELETE FROM live_chat WHERE community_id=?', req.c.id);
  res.json({ ok: true });
});
app.post('/api/communities/:slug/live/chat', auth, loadCommunity, member, (req, res) => {
  if (!req.c.live_video) fail(400, 'Şu an canlı yayın yok');
  run('INSERT INTO live_chat(community_id,user_id,body,created_at) VALUES(?,?,?,?)', req.c.id, req.user.id, text(req.body.body, 'Mesaj', 500), now());
  res.json({ ok: true });
});

// ---------- Anket & dosya ----------
app.post('/api/posts/:id/vote', auth, loadPost, member, (req, res) => {
  const opts = req.post.poll ? JSON.parse(req.post.poll) : [], i = Number(req.body.option);
  if (!Number.isInteger(i) || i < 0 || i >= opts.length) fail(400, 'Geçersiz seçenek');
  run('INSERT OR REPLACE INTO poll_votes(post_id,user_id,option_idx) VALUES(?,?,?)', req.post.id, req.user.id, i);
  res.json({ ok: true });
});
// ---------- Video yükleme (parça parça) ----------
// Büyük dosyalar tek istekte gönderilmez: tarayıcı videoyu 4 MB'lık parçalara böler, sunucu sırayla diske ekler.
const MAX_VIDEO = (parseInt(process.env.MAX_VIDEO_MB, 10) || 2048) * 1024 * 1024;
const CHUNK = 4 * 1024 * 1024;
const pendingVideos = new Map();
for (const f of fs.readdirSync(UPLOADS)) if (f.endsWith('.part')) fs.unlink(path.join(UPLOADS, f), () => {}); // yarım kalmış yüklemeleri temizle
setInterval(() => {
  for (const [id, u] of pendingVideos) if (u.at < now() - 2 * 3600e3) { fs.unlink(u.path, () => {}); pendingVideos.delete(id); }
}, 10 * 60e3).unref();
const sizeLabel = b => (b >= 1024 ** 3 ? `${(b / 1024 ** 3).toFixed(1).replace('.0', '')} GB` : `${Math.round(b / 1024 ** 2)} MB`);
app.post('/api/video/start', auth, (req, res) => {
  if (!one("SELECT 1 FROM memberships WHERE user_id=? AND role='admin'", req.user.id)) fail(403, 'Video yüklemek için bir topluluğun yöneticisi olmalısın');
  const ext = /\.(mp4|webm|mov)$/i.exec(String(req.body.name || ''))?.[1].toLowerCase();
  if (!ext) fail(400, 'Desteklenen video türleri: MP4, WebM, MOV');
  const size = Number(req.body.size);
  if (!Number.isInteger(size) || size < 1) fail(400, 'Video dosyası okunamadı');
  if (size > MAX_VIDEO) fail(400, `Video en fazla ${sizeLabel(MAX_VIDEO)} olabilir. Daha uzun videolar için YouTube bağlantısı ekleyebilirsin.`);
  let free = Infinity;
  try { const s = fs.statfsSync(UPLOADS); free = s.bavail * s.bsize; } catch { /* ölçülemezse yüklemeye izin ver */ }
  if (free < size + 100 * 1024 * 1024) fail(507, 'Sunucuda bu video için yeterli depolama alanı yok. YouTube bağlantısı ekleyebilirsin.');
  if ([...pendingVideos.values()].filter(u => u.userId === req.user.id).length >= 3) fail(429, 'Aynı anda en fazla 3 video yükleyebilirsin');
  const id = crypto.randomBytes(16).toString('hex'), file = path.join(UPLOADS, id + '.part');
  fs.writeFileSync(file, '');
  pendingVideos.set(id, { userId: req.user.id, ext, size, got: 0, path: file, at: now() });
  res.json({ id, chunk: CHUNK });
});
app.put('/api/video/:id', auth, express.raw({ type: () => true, limit: CHUNK + 1024 * 1024 }), (req, res) => {
  const u = pendingVideos.get(req.params.id);
  if (!u || u.userId !== req.user.id) fail(404, 'Yükleme bulunamadı; baştan dene');
  if (Number(req.query.offset) !== u.got) return res.status(409).json({ error: 'Parça sırası uyuşmuyor', got: u.got });
  const buf = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
  if (!buf.length || u.got + buf.length > u.size) fail(400, 'Geçersiz parça');
  try { fs.appendFileSync(u.path, buf); } catch { fs.unlink(u.path, () => {}); pendingVideos.delete(req.params.id); fail(507, 'Sunucuda depolama alanı doldu; video yüklenemedi'); }
  u.got += buf.length; u.at = now();
  res.json({ got: u.got });
});
app.post('/api/video/:id/finish', auth, (req, res) => {
  const u = pendingVideos.get(req.params.id);
  if (!u || u.userId !== req.user.id) fail(404, 'Yükleme bulunamadı; baştan dene');
  if (u.got !== u.size) fail(400, 'Yükleme tamamlanmadı');
  const name = `${req.params.id}.${u.ext}`;
  fs.renameSync(u.path, path.join(UPLOADS, name));
  pendingVideos.delete(req.params.id);
  res.json({ url: '/uploads/' + name });
});

app.post('/api/upload-file', auth, (req, res) => {
  const name = text(req.body.name, 'Dosya adı', 120).replace(/[\\/\x00-\x1f"<>|:*?]/g, '_');
  const ext = /\.(pdf|zip|docx|xlsx|pptx|txt|csv)$/i.exec(name)?.[1].toLowerCase();
  if (!ext) fail(400, 'Desteklenen dosya türleri: PDF, ZIP, DOCX, XLSX, PPTX, TXT, CSV');
  const m = /^data:[\w.+\/-]*;base64,([A-Za-z0-9+/=]*)$/.exec(String(req.body.dataUrl || ''));
  if (!m) fail(400, 'Dosya okunamadı');
  const buf = Buffer.from(m[1], 'base64');
  if (!buf.length || buf.length > 8 * 1024 * 1024) fail(400, 'Dosya en fazla 8 MB olabilir');
  const stored = crypto.randomBytes(16).toString('hex') + '.' + ext;
  fs.writeFileSync(path.join(UPLOADS, stored), buf);
  res.json({ url: '/uploads/' + stored, name });
});

// ---------- Statik dosyalar & hatalar ----------
app.use(express.static(path.join(__dirname, 'public')));
app.use('/api', (req, res) => res.status(404).json({ error: 'Bulunamadı' }));
app.use((err, req, res, next) => {
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Geçersiz istek' });
  if (err.type === 'entity.too.large') return res.status(413).json({ error: 'Gönderilen içerik çok büyük' });
  if (!err.status) console.error(err);
  res.status(err.status || 500).json({ error: err.status ? err.message : 'Sunucu hatası' });
});

process.on('unhandledRejection', err => console.error('Yakalanmamış hata:', err));
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Okul http://localhost:${PORT} adresinde çalışıyor`));
