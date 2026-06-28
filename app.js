(() => {
  const API = '/api';

  // ─── State ───
  let currentCat = 'all';
  let currentSort = 'default';
  let allGamesCache = [];    // raw list for client-side sort
  let heroIndex = 0;
  let heroTimer = null;
  let featuredGames = [];
  let searchTimeout = null;
  let locale = { lang: 'ar', dir: 'rtl' };

  // ─── i18n labels ───
  const T = {
    ar: {
      search: 'ابحث عن لعبة...', featured: 'مميز', download: 'تحميل مجاني',
      topGames: 'الأكثر تحميلاً', newGames: 'إصدارات جديدة', allGames: 'جميع الألعاب',
      seeAll: 'عرض الكل', free: 'مجاني', rating: 'التقييم', downloads: 'تحميل',
      size: 'الحجم', android: 'أندرويد', about: 'عن اللعبة', screenshots: 'لقطات الشاشة',
      searchResults: q => `نتائج البحث (${q})`, searching: 'جاري البحث...',
      noResults: 'لا توجد ألعاب تطابق بحثك', noScreenshots: 'لا توجد لقطات شاشة',
      openPlay: n => `جاري فتح ${n} في Google Play`, loading: 'جاري التحميل...',
      offline: 'تعذّر الاتصال بالخادم. تأكد من تشغيل server.js',
      sortDefault: 'الافتراضي', sortRating: 'التقييم', sortDownloads: 'التحميل', sortName: 'الاسم',
      cats: { all:'الكل', action:'أكشن', rpg:'RPG', strategy:'استراتيجية', sports:'رياضة', puzzle:'ألغاز', racing:'سباقات', adventure:'مغامرة' },
    },
    en: {
      search: 'Search for a game...', featured: 'Featured', download: 'Free Download',
      topGames: 'Top Charts', newGames: 'New Releases', allGames: 'All Games',
      seeAll: 'See all', free: 'Free', rating: 'Rating', downloads: 'Downloads',
      size: 'Size', android: 'Android', about: 'About this game', screenshots: 'Screenshots',
      searchResults: q => `Search results (${q})`, searching: 'Searching...',
      noResults: 'No games match your search', noScreenshots: 'No screenshots available',
      openPlay: n => `Opening ${n} on Google Play`, loading: 'Loading...',
      offline: 'Cannot connect to server. Make sure server.js is running.',
      sortDefault: 'Default', sortRating: 'Rating', sortDownloads: 'Downloads', sortName: 'Name',
      cats: { all:'All', action:'Action', rpg:'RPG', strategy:'Strategy', sports:'Sports', puzzle:'Puzzle', racing:'Racing', adventure:'Adventure' },
    },
  };

  function t(key, arg) {
    const lang = locale.lang in T ? locale.lang : 'en';
    const val = T[lang][key];
    return typeof val === 'function' ? val(arg) : (val ?? key);
  }

  // ─── Helpers ───
  const $ = id => document.getElementById(id);

  function decodeHtml(str) {
    if (!str) return '';
    return str
      .replace(/<br\s*\/?>/gi, ' ')
      .replace(/<[^>]+>/g, '')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&nbsp;/g, ' ')
      .replace(/&#(\d+);/g, (_, c) => String.fromCharCode(+c));
  }

  function applyLocale(loc) {
    locale = loc;
    const lang = loc.lang in T ? loc.lang : 'en';
    document.documentElement.lang = loc.lang;
    document.documentElement.dir = loc.dir;
    // Update static text
    $('searchInput').placeholder = t('search');
    $('heroBadge').textContent   = t('featured');
    const heroSpans = $('heroDownloadBtn').querySelectorAll('span');
    if (heroSpans[1]) heroSpans[1].textContent = t('download');
    $('titleTopGames').textContent = t('topGames');
    $('titleNewGames').textContent  = t('newGames');
    $('titleAllGames').textContent  = t('allGames');
    document.querySelectorAll('.see-all-text').forEach(el => el.textContent = t('seeAll'));
    // Update sort labels
    if ($('sortLabelDefault'))   $('sortLabelDefault').textContent   = t('sortDefault');
    if ($('sortLabelRating'))    $('sortLabelRating').textContent    = t('sortRating');
    if ($('sortLabelDownloads')) $('sortLabelDownloads').textContent = t('sortDownloads');
    if ($('sortLabelName'))      $('sortLabelName').textContent      = t('sortName');
    // Update category buttons
    document.querySelectorAll('.cat-btn').forEach(btn => {
      const key = btn.dataset.cat;
      btn.textContent = T[lang].cats[key] || btn.textContent;
    });
  }

  function stars(n) {
    return `<span class="material-icons star-icon">star</span>${(+n || 0).toFixed(1)}`;
  }

  function showToast(msg, icon = 'check_circle') {
    $('toastIcon').textContent = icon;
    $('toastMsg').textContent  = msg;
    const el = $('toast');
    el.classList.add('show');
    setTimeout(() => el.classList.remove('show'), 3000);
  }

  function skeletonRow() {
    return `<div class="loading-row">${Array(6).fill(`
      <div class="skeleton-card">
        <div class="skeleton-thumb"></div>
        <div class="skeleton-body">
          <div class="skeleton-line w80"></div>
          <div class="skeleton-line w50"></div>
        </div>
      </div>`).join('')}</div>`;
  }

  function skeletonGrid() {
    return Array(8).fill(`
      <div class="skeleton-grid">
        <div class="skeleton-thumb-lg"></div>
        <div class="skeleton-body" style="padding:12px">
          <div class="skeleton-line w80"></div>
          <div class="skeleton-line w60" style="margin-top:8px"></div>
          <div class="skeleton-line w40" style="margin-top:8px"></div>
        </div>
      </div>`).join('');
  }

  // ─── Image helper with fallback ───
  function imgTag(src, alt, cls) {
    if (!src) return `<div class="img-wrap failed" style="width:100%;height:100%;"></div>`;
    return `<div class="img-wrap">
      <img src="${src}" alt="${alt || ''}" class="${cls || ''}" loading="lazy"
        onerror="this.classList.add('hidden');this.parentElement.classList.add('failed')" />
    </div>`;
  }

  // ─── API ───
  async function apiFetch(path) {
    const res = await fetch(`${API}${path}`);
    return res.json();
  }

  // ─── Hero ───
  function buildHero(games) {
    featuredGames = games.slice(0, 6);
    const ind = $('heroIndicators');
    ind.innerHTML = featuredGames.map((_, i) =>
      `<button class="hero-dot${i===0?' active':''}" data-i="${i}"></button>`
    ).join('');
    ind.querySelectorAll('.hero-dot').forEach(btn =>
      btn.addEventListener('click', e => { e.stopPropagation(); setHero(+btn.dataset.i); resetTimer(); })
    );
    setHero(0);
    resetTimer();
    $('heroGame').onclick = () => openModal(featuredGames[heroIndex]);
    $('heroDownloadBtn').onclick = e => { e.stopPropagation(); triggerDownload(featuredGames[heroIndex]); };
  }

  function setHero(i) {
    if (!featuredGames.length) return;
    heroIndex = i;
    const g = featuredGames[i];
    const bg = $('heroBg');
    const fallback = 'linear-gradient(135deg,#1a1a2e,#2d3561)';
    if (g.banner) {
      const probe = new Image();
      probe.onload  = () => {
        if (heroIndex !== i) return; // skip if hero changed while loading
        bg.style.cssText = `background-image:url('${g.banner}');background-size:cover;background-position:center;`;
      };
      probe.onerror = () => {
        if (heroIndex !== i) return;
        bg.style.cssText = `background:${fallback};`;
      };
      probe.src = g.banner;
    } else {
      bg.style.cssText = `background:${fallback};`;
    }
    $('heroTitle').textContent = g.name;
    $('heroDesc').textContent  = decodeHtml(g.desc || '').slice(0, 110) + '...';
    $('heroRating').textContent = g.rating || '';
    $('heroSize').textContent   = g.size !== '—' ? `📦 ${g.size}` : '';
    document.querySelectorAll('.hero-dot').forEach((d, idx) =>
      d.classList.toggle('active', idx === i)
    );
  }

  function resetTimer() {
    clearInterval(heroTimer);
    if (featuredGames.length > 1)
      heroTimer = setInterval(() => setHero((heroIndex + 1) % featuredGames.length), 5000);
  }

  // ─── Cards ───
  function makeRowCard(g) {
    const el = document.createElement('div');
    el.className = 'game-card';
    el.innerHTML = `
      <div class="game-card-thumb-wrap">${imgTag(g.banner, g.name)}</div>
      <div class="game-card-body">
        <div class="game-card-icon-row">
          <div class="game-card-icon-wrap">${imgTag(g.icon, '')}</div>
          <span class="game-card-name">${g.name}</span>
        </div>
        <div class="game-card-meta">
          <span class="game-card-rating">${stars(g.rating)}</span>
          <span class="game-card-free">${g.price || t('free')}</span>
        </div>
        <div class="game-card-size" data-id="${g.id}">
          <span class="material-icons">download</span>
          <span class="size-val loading-dots">...</span>
        </div>
      </div>`;
    el.addEventListener('click', () => openModal(g));
    return el;
  }

  function makeGridCard(g) {
    const el = document.createElement('div');
    el.className = 'game-grid-card';
    const thumbHtml = g.banner
      ? `<div class="game-grid-thumb-wrap">${imgTag(g.banner, g.name)}</div>`
      : `<div class="game-grid-thumb-wrap game-grid-thumb-placeholder">
           <div class="game-grid-icon-placeholder">${imgTag(g.icon, g.name)}</div>
         </div>`;
    el.innerHTML = `
      ${thumbHtml}
      <div class="game-grid-body">
        <div class="game-grid-icon-wrap">${imgTag(g.icon, '')}</div>
        <div class="game-grid-info">
          <div class="game-grid-name">${g.name}</div>
          <div class="game-grid-dev">${g.dev}</div>
          <div class="game-grid-footer">
            <span class="game-grid-rating">${stars(g.rating)}</span>
            <span class="game-grid-cat">${g.catLabel || g.cat}</span>
          </div>
          <div class="game-grid-size" data-id="${g.id}">
            <span class="material-icons">download</span>
            <span class="size-val loading-dots">...</span>
          </div>
        </div>
      </div>`;
    el.addEventListener('click', () => openModal(g));
    return el;
  }

  // ─── Lazy Installs Loader ───
  const detailCache = {};
  let lazyQueue = [];
  let lazyTimer = null;

  const lazyObserver = new IntersectionObserver((entries) => {
    entries.forEach(e => { if (e.isIntersecting) lazyQueue.push(e.target); });
    clearTimeout(lazyTimer);
    lazyTimer = setTimeout(processQueue, 300);
  }, { rootMargin: '100px' });

  async function processQueue() {
    const batch = lazyQueue.splice(0, 5); // process 5 at a time
    await Promise.all(batch.map(async el => {
      lazyObserver.unobserve(el);
      const id = el.dataset.id;
      if (!id) return;
      try {
        if (!detailCache[id]) {
          const json = await apiFetch(`/game/${encodeURIComponent(id)}`);
          detailCache[id] = json.ok ? json.game : null;
        }
        const detail = detailCache[id];
        const val = detail?.downloads && detail.downloads !== '—' ? detail.downloads : '—';
        document.querySelectorAll(`[data-id="${id}"] .size-val`).forEach(span => {
          span.textContent = val;
          span.classList.remove('loading-dots');
        });
      } catch { /* ignore */ }
    }));
    if (lazyQueue.length) setTimeout(processQueue, 500);
  }

  function observeInstalls(container) {
    container.querySelectorAll('[data-id]').forEach(el => lazyObserver.observe(el));
  }

  // ─── Render ───
  function renderRow(id, games) {
    const c = $(id);
    c.innerHTML = '';
    games.slice(0, 10).forEach(g => c.appendChild(makeRowCard(g)));
    observeInstalls(c);
  }

  function sortGames(games) {
    const sorted = [...games];
    if (currentSort === 'rating')    return sorted.sort((a, b) => (b.rating || 0) - (a.rating || 0));
    if (currentSort === 'downloads') return sorted.sort((a, b) => parseDownloads(b.downloads) - parseDownloads(a.downloads));
    if (currentSort === 'name')      return sorted.sort((a, b) => a.name.localeCompare(b.name));
    return sorted; // default
  }

  function parseDownloads(str) {
    if (!str || str === '—') return 0;
    const n = parseFloat(str.replace(/[^0-9.]/g, ''));
    if (/B/i.test(str)) return n * 1e9;
    if (/M/i.test(str)) return n * 1e6;
    if (/K/i.test(str)) return n * 1e3;
    return n || 0;
  }

  function renderGrid(games, cache = true) {
    if (cache) allGamesCache = games;
    const toShow = sortGames(games);
    const c = $('gamesGrid');
    c.innerHTML = '';
    if (!toShow.length) {
      c.innerHTML = `<div class="no-results" style="grid-column:1/-1">
        <span class="material-icons">search_off</span>
        <p>${t('noResults')}</p></div>`;
      return;
    }
    toShow.forEach(g => c.appendChild(makeGridCard(g)));
    observeInstalls(c);
  }

  // ─── Modal ───
  async function openModal(g) {
    // ── Banner background via <img> tag (avoids backgroundImage CORS issues) ──
    const bgEl = $('modalBg');
    bgEl.innerHTML = '';
    bgEl.style.background = 'linear-gradient(135deg,#1a1a2e,#2d3561)';
    if (g.banner) {
      const bgImg = document.createElement('img');
      bgImg.src = g.banner;
      bgImg.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;object-fit:cover;';
      bgImg.onerror = () => bgImg.remove();
      bgEl.appendChild(bgImg);
    }

    // ── Icon ──
    const iconEl = $('modalIcon');
    iconEl.innerHTML = '';
    iconEl.style.background = '#f0f0f0';
    if (g.icon) {
      const ico = document.createElement('img');
      ico.src = g.icon;
      ico.style.cssText = 'width:100%;height:100%;border-radius:14px;object-fit:cover;';
      ico.onerror = () => { iconEl.innerHTML = '🎮'; iconEl.style.fontSize = '36px'; iconEl.style.display = 'flex'; iconEl.style.alignItems = 'center'; iconEl.style.justifyContent = 'center'; };
      iconEl.appendChild(ico);
    } else {
      iconEl.textContent = '🎮';
    }
    $('modalTitle').textContent    = g.name;
    $('modalDev').textContent      = g.dev;
    $('modalRating').textContent   = g.rating ? g.rating.toFixed(1) : '—';
    $('modalDownloads').textContent = g.downloads || '—';
    $('modalSize').textContent     = g.size || '—';
    $('modalAndroid').textContent  = g.android || '—';
    $('modalDesc').textContent     = decodeHtml(g.desc) || t('loading');
    $('modalScreenshots').innerHTML = `<p style="color:#aaa;font-size:13px">${t('loading')}</p>`;
    $('modalTags').innerHTML = (g.tags||[]).map(tg=>`<span class="tag">${tg}</span>`).join('');
    $('modalLabelRating').textContent  = t('rating');
    $('modalLabelDl').textContent      = t('downloads');
    $('modalLabelSize').textContent    = t('size');
    $('modalLabelAndroid').textContent = t('android');
    $('modalAboutTitle').textContent   = t('about');
    if ($('modalScrTitle')) $('modalScrTitle').textContent = t('screenshots');
    $('modalDownloadBtn').dataset.url = g.url || `https://play.google.com/store/apps/details?id=${g.id}`;
    $('modalOverlay').classList.add('open');
    document.body.style.overflow = 'hidden';

    try {
      const json = await apiFetch(`/game/${encodeURIComponent(g.id)}`);
      if (!json.ok) return;
      const d = json.game;
      $('modalDesc').textContent      = decodeHtml(d.descFull || d.desc || '');
      $('modalDownloads').textContent = d.downloads || '—';
      $('modalSize').textContent      = d.size || '—';
      $('modalAndroid').textContent   = d.android || '—';
      $('modalTags').innerHTML = (d.tags||[]).map(tg=>`<span class="tag">${tg}</span>`).join('');
      const scr = $('modalScreenshots');
      const scrUrls = d.screenshots?.slice(0,6) || [];
      scr.innerHTML = scrUrls.length
        ? scrUrls.map((u,i)=>`<img class="screenshot-img" src="${u}" alt="screenshot" loading="lazy" data-idx="${i}"/>`).join('')
        : `<p style="color:#aaa;font-size:13px">${t('noScreenshots')}</p>`;
      scr.querySelectorAll('.screenshot-img').forEach(img =>
        img.addEventListener('click', () => openLightbox(scrUrls, +img.dataset.idx))
      );
      if (d.url) $('modalDownloadBtn').dataset.url = d.url;
    } catch(e) { /* keep initial data */ }
  }

  function closeModal() {
    $('modalOverlay').classList.remove('open');
    document.body.style.overflow = '';
  }

  // ─── Lightbox ───
  let lbImages = [];
  let lbIndex  = 0;
  let lbStartX = 0;
  let lbDragging = false;

  function openLightbox(images, startIndex) {
    lbImages = images;
    lbIndex  = startIndex;
    const track = $('lightboxTrack');
    track.innerHTML = images.map(src =>
      `<img src="${src}" alt="screenshot" draggable="false" />`
    ).join('');
    const dots = $('lightboxDots');
    dots.innerHTML = images.map((_, i) =>
      `<button class="lightbox-dot${i===startIndex?' active':''}" data-i="${i}"></button>`
    ).join('');
    dots.querySelectorAll('.lightbox-dot').forEach(d =>
      d.addEventListener('click', () => lbGoto(+d.dataset.i))
    );
    lbApply(false);
    $('lightboxOverlay').classList.add('open');
    document.body.style.overflow = 'hidden';
  }

  function lbApply(animate = true) {
    const track = $('lightboxTrack');
    track.style.transition = animate ? 'transform .35s cubic-bezier(.4,0,.2,1)' : 'none';
    track.style.transform  = `translateX(${-lbIndex * 100}vw)`;
    document.querySelectorAll('.lightbox-dot').forEach((d, i) =>
      d.classList.toggle('active', i === lbIndex)
    );
    $('lightboxPrev').disabled = lbIndex === 0;
    $('lightboxNext').disabled = lbIndex === lbImages.length - 1;
  }

  function lbGoto(i) {
    lbIndex = Math.max(0, Math.min(lbImages.length - 1, i));
    lbApply(true);
  }

  $('lightboxClose').addEventListener('click', () => {
    $('lightboxOverlay').classList.remove('open');
    document.body.style.overflow = '';
  });
  $('lightboxPrev').addEventListener('click', () => lbGoto(lbIndex - 1));
  $('lightboxNext').addEventListener('click', () => lbGoto(lbIndex + 1));

  // Swipe / drag
  const lbWrap = $('lightboxOverlay');
  lbWrap.addEventListener('pointerdown', e => {
    lbStartX = e.clientX;
    lbDragging = true;
  });
  lbWrap.addEventListener('pointermove', e => {
    if (!lbDragging) return;
    const diff = e.clientX - lbStartX;
    const isRtl = document.documentElement.dir === 'rtl';
    if (Math.abs(diff) > 60) {
      lbDragging = false;
      if (diff < 0) lbGoto(lbIndex + 1);
      else          lbGoto(lbIndex - 1);
    }
  });
  lbWrap.addEventListener('pointerup',     () => { lbDragging = false; });
  lbWrap.addEventListener('pointercancel', () => { lbDragging = false; });

  // Keyboard
  document.addEventListener('keydown', e => {
    if (!$('lightboxOverlay').classList.contains('open')) return;
    const isRtl = document.documentElement.dir === 'rtl';
    if (e.key === 'ArrowLeft')  lbGoto(isRtl ? lbIndex + 1 : lbIndex - 1);
    if (e.key === 'ArrowRight') lbGoto(isRtl ? lbIndex - 1 : lbIndex + 1);
    if (e.key === 'Escape') {
      $('lightboxOverlay').classList.remove('open');
      document.body.style.overflow = '';
    }
  });

  $('modalClose').addEventListener('click', closeModal);
  $('modalOverlay').addEventListener('click', e => { if (e.target===$('modalOverlay')) closeModal(); });

  // Modal download button → show ad
  $('modalDownloadBtn').addEventListener('click', () => {
    const url  = $('modalDownloadBtn').dataset.url;
    const name = $('modalTitle').textContent;
    closeModal();
    openAd(url, name);
  });

  // ─── Ad Interstitial ───
  const AD_URL = 'https://www.room533games.online';
  let adTimer = null;


  function openAd(gameUrl, gameName) {
    clearInterval(adTimer);
    const overlay = $('adOverlay');
    const frame   = $('adFrame');
    const fallback = $('adFallback');
    const skipBtn  = $('adSkipBtn');
    const countdown = $('adCountdown');
    const dlBtn   = $('adDlBtn');
    const dlText  = $('adDlText');

    // Reset
    skipBtn.disabled = true;
    skipBtn.textContent = '';
    countdown.textContent = '5';
    skipBtn.appendChild(countdown);
    dlBtn.style.pointerEvents = 'none';
    dlBtn.style.opacity = '.5';
    dlText.textContent = locale.lang === 'ar' ? 'انتظر...' : 'Wait...';
    $('adGameName').textContent = gameName;
    dlBtn.href = gameUrl || AD_URL;

    // Load iframe
    fallback.classList.remove('show');
    frame.src = AD_URL;
    frame.onerror = () => { frame.style.display = 'none'; fallback.classList.add('show'); };
    // Fallback if iframe blocked (no load event fires for cross-origin errors)
    setTimeout(() => {
      try {
        const doc = frame.contentDocument || frame.contentWindow?.document;
        if (!doc || doc.body === null) { frame.style.display='none'; fallback.classList.add('show'); }
      } catch { frame.style.display='none'; fallback.classList.add('show'); }
    }, 3000);

    overlay.classList.add('open');
    document.body.style.overflow = 'hidden';

    // Countdown
    let sec = 5;
    adTimer = setInterval(() => {
      sec--;
      countdown.textContent = sec;
      if (sec <= 0) {
        clearInterval(adTimer);
        skipBtn.disabled = false;
        skipBtn.innerHTML = locale.lang === 'ar' ? 'تخطى ✕' : 'Skip ✕';
        dlBtn.style.pointerEvents = '';
        dlBtn.style.opacity = '1';
        dlText.textContent = locale.lang === 'ar' ? 'تحميل اللعبة' : 'Download';
      }
    }, 1000);
  }

  function closeAd() {
    clearInterval(adTimer);
    const box = document.querySelector('.ad-box');
    const overlay = $('adOverlay');
    if (box) {
      box.style.transition = 'transform .3s cubic-bezier(.4,0,.2,1)';
      box.style.transform  = 'translateX(-50%) translateY(100%)';
    }
    overlay.style.opacity = '0';
    setTimeout(() => {
      overlay.classList.remove('open');
      overlay.style.opacity = '';
      if (box) { box.style.transition = ''; box.style.transform = ''; }
      $('adFrame').src = '';
      document.body.style.overflow = '';
    }, 300);
  }

  $('adSkipBtn').addEventListener('click', closeAd);
  $('adOverlay').addEventListener('click', e => { if (e.target === $('adOverlay')) closeAd(); });

  // ─── Swipe down to close ad ───
  (function() {
    const box = document.querySelector('.ad-box');
    let startY = 0, dragY = 0, dragging = false;

    box.addEventListener('pointerdown', e => {
      if (e.target.tagName === 'IFRAME') return;
      startY = e.clientY; dragY = 0; dragging = true;
      box.style.transition = 'none';
      box.setPointerCapture(e.pointerId);
    });

    box.addEventListener('pointermove', e => {
      if (!dragging) return;
      dragY = Math.max(0, e.clientY - startY);
      box.style.transform = `translateX(-50%) translateY(${dragY}px)`;
    });

    function endDrag() {
      if (!dragging) return;
      dragging = false;
      if (dragY > 100) {
        closeAd();
      } else {
        box.style.transition = 'transform .25s cubic-bezier(.4,0,.2,1)';
        box.style.transform  = 'translateX(-50%) translateY(0)';
        setTimeout(() => { box.style.transition = ''; }, 250);
      }
    }

    box.addEventListener('pointerup',     endDrag);
    box.addEventListener('pointercancel', endDrag);
  })();

  // ─── Download ───
  function triggerDownload(g) {
    closeModal();
    openAd(g.url || `https://play.google.com/store/apps/details?id=${g.id}`, g.name);
  }

  // ─── Search ───
  const searchInput = $('searchInput');
  const clearBtn    = $('clearSearch');

  searchInput.addEventListener('input', () => {
    const q = searchInput.value.trim();
    clearBtn.style.display = q ? 'flex' : 'none';
    clearTimeout(searchTimeout);
    if (!q) { loadDefault(); return; }
    searchTimeout = setTimeout(async () => {
      $('heroSection').style.display = 'none';
      $('topSection').style.display  = 'none';
      $('newSection').style.display  = 'none';
      $('sortBar').style.display     = 'none';
      $('titleAllGames').textContent  = t('searching');
      $('gamesGrid').innerHTML = skeletonGrid();
      const json = await apiFetch(`/search?q=${encodeURIComponent(q)}&limit=48`);
      if (json.locale) applyLocale(json.locale);
      $('titleAllGames').textContent = t('searchResults', json.games?.length || 0);
      renderGrid(json.games || [], false);
    }, 600);
  });

  clearBtn.addEventListener('click', () => {
    searchInput.value = '';
    clearBtn.style.display = 'none';
    loadDefault();
  });

  // ─── Categories ───
  document.querySelectorAll('.cat-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      document.querySelectorAll('.cat-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentCat = btn.dataset.cat;
      searchInput.value = '';
      clearBtn.style.display = 'none';
      const isAll = currentCat === 'all';
      $('heroSection').style.display = isAll ? '' : 'none';
      $('topSection').style.display  = isAll ? '' : 'none';
      $('newSection').style.display  = isAll ? '' : 'none';
      $('titleAllGames').textContent = btn.textContent;
      $('gamesGrid').innerHTML = skeletonGrid();
      $('sortBar').style.display = '';
      currentSort = 'default';
      document.querySelectorAll('.sort-btn').forEach(b => b.classList.toggle('active', b.dataset.sort === 'default'));
      const json = await apiFetch(`/games?cat=${currentCat}&limit=48`);
      if (json.locale) applyLocale(json.locale);
      renderGrid(json.games || []);
    });
  });

  // ─── Sort ───
  document.querySelectorAll('.sort-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.sort-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentSort = btn.dataset.sort;
      if (allGamesCache.length) renderGrid(allGamesCache, false);
    });
  });

  // ─── See All ───
  let topGamesCache = [];
  let newGamesCache = [];

  $('seeAllTop').addEventListener('click', e => {
    e.preventDefault();
    if (!topGamesCache.length) return;
    $('heroSection').style.display = 'none';
    $('topSection').style.display  = 'none';
    $('newSection').style.display  = 'none';
    $('titleAllGames').textContent = t('topGames');
    $('sortBar').style.display = 'none';
    renderGrid(topGamesCache, false);
    window.scrollTo({ top: document.querySelector('.section:last-child').offsetTop - 80, behavior: 'smooth' });
  });

  $('seeAllNew').addEventListener('click', e => {
    e.preventDefault();
    if (!newGamesCache.length) return;
    $('heroSection').style.display = 'none';
    $('topSection').style.display  = 'none';
    $('newSection').style.display  = 'none';
    $('titleAllGames').textContent = t('newGames');
    $('sortBar').style.display = 'none';
    renderGrid(newGamesCache, false);
    window.scrollTo({ top: document.querySelector('.section:last-child').offsetTop - 80, behavior: 'smooth' });
  });

  // ─── Init ───
  async function loadDefault() {
    $('heroSection').style.display = '';
    $('topSection').style.display  = '';
    $('newSection').style.display  = '';
    $('sortBar').style.display     = '';
    $('topGames').innerHTML  = skeletonRow();
    $('newGames').innerHTML  = skeletonRow();
    $('gamesGrid').innerHTML = skeletonGrid();
    currentSort = 'default';
    document.querySelectorAll('.sort-btn').forEach(b => b.classList.toggle('active', b.dataset.sort === 'default'));

    const [featJson, topJson, newJson] = await Promise.all([
      apiFetch('/featured'),
      apiFetch('/games?cat=all&limit=20'),
      apiFetch('/games?cat=all&limit=10'),
    ]);

    // Apply locale from first response
    const loc = featJson.locale || topJson.locale;
    if (loc) applyLocale(loc);

    if (featJson.ok) buildHero(featJson.games);
    topGamesCache = topJson.games || [];
    newGamesCache = newJson.games || [];
    renderRow('topGames', topGamesCache);
    renderRow('newGames', newGamesCache);

    const allJson = await apiFetch('/games?cat=all&limit=48');
    if (allJson.locale) applyLocale(allJson.locale);
    $('titleAllGames').textContent = t('allGames');
    renderGrid(allJson.games || []);
  }

  loadDefault().catch(() => {
    $('gamesGrid').innerHTML = `<div class="no-results" style="grid-column:1/-1">
      <span class="material-icons">wifi_off</span>
      <p>${t('offline')}</p></div>`;
  });

})();
