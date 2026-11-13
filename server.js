const express = require('express');
const crypto = require('crypto');
const path = require('path');
const { db, hashPassword, checkPassword, COLORS, DEFAULT_CATEGORIES } = require('./db');

const app = express();
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
function notify(userId, actorId, type, postId, communityId) {
  if (userId !== actorId) run('INSERT INTO notifications(user_id,actor_id,type,post_id,community_id,created_at) VALUES(?,?,?,?,?,?)', userId, actorId, type, postId, communityId, now());
}

// ---------- Oturum ----------
app.use((req, res, next) => {
  const m = /(?:^|;\s*)sid=([a-f0-9]{48})/.exec(req.headers.cookie || '');
  req.user = m ? one('SELECT u.id,u.name,u.email,u.bio,u.color FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token=?', m[1]) || null : null;
  req.sid = m ? m[1] : null;
  next();
});
function startSession(res, userId) {
  const token = crypto.randomBytes(24).toString('hex');
  run('INSERT INTO sessions(token,user_id,created_at) VALUES(?,?,?)', token, userId, now());
  res.setHeader('Set-Cookie', `sid=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${60 * 60 * 24 * 30}`);
}
const auth = (req, res, next) => req.user ? next() : res.status(401).json({ error: 'Önce giriş yapmalısın' });

function loadCommunity(req, res, next) {
  const c = one('SELECT * FROM communities WHERE slug=?', req.params.slug);
  if (!c) return res.status(404).json({ error: 'Topluluk bulunamadı' });
  req.c = c;
  req.role = req.user ? one('SELECT role FROM memberships WHERE user_id=? AND community_id=?', req.user.id, c.id)?.role || null : null;
  next();
}
const member = (req, res, next) => req.role ? next() : res.status(403).json({ error: 'Bu içerik yalnızca üyelere açık' });
const admin = (req, res, next) => req.role === 'admin' ? next() : res.status(403).json({ error: 'Bu işlem için yönetici olmalısın' });
const roleIn = (userId, communityId) => one('SELECT role FROM memberships WHERE user_id=? AND community_id=?', userId, communityId)?.role || null;

// ---------- Kimlik ----------
app.post('/api/auth/register', (req, res) => {
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
  const email = String(req.body.email || '').trim().toLowerCase();
  const u = one('SELECT id,pass FROM users WHERE email=?', email);
  if (!u || !checkPassword(String(req.body.password || ''), u.pass)) fail(401, 'E-posta veya şifre hatalı');
  startSession(res, u.id);
  res.json({ ok: true });
});
app.post('/api/auth/logout', (req, res) => {
  if (req.sid) run('DELETE FROM sessions WHERE token=?', req.sid);
  res.setHeader('Set-Cookie', 'sid=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0');
  res.json({ ok: true });
});
app.get('/api/me', (req, res) => {
  if (!req.user) return res.json({ user: null, communities: [], unread: 0 });
  res.json({
    user: req.user,
    communities: all('SELECT c.slug,c.name,c.emoji,c.color FROM memberships m JOIN communities c ON c.id=m.community_id WHERE m.user_id=? ORDER BY m.joined_at', req.user.id),
    unread: one('SELECT COUNT(*) n FROM notifications WHERE user_id=? AND is_read=0', req.user.id).n,
  });
});
app.put('/api/me', auth, (req, res) => {
  run('UPDATE users SET name=?, bio=? WHERE id=?', text(req.body.name, 'Ad', 60, 2), optText(req.body.bio, 'Hakkında', 300), req.user.id);
  res.json({ ok: true });
});

