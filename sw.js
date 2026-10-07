/* 논어통독 오디오북 서비스워커: 앱 화면은 오프라인용으로 보관, 음성은 '저장'한 장만 보관 */
var SHELL = 'nonuh-shell-v5';
var AUDIO = 'nonuh-audio-v2';
var FONTS = 'nonuh-fonts-v1';
var SHELL_FILES = ['./', './index.html', './quiz.html', './data.bin', './manifest.webmanifest', './icons/icon-192.png', './icons/icon-512.png', './icons/apple-touch-icon.png'];

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(SHELL).then(function (c) { return c.addAll(SHELL_FILES); }).then(function () { return self.skipWaiting(); }));
});

self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return (k.indexOf('nonuh-shell-') === 0 && k !== SHELL) || (k.indexOf('nonuh-audio-') === 0 && k !== AUDIO); }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

function rangeResponse(req, res) {
  var range = req.headers.get('range');
  if (!range) return res;
  return res.arrayBuffer().then(function (buf) {
    var size = buf.byteLength;
    var m = /bytes=(\d*)-(\d*)/.exec(range) || [];
    var start = m[1] ? parseInt(m[1], 10) : 0;
    var end = m[2] ? parseInt(m[2], 10) : size - 1;
    if (!m[1] && m[2]) { start = Math.max(0, size - parseInt(m[2], 10)); end = size - 1; }
    end = Math.min(end, size - 1);
    if (start >= size) return new Response(null, { status: 416, headers: { 'Content-Range': 'bytes */' + size } });
    return new Response(buf.slice(start, end + 1), {
      status: 206,
      headers: { 'Content-Type': 'audio/mpeg', 'Content-Length': String(end - start + 1), 'Content-Range': 'bytes ' + start + '-' + end + '/' + size, 'Accept-Ranges': 'bytes' }
    });
  });
}

function timeout(ms, p) {
  return new Promise(function (resolve, reject) {
    var t = setTimeout(function () { reject(new Error('timeout')); }, ms);
    p.then(function (v) { clearTimeout(t); resolve(v); }, function (err) { clearTimeout(t); reject(err); });
  });
}

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;
  var url = new URL(req.url);

  // 음성: 저장해 둔 장이면 기기에서, 아니면 인터넷에서
  if (url.origin === location.origin && /\/audio\/[^/]+\.mp3$/.test(url.pathname)) {
    e.respondWith(caches.open(AUDIO).then(function (c) {
      return c.match(url.origin + url.pathname).then(function (hit) {
        return hit ? rangeResponse(req, hit) : fetch(req);
      });
    }));
    return;
  }

  // 글꼴: 한 번 받은 것은 계속 사용
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    e.respondWith(caches.open(FONTS).then(function (c) {
      return c.match(req).then(function (hit) {
        var net = fetch(req).then(function (res) { if (res && (res.ok || res.type === 'opaque')) c.put(req, res.clone()); return res; });
        return hit || net;
      });
    }));
    return;
  }

  // 앱 화면: 인터넷이 되면 새 버전, 안 되면 보관본
  if (url.origin === location.origin) {
    e.respondWith(caches.open(SHELL).then(function (c) {
      return timeout(5000, fetch(req)).then(function (res) {
        if (res && res.ok) c.put(req, res.clone());
        return res;
      }).catch(function () {
        return c.match(req, { ignoreSearch: true }).then(function (hit) {
          return hit || (req.mode === 'navigate' ? c.match('./index.html') : Response.error());
        });
      });
    }));
  }
});
