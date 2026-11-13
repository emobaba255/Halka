// Sayfa çizilmeden önce kayıtlı temayı uygular (açılışta renk değişimi görünmesin diye ayrı ve erken yüklenir)
try {
  var t = localStorage.getItem('theme');
  if (t === 'dark' || t === 'light') document.documentElement.dataset.theme = t;
} catch (e) { /* depolama kapalıysa cihaz ayarı kullanılır */ }