// ---------- Bildirimler ----------
app.get('/api/notifications', auth, (req, res) => {
  const items = all(`SELECT n.id,n.type,n.is_read,n.created_at,n.post_id,u.name actor_name,u.color actor_color,p.title post_title,c.slug
    FROM notifications n JOIN users u ON u.id=n.actor_id JOIN posts p ON p.id=n.post_id JOIN communities c ON c.id=n.community_id
    WHERE n.user_id=? ORDER BY n.created_at DESC LIMIT 30`, req.user.id);
  run('UPDATE notifications SET is_read=1 WHERE user_id=?', req.user.id);
  res.json({ items });
});

// ---------- Topluluklar ----------
app.get('/api/communities', (req, res) => {
  const q = `%${String(req.query.q || '').trim()}%`;
  res.json({
    items: all(`SELECT c.slug,c.name,c.tagline,c.emoji,c.color,c.category,c.is_private,
      (SELECT COUNT(*) FROM memberships m WHERE m.community_id=c.id) members
      FROM communities c WHERE c.name LIKE ? OR c.tagline LIKE ? OR c.category LIKE ? ORDER BY members DESC, c.created_at DESC LIMIT 60`, q, q, q),
  });
});
app.post('/api/communities', auth, (req, res) => {
  const name = text(req.body.name, 'Topluluk adı', 50, 3);
  const tagline = optText(req.body.tagline, 'Kısa tanım', 100);
  const description = optText(req.body.description, 'Açıklama', 3000);
  const category = optText(req.body.category, 'Kategori', 30) || 'Genel';
  const emoji = [...optText(req.body.emoji, 'Simge', 8)].slice(0, 2).join('') || '⭕';
  let slug = slugify(name), n = 1;
  while (one('SELECT 1 FROM communities WHERE slug=?', slug)) slug = `${slugify(name)}-${++n}`;
  const id = Number(run('INSERT INTO communities(slug,name,tagline,description,category,is_private,categories,owner_id,color,emoji,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)',
    slug, name, tagline, description, category, req.body.isPrivate ? 1 : 0, JSON.stringify(DEFAULT_CATEGORIES), req.user.id, COLORS[crypto.randomInt(COLORS.length)], emoji, now()).lastInsertRowid);
  run('INSERT INTO memberships(user_id,community_id,role,joined_at) VALUES(?,?,?,?)', req.user.id, id, 'admin', now());
  res.json({ slug });
});
app.get('/api/communities/:slug', loadCommunity, (req, res) => {
  const c = req.c;
  const pts = pointsMap(c.id);
  const top = all('SELECT u.id,u.name,u.color FROM memberships m JOIN users u ON u.id=m.user_id WHERE m.community_id=?', c.id)
    .map(u => ({ ...u, points: pts.get(u.id) || 0 })).sort((a, b) => b.points - a.points).slice(0, 5)
    .map(u => ({ ...u, level: levelOf(u.points) }));
  const myPoints = req.user ? pts.get(req.user.id) || 0 : 0;
  res.json({
    community: { slug: c.slug, name: c.name, tagline: c.tagline, description: c.description, category: c.category, is_private: c.is_private, color: c.color, emoji: c.emoji, created_at: c.created_at, categories: JSON.parse(c.categories) },
    role: req.role,
    owner: one('SELECT id,name,color FROM users WHERE id=?', c.owner_id),
    stats: {
      members: one('SELECT COUNT(*) n FROM memberships WHERE community_id=?', c.id).n,
      posts: one('SELECT COUNT(*) n FROM posts WHERE community_id=?', c.id).n,
      courses: one('SELECT COUNT(*) n FROM courses WHERE community_id=?', c.id).n,
    },
    top,
    me: req.role ? { points: myPoints, level: levelOf(myPoints) } : null,
  });
});
app.put('/api/communities/:slug', auth, loadCommunity, admin, (req, res) => {
  run('UPDATE communities SET tagline=?, description=?, is_private=? WHERE id=?',
    optText(req.body.tagline, 'Kısa tanım', 100), optText(req.body.description, 'Açıklama', 3000), req.body.isPrivate ? 1 : 0, req.c.id);
  res.json({ ok: true });
});
app.post('/api/communities/:slug/join', auth, loadCommunity, (req, res) => {
  if (!req.role) run('INSERT INTO memberships(user_id,community_id,role,joined_at) VALUES(?,?,?,?)', req.user.id, req.c.id, 'member', now());
  res.json({ ok: true });
});
app.post('/api/communities/:slug/leave', auth, loadCommunity, member, (req, res) => {
  if (req.c.owner_id === req.user.id) fail(400, 'Topluluğun kurucusu ayrılamaz');
  run('DELETE FROM memberships WHERE user_id=? AND community_id=?', req.user.id, req.c.id);
  res.json({ ok: true });
});

