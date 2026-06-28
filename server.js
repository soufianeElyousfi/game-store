const express = require('express');
const cors = require('cors');
const gplay = require('google-play-scraper').default;
const https = require('https');
const http = require('http');

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.static(__dirname));

// Serve index.html for root
app.get('/', (req, res) => res.sendFile(__dirname + '/index.html'));

// ─── Image Proxy ─── avoid CORS issues with Google Play images
app.get('/img', (req, res) => {
  const url = req.query.url;
  if (!url || !url.startsWith('https://')) return res.status(400).end();
  const mod = url.startsWith('https') ? https : http;
  mod.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (imgRes) => {
    res.setHeader('Content-Type', imgRes.headers['content-type'] || 'image/webp');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    imgRes.pipe(res);
  }).on('error', () => res.status(502).end());
});

// ─── Language Detection ───
// Map Accept-Language codes to Google Play lang/country pairs
const LANG_MAP = {
  ar: { lang: 'ar', country: 'sa', dir: 'rtl', label: 'ar' },
  en: { lang: 'en', country: 'us', dir: 'ltr', label: 'en' },
  fr: { lang: 'fr', country: 'fr', dir: 'ltr', label: 'fr' },
  de: { lang: 'de', country: 'de', dir: 'ltr', label: 'de' },
  es: { lang: 'es', country: 'es', dir: 'ltr', label: 'es' },
  tr: { lang: 'tr', country: 'tr', dir: 'ltr', label: 'tr' },
  ru: { lang: 'ru', country: 'ru', dir: 'ltr', label: 'ru' },
  ja: { lang: 'ja', country: 'jp', dir: 'ltr', label: 'ja' },
  zh: { lang: 'zh', country: 'cn', dir: 'ltr', label: 'zh' },
  ko: { lang: 'ko', country: 'kr', dir: 'ltr', label: 'ko' },
};

function detectLocale(req) {
  // 1. ?lang=ar query param overrides everything
  if (req.query.lang && LANG_MAP[req.query.lang]) {
    return LANG_MAP[req.query.lang];
  }
  // 2. Parse Accept-Language header  e.g. "ar-SA,ar;q=0.9,en;q=0.8"
  const header = req.headers['accept-language'] || '';
  const codes = header.split(',').map(s => s.split(';')[0].trim().slice(0, 2).toLowerCase());
  for (const code of codes) {
    if (LANG_MAP[code]) return LANG_MAP[code];
  }
  return LANG_MAP.ar; // default Arabic
}

// ─── Cache ───
const cache = new Map();
const CACHE_TTL = 10 * 60 * 1000;

function cached(key, fn) {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.time < CACHE_TTL) return Promise.resolve(hit.data);
  return fn().then(data => { cache.set(key, { data, time: Date.now() }); return data; });
}

// ─── Categories ───
const CATEGORIES = {
  all:       gplay.category.GAME,
  action:    gplay.category.GAME_ACTION,
  rpg:       gplay.category.GAME_ROLE_PLAYING,
  strategy:  gplay.category.GAME_STRATEGY,
  sports:    gplay.category.GAME_SPORTS,
  puzzle:    gplay.category.GAME_PUZZLE,
  racing:    gplay.category.GAME_RACING,
  adventure: gplay.category.GAME_ADVENTURE,
};

function proxyImg(url) {
  if (!url) return null;
  return `/img?url=${encodeURIComponent(url)}`;
}

function formatApp(item, catKey, locale) {
  return {
    id:          item.appId,
    name:        item.title,
    dev:         item.developer,
    cat:         catKey,
    icon:        proxyImg(item.icon),
    banner:      proxyImg(item.headerImage || (item.screenshots && item.screenshots[0]) || null),
    rating:      item.score ? +item.score.toFixed(1) : 0,
    downloads:   item.installs || '—',
    installs:    item.installs || '—',
    size:        item.size || '—',
    android:     item.androidVersion || '—',
    desc:        item.summary || '',
    descFull:    item.description || item.summary || '',
    screenshots: (item.screenshots || []).map(proxyImg),
    tags:        item.genre ? [item.genre] : [],
    url:         `https://play.google.com/store/apps/details?id=${item.appId}&hl=${locale.lang}`,
    free:        item.free !== false,
    price:       item.priceText || (locale.lang === 'ar' ? 'مجاني' : 'Free'),
    lang:        locale.lang,
  };
}

// GET /api/locale — let browser know detected locale
app.get('/api/locale', (req, res) => {
  res.json(detectLocale(req));
});

// GET /api/games?cat=action&limit=20
app.get('/api/games', async (req, res) => {
  try {
    const locale  = detectLocale(req);
    const catKey  = req.query.cat || 'all';
    const limit   = Math.min(parseInt(req.query.limit) || 20, 24);
    const gcat    = CATEGORIES[catKey] || gplay.category.GAME;

    const key = `list:${catKey}:${limit}:${locale.lang}`;
    const apps = await cached(key, () =>
      gplay.list({ category: gcat, collection: gplay.collection.TOP_FREE, num: limit, lang: locale.lang, country: locale.country, fullDetail: true })
    );
    res.json({ ok: true, games: apps.map(a => formatApp(a, catKey, locale)), locale });
  } catch (err) {
    console.error('list error:', err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// GET /api/game/:id
app.get('/api/game/:id', async (req, res) => {
  try {
    const locale = detectLocale(req);
    const id     = req.params.id;
    const key    = `detail:${id}:${locale.lang}`;
    const detail = await cached(key, () =>
      gplay.app({ appId: id, lang: locale.lang, country: locale.country })
    );
    res.json({ ok: true, game: formatApp(detail, 'all', locale), locale });
  } catch (err) {
    console.error('detail error:', err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// GET /api/search?q=pubg
app.get('/api/search', async (req, res) => {
  try {
    const locale = detectLocale(req);
    const q      = req.query.q || '';
    const limit  = Math.min(parseInt(req.query.limit) || 20, 30);
    if (!q.trim()) return res.json({ ok: true, games: [], locale });

    const key = `search:${q}:${limit}:${locale.lang}`;
    const results = await cached(key, () =>
      gplay.search({ term: q, num: limit, lang: locale.lang, country: locale.country, fullDetail: true })
    );
    res.json({ ok: true, games: results.map(a => formatApp(a, 'all', locale)), locale });
  } catch (err) {
    console.error('search error:', err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// GET /api/featured
app.get('/api/featured', async (req, res) => {
  try {
    const locale = detectLocale(req);
    const key    = `featured:${locale.lang}`;
    const apps   = await cached(key, () =>
      gplay.list({ category: gplay.category.GAME, collection: gplay.collection.GROSSING, num: 6, lang: locale.lang, country: locale.country, fullDetail: true })
    );
    res.json({ ok: true, games: apps.map(a => formatApp(a, 'all', locale)), locale });
  } catch (err) {
    console.error('featured error:', err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n✅ GameStore API → http://localhost:${PORT}`);
  console.log(`   الموقع         → http://localhost:${PORT}/index.html`);
  console.log(`   الشبكة         → http://192.168.1.108:${PORT}/index.html\n`);
});
