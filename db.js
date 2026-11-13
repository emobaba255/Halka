// Veritabanı şeması + örnek veri (Node'un yerleşik SQLite modülü)
const { DatabaseSync } = require('node:sqlite');
const crypto = require('crypto');
const path = require('path');

const fs = require('fs');
// Veriler nerede durur: DATA_DIR verilmişse orada; yoksa kalıcı disk /var/data'ya bağlıysa orada; o da yoksa proje klasöründe
function pickDataDir() {
  if (process.env.DATA_DIR) { fs.mkdirSync(process.env.DATA_DIR, { recursive: true }); return process.env.DATA_DIR; }
  try { fs.accessSync('/var/data', fs.constants.W_OK); return '/var/data'; } catch { return __dirname; }
}
const DATA_DIR = pickDataDir();
const db = new DatabaseSync(process.env.DB_PATH || path.join(DATA_DIR, 'okul.db'));
db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');

db.exec(`
CREATE TABLE IF NOT EXISTS users(
  id INTEGER PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE,
  pass TEXT NOT NULL, bio TEXT DEFAULT '', avatar TEXT DEFAULT '', color TEXT NOT NULL, created_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS sessions(
  token TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, created_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS communities(
  id INTEGER PRIMARY KEY, slug TEXT NOT NULL UNIQUE, name TEXT NOT NULL, tagline TEXT DEFAULT '',
  description TEXT DEFAULT '', category TEXT DEFAULT 'Genel', is_private INTEGER DEFAULT 0, price_text TEXT DEFAULT '', pay_info TEXT DEFAULT '',
  price_type TEXT DEFAULT 'free', price_amount INTEGER DEFAULT 0, invite_code TEXT DEFAULT '', tabs TEXT DEFAULT '',
  post_role TEXT DEFAULT 'member', cover TEXT DEFAULT '', live_video TEXT DEFAULT '', live_title TEXT DEFAULT '', live_started INTEGER DEFAULT 0,
  categories TEXT NOT NULL, owner_id INTEGER NOT NULL REFERENCES users(id),
  color TEXT NOT NULL, emoji TEXT NOT NULL, created_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS memberships(
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  community_id INTEGER NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'member', joined_at INTEGER NOT NULL, paid_until INTEGER DEFAULT 0, PRIMARY KEY(user_id, community_id));
CREATE TABLE IF NOT EXISTS posts(
  id INTEGER PRIMARY KEY, community_id INTEGER NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id), title TEXT NOT NULL, body TEXT NOT NULL,
  category TEXT NOT NULL, pinned INTEGER DEFAULT 0, image TEXT DEFAULT '', poll TEXT DEFAULT '', file TEXT DEFAULT '', file_name TEXT DEFAULT '', created_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS comments(
  id INTEGER PRIMARY KEY, post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id), parent_id INTEGER, body TEXT NOT NULL, created_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS likes(
  id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL, target_type TEXT NOT NULL, target_id INTEGER NOT NULL,
  author_id INTEGER NOT NULL, community_id INTEGER NOT NULL, created_at INTEGER NOT NULL,
  UNIQUE(user_id, target_type, target_id));
CREATE INDEX IF NOT EXISTS likes_target ON likes(target_type, target_id);
CREATE INDEX IF NOT EXISTS likes_comm ON likes(community_id, author_id);
CREATE TABLE IF NOT EXISTS courses(
  id INTEGER PRIMARY KEY, community_id INTEGER NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
  title TEXT NOT NULL, description TEXT DEFAULT '', emoji TEXT DEFAULT '📘', min_level INTEGER DEFAULT 1, created_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS lessons(
  id INTEGER PRIMARY KEY, course_id INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  module TEXT NOT NULL, title TEXT NOT NULL, content TEXT DEFAULT '', video TEXT DEFAULT '', file TEXT DEFAULT '', file_name TEXT DEFAULT '', position INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS progress(
  user_id INTEGER NOT NULL, lesson_id INTEGER NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
  PRIMARY KEY(user_id, lesson_id));
CREATE TABLE IF NOT EXISTS events(
  id INTEGER PRIMARY KEY, community_id INTEGER NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
  title TEXT NOT NULL, description TEXT DEFAULT '', starts_at INTEGER NOT NULL,
  duration_min INTEGER DEFAULT 60, link TEXT DEFAULT '', created_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS notifications(
  id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL, actor_id INTEGER NOT NULL, type TEXT NOT NULL,
  post_id INTEGER NOT NULL, community_id INTEGER NOT NULL, is_read INTEGER DEFAULT 0, created_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS join_requests(
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  community_id INTEGER NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
  note TEXT DEFAULT '', created_at INTEGER NOT NULL, PRIMARY KEY(user_id, community_id));
CREATE TABLE IF NOT EXISTS messages(
  id INTEGER PRIMARY KEY, from_id INTEGER NOT NULL, to_id INTEGER NOT NULL, body TEXT NOT NULL,
  is_read INTEGER DEFAULT 0, created_at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS messages_pair ON messages(from_id, to_id);
CREATE TABLE IF NOT EXISTS poll_votes(
  post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE, user_id INTEGER NOT NULL, option_idx INTEGER NOT NULL,
  PRIMARY KEY(post_id, user_id));
CREATE TABLE IF NOT EXISTS live_chat(
  id INTEGER PRIMARY KEY, community_id INTEGER NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL, body TEXT NOT NULL, created_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS quiz_results(
  user_id INTEGER NOT NULL, lesson_id INTEGER NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
  score INTEGER NOT NULL, total INTEGER NOT NULL, at INTEGER NOT NULL, PRIMARY KEY(user_id, lesson_id));
CREATE TABLE IF NOT EXISTS resets(
  token TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, expires_at INTEGER NOT NULL);
`);