// ---------- Akış ----------
const POST_SELECT = `SELECT p.id,p.title,p.body,p.category,p.pinned,p.created_at,p.user_id,u.name author_name,u.color author_color,
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
  const posts = all(`${POST_SELECT} WHERE ${where.join(' AND ')} ORDER BY p.pinned DESC, ${order} LIMIT 100`, ...params)
    .map(p => ({ ...p, author_level: levelOf(pts.get(p.user_id) || 0) }));
  res.json({ posts });
});
app.post('/api/communities/:slug/posts', auth, loadCommunity, member, (req, res) => {
  const cats = JSON.parse(req.c.categories);
  const category = cats.includes(req.body.category) ? req.body.category : cats[0];
  const id = Number(run('INSERT INTO posts(community_id,user_id,title,body,category,created_at) VALUES(?,?,?,?,?,?)',
    req.c.id, req.user.id, text(req.body.title, 'Başlık', 140, 3), text(req.body.body, 'İçerik', 8000), category, now()).lastInsertRowid);
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
  const comments = all(`SELECT c.id,c.parent_id,c.body,c.created_at,c.user_id,u.name author_name,u.color author_color,
    (SELECT COUNT(*) FROM likes l WHERE l.target_type='comment' AND l.target_id=c.id) likes,
    (SELECT COUNT(*) FROM likes l WHERE l.target_type='comment' AND l.target_id=c.id AND l.user_id=?) liked
    FROM comments c JOIN users u ON u.id=c.user_id WHERE c.post_id=? ORDER BY c.created_at`, req.user.id, req.post.id)
    .map(c => ({ ...c, author_level: levelOf(pts.get(c.user_id) || 0) }));
  res.json({ post, comments, role: req.role });
});
app.delete('/api/posts/:id', auth, loadPost, member, (req, res) => {
  if (req.post.user_id !== req.user.id && req.role !== 'admin') fail(403, 'Bu gönderiyi silemezsin');
  run("DELETE FROM likes WHERE target_type='comment' AND target_id IN (SELECT id FROM comments WHERE post_id=?)", req.post.id);
  run("DELETE FROM likes WHERE target_type='post' AND target_id=?", req.post.id);
  run('DELETE FROM notifications WHERE post_id=?', req.post.id);
  run('DELETE FROM posts WHERE id=?', req.post.id);
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
    courses: all(`SELECT c.id,c.title,c.description,c.emoji,
      (SELECT COUNT(*) FROM lessons l WHERE l.course_id=c.id) total,
      (SELECT COUNT(*) FROM progress p JOIN lessons l ON l.id=p.lesson_id WHERE l.course_id=c.id AND p.user_id=?) done
      FROM courses c WHERE c.community_id=? ORDER BY c.created_at, c.id`, req.user.id, req.c.id),
  });
});
app.post('/api/communities/:slug/courses', auth, loadCommunity, admin, (req, res) => {
  const emoji = [...optText(req.body.emoji, 'Simge', 8)].slice(0, 2).join('') || '📘';
  const id = Number(run('INSERT INTO courses(community_id,title,description,emoji,created_at) VALUES(?,?,?,?,?)',
    req.c.id, text(req.body.title, 'Kurs adı', 80, 3), optText(req.body.description, 'Açıklama', 400), emoji, now()).lastInsertRowid);
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
  const { id, title, description, emoji } = req.course;
  res.json({
    course: { id, title, description, emoji },
    lessons: all(`SELECT l.id,l.module,l.title,l.content,l.video,
      EXISTS(SELECT 1 FROM progress p WHERE p.lesson_id=l.id AND p.user_id=?) done
      FROM lessons l WHERE l.course_id=? ORDER BY l.position, l.id`, req.user.id, id),
  });
});
app.delete('/api/courses/:id', auth, loadCourse, admin, (req, res) => {
  run('DELETE FROM courses WHERE id=?', req.course.id);
  res.json({ ok: true });
});
app.post('/api/courses/:id/lessons', auth, loadCourse, admin, (req, res) => {
  const url = optText(req.body.video, 'Video bağlantısı', 200);
  const vid = url ? /(?:youtu\.be\/|[?&]v=|embed\/|shorts\/)([\w-]{11})/.exec(url)?.[1] : '';
  if (url && !vid) fail(400, 'Yalnızca YouTube bağlantıları destekleniyor');
  const pos = one('SELECT COALESCE(MAX(position),0)+1 n FROM lessons WHERE course_id=?', req.course.id).n;
  const id = Number(run('INSERT INTO lessons(course_id,module,title,content,video,position) VALUES(?,?,?,?,?,?)',
    req.course.id, text(req.body.module, 'Bölüm', 60), text(req.body.title, 'Ders adı', 100, 2), optText(req.body.content, 'İçerik', 10000), vid, pos).lastInsertRowid);
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
    members: all('SELECT u.id,u.name,u.bio,u.color,m.role,m.joined_at FROM memberships m JOIN users u ON u.id=m.user_id WHERE m.community_id=? ORDER BY m.role, m.joined_at', req.c.id)
      .map(u => ({ ...u, points: pts.get(u.id) || 0, level: levelOf(pts.get(u.id) || 0) })),
  });
});
app.get('/api/communities/:slug/leaderboard', auth, loadCommunity, member, (req, res) => {
  const users = all('SELECT u.id,u.name,u.color FROM memberships m JOIN users u ON u.id=m.user_id WHERE m.community_id=?', req.c.id);
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
  const u = one('SELECT id,name,bio,color,created_at FROM users WHERE id=?', Number(req.params.id));
  if (!u) fail(404, 'Kullanıcı bulunamadı');
  const communities = all('SELECT c.id,c.slug,c.name,c.emoji,c.color,m.role FROM memberships m JOIN communities c ON c.id=m.community_id WHERE m.user_id=? ORDER BY m.joined_at', u.id)
    .map(c => { const pts = one('SELECT COUNT(*) n FROM likes WHERE community_id=? AND author_id=?', c.id, u.id).n; return { ...c, points: pts, level: levelOf(pts) }; });
  // Yalnızca görüntüleyenin de üyesi olduğu toplulukların gönderileri
  const posts = all(`SELECT p.id,p.title,p.created_at,c.slug,c.name community FROM posts p JOIN communities c ON c.id=p.community_id
    WHERE p.user_id=? AND p.community_id IN (SELECT community_id FROM memberships WHERE user_id=?) ORDER BY p.created_at DESC LIMIT 15`, u.id, req.user.id);
  res.json({ user: u, communities: communities.map(({ id, ...c }) => c), posts });
});

// ---------- Statik dosyalar & hatalar ----------
app.use(express.static(path.join(__dirname, 'public')));
app.use('/api', (req, res) => res.status(404).json({ error: 'Bulunamadı' }));
app.use((err, req, res, next) => {
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Geçersiz istek' });
  if (!err.status) console.error(err);
  res.status(err.status || 500).json({ error: err.status ? err.message : 'Sunucu hatası' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Okul http://localhost:${PORT} adresinde çalışıyor`));