// Sonradan eklenen sütunlar: var olan veritabanlarında da oluşturulur
function addColumn(table, col, def) {
  if (!db.prepare(`PRAGMA table_info(${table})`).all().some(c => c.name === col)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${col} ${def}`);
}
addColumn('users', 'title', "TEXT DEFAULT ''");
addColumn('users', 'link', "TEXT DEFAULT ''");
addColumn('communities', 'rules', "TEXT DEFAULT ''");
addColumn('lessons', 'image', "TEXT DEFAULT ''");
addColumn('lessons', 'video_file', "TEXT DEFAULT ''");
addColumn('lessons', 'links', "TEXT DEFAULT ''");
addColumn('lessons', 'files', "TEXT DEFAULT ''");
addColumn('users', 'prefs', "TEXT DEFAULT ''");
addColumn('lessons', 'quiz', "TEXT DEFAULT ''");

// Marka renkleri: lacivert, mavi, altın. Profil ve topluluk renkleri yalnızca bunlardan seçilir.
const COLORS = ['#0f2747', '#1f5fd6', '#9a7016'];
const DEFAULT_CATEGORIES = ['Genel', 'Duyurular', 'Sorular', 'Kazanımlar'];

function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  return salt + ':' + crypto.scryptSync(password, salt, 32).toString('hex');
}
function checkPassword(password, stored) {
  const [salt, hash] = stored.split(':');
  const test = crypto.scryptSync(password, salt, 32);
  return crypto.timingSafeEqual(test, Buffer.from(hash, 'hex'));
}

// ---------- Örnek veri ----------
function seed() {
  if (process.env.SEED_DEMO === '0') return; // gerçek yayında örnek hesap ve topluluklar oluşturulmaz
  if (db.prepare('SELECT COUNT(*) n FROM users').get().n > 0) return;
  const H = 3600e3, D = 24 * H, now = Date.now();
  const ins = (sql, ...p) => Number(db.prepare(sql).run(...p).lastInsertRowid);
  db.exec('BEGIN');

  const pass = hashPassword('demo1234');
  const people = [
    ['Deniz Aydın', 'demo@okul.app', 'Ürün tasarımcısı. Öğrenmeyi ve paylaşmayı severim.'],
    ['Elif Kara', 'elif@okul.app', 'Topluluk kurucusu, eğitmen.'],
    ['Mert Yıldız', 'mert@okul.app', 'Yazılım geliştirici, kahve bağımlısı.'],
    ['Zeynep Arslan', 'zeynep@okul.app', 'Serbest çalışan illüstratör.'],
    ['Can Öztürk', 'can@okul.app', 'Koşucu, girişimci.'],
    ['Selin Demir', 'selin@okul.app', 'İçerik üreticisi.'],
    ['Burak Şahin', 'burak@okul.app', 'Veri analisti.'],
    ['Ayşe Çelik', 'ayse@okul.app', 'Yeni mezun, meraklı.'],
  ];
  const U = people.map(([n, e, b], i) =>
    ins('INSERT INTO users(name,email,pass,bio,color,created_at) VALUES(?,?,?,?,?,?)', n, e, pass, b, COLORS[i % COLORS.length], now - (60 - i) * D));

  ['Ürün tasarımcısı', 'Tasarım eğitmeni', 'Yazılım geliştirici', 'İllüstratör', 'Koşu antrenörü', 'İçerik üreticisi', 'Veri analisti', 'Öğrenci']
    .forEach((t, i) => db.prepare('UPDATE users SET title=? WHERE id=?').run(t, U[i]));

  const mkCommunity = (slug, name, tagline, description, category, emoji, color, owner, priv = 0) =>
    ins('INSERT INTO communities(slug,name,tagline,description,category,is_private,categories,owner_id,color,emoji,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)',
      slug, name, tagline, description, category, priv, JSON.stringify(DEFAULT_CATEGORIES), owner, color, emoji, now - 50 * D);

  const c1 = mkCommunity('tasarim-atolyesi', 'Tasarım Atölyesi', 'Arayüz tasarımını birlikte öğrenen üreticiler',
    'Tasarım Atölyesi; arayüz, tipografi ve ürün düşüncesi üzerine çalışan herkes için açık bir topluluktur.\n\nHer hafta canlı eleştiri oturumu yapıyor, kurslarımızı adım adım ilerliyor ve işlerimizi paylaşıyoruz. Yeni başlayan da olsan, yıllardır tasarlıyor da olsan yerin hazır.',
    'Tasarım', 'i:pen:blue', COLORS[1], U[1]);
  const c2 = mkCommunity('kod-kampi', 'Kod Kampı', 'Sıfırdan web geliştirmeye, proje yaparak',
    'Kod Kampı, web geliştirmeyi proje üreterek öğrenmek isteyenlerin buluşma noktası.\n\nSoru sor, kodunu paylaş, haftalık meydan okumalara katıl.', 'Yazılım', 'i:code:navy', COLORS[0], U[2]);
  const c3 = mkCommunity('sabah-kosuculari', 'Sabah Koşucuları', 'Güne koşarak başlayanların kulübü',
    'Her sabah 06:30. Tempo fark etmez, önemli olan çıkmak.\n\nAntrenman planları, yarış takvimi ve bolca motivasyon.', 'Spor', 'i:activity:gold', COLORS[2], U[4], 1);

  db.exec("UPDATE communities SET invite_code=lower(hex(randomblob(8)))");
  db.prepare("UPDATE communities SET price_type='monthly', price_amount=300, price_text=?, pay_info=? WHERE id=?").run('₺300 / ay',
    'Üyelik ücretini aşağıdaki hesaba gönderip açıklamaya adını yaz. Ödemen görülünce isteğin onaylanır.\n\nIBAN: TR00 0000 0000 0000 0000 0000 00 (örnek)\nAlıcı: Sabah Koşucuları', c3);
  const msg = (from, to, body, hoursAgo, read = 1) => ins('INSERT INTO messages(from_id,to_id,body,is_read,created_at) VALUES(?,?,?,?,?)', from, to, body, read, now - hoursAgo * H);
  msg(U[1], U[0], 'Merhaba Deniz, atölyeye hoş geldin! Takıldığın bir yer olursa yazabilirsin.', 30);
  msg(U[0], U[1], 'Teşekkürler Elif! İlk üç dersi bitirdim, çok faydalı.', 29);
  msg(U[1], U[0], 'Harika 👏 Perşembe günkü eleştiri oturumuna işini getirmek ister misin?', 2, 0);
  msg(U[3], U[0], 'Karanlık tema paylaşımın çok iyiydi, dosyayı görebilir miyim?', 6, 0);

  db.prepare('UPDATE communities SET rules=? WHERE id=?').run('1. Saygılı ol; eleştiri işe yapılır, kişiye değil.\n2. Soru sorarken neyi denediğini de yaz.\n3. Reklam ve konu dışı paylaşım yapma.', c1);
  const join = (u, c, role, daysAgo) => ins('INSERT INTO memberships(user_id,community_id,role,joined_at) VALUES(?,?,?,?)', u, c, role, now - daysAgo * D);
  U.forEach((u, i) => join(u, c1, u === U[1] ? 'admin' : 'member', 48 - i * 3));
  [2, 0, 3, 6, 7].forEach((i, k) => join(U[i], c2, i === 2 ? 'admin' : 'member', 40 - k * 4));
  [4, 5, 1].forEach((i, k) => join(U[i], c3, i === 4 ? 'admin' : 'member', 30 - k * 5));
  db.prepare('UPDATE memberships SET paid_until=? WHERE community_id=? AND user_id=?').run(now + 12 * D, c3, U[5]);
  db.prepare('UPDATE memberships SET paid_until=? WHERE community_id=? AND user_id=?').run(now + 3 * D, c3, U[1]);

  const post = (c, u, title, body, cat, hoursAgo, pinned = 0) =>
    ins('INSERT INTO posts(community_id,user_id,title,body,category,pinned,created_at) VALUES(?,?,?,?,?,?,?)', c, u, title, body, cat, pinned, now - hoursAgo * H);
  const comment = (p, u, body, hoursAgo, parent = null) =>
    ins('INSERT INTO comments(post_id,user_id,parent_id,body,created_at) VALUES(?,?,?,?,?)', p, u, parent, body, now - hoursAgo * H);
  const like = (u, type, id, author, c, hoursAgo) => {
    if (u !== author) db.prepare('INSERT OR IGNORE INTO likes(user_id,target_type,target_id,author_id,community_id,created_at) VALUES(?,?,?,?,?,?)').run(u, type, id, author, c, now - hoursAgo * H);
  };

  const p1 = post(c1, U[1], 'Hoş geldiniz! Buradan başlayın 👋', 'Atölyeye hoş geldin!\n\n1. Kendini bu gönderinin altında tanıt\n2. Sınıf sekmesinden "Arayüz Temelleri" kursuna başla\n3. Perşembe günkü canlı eleştiri oturumunu takvimine ekle\n\nGönderilere ve yorumlara gelen her beğeni sana puan kazandırır; puanlar seviyeni yükseltir.', 'Duyurular', 24 * 40, 1);
  const p2 = post(c1, U[3], 'İlk mobil uygulama tasarımımı bitirdim', 'Üç haftadır üzerinde çalıştığım bütçe takip uygulamasının ilk sürümü hazır. Özellikle boşluk sistemi konusunda kurstaki 8\'lik ızgara anlatımı çok işime yaradı.\n\nGeri bildirimlerinizi bekliyorum!', 'Kazanımlar', 5);
  const p3 = post(c1, U[7], 'Yazı tipi eşleştirirken nelere dikkat ediyorsunuz?', 'Başlık ve gövde metni için farklı aileler seçmek istiyorum ama hep uyumsuz duruyor. Kullandığınız bir yöntem var mı?', 'Sorular', 20);
  const p4 = post(c1, U[0], 'Haftalık paylaşım: karanlık tema denemelerim', 'Bu hafta aynı ekranın açık ve koyu sürümlerini çalıştım. Koyu temada yalnızca renkleri ters çevirmek yetmiyor; yüzey katmanlarını ayrı düşünmek gerekiyor.', 'Genel', 30);
  const p5 = post(c1, U[5], 'Portfolyo sitesi için araç önerisi', 'Kod yazmadan hızlıca portfolyo yayınlamak istiyorum. Ne kullanıyorsunuz, memnun musunuz?', 'Sorular', 52);
  const p6 = post(c1, U[6], 'Kontrast oranını kontrol etmenin kolay yolu', 'Metin ile arka plan arasındaki kontrastı tasarım aşamasında ölçmek, sonradan düzeltmekten çok daha ucuz. Küçük metinlerde en az 4.5:1 hedefleyin.', 'Genel', 100);

  const p7 = post(c1, U[1], 'Bir sonraki atölye konusu ne olsun?', 'Önümüzdeki ayın canlı atölyesi için oylarınızı bekliyorum. En çok oy alan konuyu işleyeceğiz.', 'Duyurular', 8);
  db.prepare('UPDATE posts SET poll=? WHERE id=?').run(JSON.stringify(['Tipografi', 'Renk ve kontrast', 'Mobil yerleşim', 'Tasarım sistemleri']), p7);
  [[2, 0], [3, 1], [4, 1], [5, 2], [6, 1], [7, 3]].forEach(([i, o]) => db.prepare('INSERT INTO poll_votes(post_id,user_id,option_idx) VALUES(?,?,?)').run(p7, U[i], o));
  [0, 3, 6].forEach(i => like(U[i], 'post', p7, U[1], c1, 7));

  const cm1 = comment(p1, U[0], 'Merhaba! Ben Deniz, ürün tasarımcısıyım. Burada olmak harika.', 24 * 38);
  comment(p1, U[1], 'Hoş geldin Deniz!', 24 * 38 - 1, cm1);
  const cm2 = comment(p2, U[1], 'Eline sağlık Zeynep, boşluklar gerçekten çok dengeli olmuş.', 4);
  comment(p2, U[3], 'Teşekkürler Elif 🙏', 3, cm2);
  const cm3 = comment(p2, U[0], 'Ana ekrandaki özet kartı çok net. Tebrikler!', 2);
  const cm4 = comment(p3, U[0], 'Ben tek bir aile ile başlayıp yalnızca kalınlıkla hiyerarşi kuruyorum. İkinci aileyi ancak gerçekten gerekirse ekliyorum.', 18);
  const cm5 = comment(p3, U[6], 'x-yüksekliği benzer olan aileleri seçmek çoğu uyumsuzluğu çözüyor.', 15);
  const cm6 = comment(p4, U[3], 'Yüzey katmanları konusu çok doğru, ben de aynı duvara çarpmıştım.', 28);
  comment(p5, U[2], 'Basit bir statik site üreticisi fazlasıyla yeter.', 50);

  [[0, p1, 900], [2, p1, 800], [3, p1, 700], [4, p1, 300], [5, p1, 100], [6, p1, 50], [7, p1, 20]].forEach(([i, p, h]) => like(U[i], 'post', p, U[1], c1, h));
  [0, 1, 2, 5, 6].forEach((i, k) => like(U[i], 'post', p2, U[3], c1, 4 - k * 0.5));
  [0, 1, 3].forEach(i => like(U[i], 'post', p3, U[7], c1, 17));
  [1, 3, 5, 6, 7].forEach((i, k) => like(U[i], 'post', p4, U[0], c1, 29 - k));
  [1, 2].forEach(i => like(U[i], 'post', p5, U[5], c1, 48));
  [0, 1, 3, 4].forEach(i => like(U[i], 'post', p6, U[6], c1, 90));
  [1, 3, 7].forEach(i => like(U[i], 'comment', cm1, U[0], c1, 800));
  [3, 0].forEach(i => like(U[i], 'comment', cm2, U[1], c1, 3));
  [3, 1].forEach(i => like(U[i], 'comment', cm3, U[0], c1, 1));
  [7, 1, 3, 6].forEach(i => like(U[i], 'comment', cm4, U[0], c1, 16));
  [7, 0, 1].forEach(i => like(U[i], 'comment', cm5, U[6], c1, 14));
  [0, 1].forEach(i => like(U[i], 'comment', cm6, U[3], c1, 27));

  const q1 = post(c2, U[2], 'Kampa hoş geldiniz — kurallar ve yol haritası', 'Burada herkes öğreniyor. Soru sormaktan çekinme, kodunu paylaşırken neyi denediğini de yaz.\n\nYol haritası: HTML → CSS → JavaScript → ilk proje.', 'Duyurular', 24 * 35, 1);
  const q2 = post(c2, U[0], 'Flexbox mı, Grid mi?', 'Tek boyutlu hizalamada flexbox, iki boyutlu yerleşimde grid kullanıyorum. Sizin kuralınız ne?', 'Sorular', 9);
  const q3 = post(c2, U[7], 'İlk sayfam yayında!', 'Kurstaki ilk projeyi bitirdim ve yayınladım. Küçük bir adım ama çok mutluyum.', 'Kazanımlar', 26);
  comment(q2, U[2], 'Aynen böyle. İkisini birlikte kullanmak da gayet normal.', 8);
  comment(q3, U[2], 'Tebrikler Ayşe, devamı gelsin!', 25);
  [0, 3, 6, 7].forEach(i => like(U[i], 'post', q1, U[2], c2, 500));
  [2, 3, 6].forEach(i => like(U[i], 'post', q2, U[0], c2, 8));
  [0, 2, 3, 6].forEach(i => like(U[i], 'post', q3, U[7], c2, 24));

  const r1 = post(c3, U[4], 'Bu haftanın planı', 'Pazartesi hafif tempo 5 km, çarşamba interval, cumartesi uzun koşu. Sahilde buluşuyoruz.', 'Duyurular', 12, 1);
  like(U[5], 'post', r1, U[4], c3, 10); like(U[1], 'post', r1, U[4], c3, 9);

  const course = (c, title, desc, emoji) => ins('INSERT INTO courses(community_id,title,description,emoji,created_at) VALUES(?,?,?,?,?)', c, title, desc, emoji, now - 45 * D);
  const lesson = (co, mod, title, content, pos) => ins('INSERT INTO lessons(course_id,module,title,content,position) VALUES(?,?,?,?,?)', co, mod, title, content, pos);

  const k1 = course(c1, 'Arayüz Temelleri', 'Boşluk, hiyerarşi, renk ve tipografi: iyi bir arayüzün dört temel taşı.', 'i:layers:blue');
  const L = [
    lesson(k1, '1. Başlangıç', 'Kursa genel bakış', 'Bu kursta iyi bir arayüzü oluşturan temel kararları öğreneceksin.\n\nHer dersin sonunda küçük bir alıştırma var. Alıştırmanı toplulukta paylaşmayı unutma; en hızlı öğrenme yolu geri bildirim almaktır.', 1),
    lesson(k1, '1. Başlangıç', 'İyi tasarım nedir?', 'İyi tasarım dikkat çekmez; kullanıcının işini kolaylaştırır.\n\nÜç soru sor:\n- Kullanıcı burada ne yapmak istiyor?\n- Bunu yapmak için neye bakması gerekiyor?\n- Ekrandaki her öğe bu amaca hizmet ediyor mu?\n\nAlıştırma: Sık kullandığın bir uygulamanın ana ekranını bu üç soruyla değerlendir.', 2),
    lesson(k1, '2. Yerleşim', 'Boşluk sistemi kurmak', 'Rastgele boşluklar yerine sabit bir ölçek kullan: 4, 8, 12, 16, 24, 32, 48.\n\nİlişkili öğeler birbirine yakın, ilişkisiz öğeler uzak durmalı. Boşluk, çizgiden daha güçlü bir ayırıcıdır.\n\nAlıştırma: Bir kart bileşenini yalnızca bu ölçekteki değerlerle yeniden çiz.', 3),
    lesson(k1, '2. Yerleşim', 'Görsel hiyerarşi', 'Her ekranda tek bir ana odak olmalı. Hiyerarşiyi boyut, kalınlık ve kontrastla kurarsın; hepsini aynı anda kullanmak zorunda değilsin.\n\nİkincil bilgiyi küçültmek yerine rengini yumuşatmayı dene.', 4),
    lesson(k1, '3. Stil', 'Renk paleti oluşturmak', 'Bir nötr ölçek, bir vurgu rengi ve durum renkleri (başarı, uyarı, hata) çoğu ürün için yeterlidir.\n\nVurgu rengini az kullan: ne kadar az kullanırsan o kadar güçlü olur.', 5),
    lesson(k1, '3. Stil', 'Tipografi ölçeği', 'Az sayıda yazı boyutu seç ve onlara sadık kal: 13, 15, 18, 24, 32.\n\nSatır uzunluğunu 60–75 karakter arasında tut; satır yüksekliğini gövde metninde 1.5 civarında bırak.', 6),
  ];
  db.prepare('UPDATE lessons SET links=? WHERE id=?').run(JSON.stringify([{ title: 'Renk kontrastı denetleyici', url: 'https://webaim.org/resources/contrastchecker/' }, { title: 'Boşluk ölçeği üzerine yazı', url: 'https://example.com/bosluk-olcegi' }]), L[2]);
  db.prepare('UPDATE lessons SET quiz=? WHERE id=?').run(JSON.stringify([
    { q: 'Boşluk ölçeği kullanmanın temel faydası nedir?', options: ['Tasarımın tutarlı görünmesi', 'Dosya boyutunun küçülmesi', 'Renklerin daha canlı olması'], correct: 0 },
    { q: 'Birbiriyle ilişkili öğeler nasıl yerleştirilmeli?', options: ['Birbirinden uzak', 'Birbirine yakın', 'Rastgele'], correct: 1 },
  ]), L[2]);
  const k2 = course(c1, 'Portfolyo Hazırlama', 'İşlerini hikâyeleştirerek sunmanın yolları.', 'i:briefcase:navy');
  db.prepare('UPDATE courses SET min_level=3 WHERE id=?').run(k2);
  lesson(k2, 'Giriş', 'Hangi işleri seçmeli?', 'Az ama derin: üç iyi anlatılmış proje, on yüzeysel projeden iyidir.', 1);
  lesson(k2, 'Giriş', 'Vaka çalışması yazmak', 'Problem → süreç → karar → sonuç. Ekran görüntüsünden önce kararlarını anlat.', 2);
  const k3 = course(c2, 'Web\'e İlk Adım', 'HTML ve CSS ile ilk sayfanı yayınla.', 'i:monitor:blue');
  lesson(k3, 'HTML', 'Belge yapısı', 'Her sayfa bir iskeletle başlar: başlık, gövde ve anlamlı etiketler.', 1);
  lesson(k3, 'HTML', 'Bağlantılar ve görseller', 'Bağlantı metni nereye gittiğini söylemeli. Görsellere her zaman alternatif metin yaz.', 2);
  lesson(k3, 'CSS', 'Seçiciler ve kutu modeli', 'Her öğe bir kutudur: içerik, iç boşluk, kenarlık, dış boşluk.', 3);
  [L[0], L[1], L[2]].forEach(l => db.prepare('INSERT INTO progress(user_id,lesson_id) VALUES(?,?)').run(U[0], l));

  const event = (c, title, desc, daysFromNow, hour, dur, link = '') => {
    const d = new Date(now + daysFromNow * D); d.setHours(hour, 0, 0, 0);
    ins('INSERT INTO events(community_id,title,description,starts_at,duration_min,link,created_at) VALUES(?,?,?,?,?,?,?)', c, title, desc, d.getTime(), dur, link, now);
  };
  event(c1, 'Canlı Eleştiri Oturumu', 'İşini getir, birlikte bakalım. Sıra almak için gönderi aç.', 2, 20, 90);
  event(c1, 'Soru-Cevap: Portfolyo', 'Portfolyo hazırlığıyla ilgili sorularınızı yanıtlıyoruz.', 9, 19, 60);
  event(c1, 'Aylık Tasarım Meydan Okuması', 'Tema o gün açıklanacak. 48 saat süre!', 16, 10, 30);
  event(c1, 'Yeni Üye Karşılama', 'Yeni katılanlarla tanışma buluşması.', -5, 21, 45);
  event(c2, 'Kod İnceleme Saati', 'Projeni ekran paylaşımıyla birlikte inceliyoruz.', 3, 21, 60);
  event(c3, 'Cumartesi Uzun Koşu', 'Sahil parkuru, 12 km.', 4, 7, 90);

  db.exec('COMMIT');
}
seed();

module.exports = { db, hashPassword, checkPassword, COLORS, DEFAULT_CATEGORIES, DATA_DIR };
