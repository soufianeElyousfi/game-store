(() => {
  const API = '/api/movies';

  let currentGenre = '';
  let currentSort  = 'rating';
  let currentPage  = 1;
  let loading      = false;
  let exhausted    = false;
  let searchTimer  = null;
  let searchQuery  = '';
  let heroMovies   = [];
  let heroIndex    = 0;
  let heroTimer    = null;

  const $ = id => document.getElementById(id);

  // ─── Skeleton ───
  function skeletonGrid(n = 10) {
    return Array(n).fill(0).map(() => `
      <div class="movie-card skeleton">
        <div class="movie-card-poster"></div>
        <div class="movie-card-info">
          <div class="movie-card-title">████████████</div>
          <div class="movie-card-meta">████ ████</div>
        </div>
      </div>`).join('');
  }

  // ─── Movie Card ───
  function movieCard(m) {
    const stars = '★'.repeat(Math.round(m.rating / 2));
    return `
      <div class="movie-card" onclick="openMovie(${m.id})" data-id="${m.id}">
        <img class="movie-card-poster" src="${m.cover}" alt="${m.title}" loading="lazy" decoding="async"
             onerror="this.src='https://via.placeholder.com/200x300?text=No+Image'" />
        <div class="movie-card-info">
          <div class="movie-card-title">${m.title}</div>
          <div class="movie-card-meta">
            <span class="movie-card-rating">
              <span class="material-icons">star</span>${m.rating}
            </span>
            <span class="movie-card-year">${m.year}</span>
          </div>
        </div>
      </div>`;
  }

  // ─── Hero ───
  function buildHero(movies) {
    heroMovies = movies.filter(m => m.bg || m.cover).slice(0, 5);
    if (!heroMovies.length) { $('heroSection').style.display = 'none'; return; }
    $('heroSection').style.display = '';
    heroIndex = 0;
    clearInterval(heroTimer);
    renderHero();
    heroTimer = setInterval(() => {
      heroIndex = (heroIndex + 1) % heroMovies.length;
      renderHero();
    }, 4000);
    buildIndicators();
  }

  function renderHero() {
    const m = heroMovies[heroIndex];
    if (!m) return;
    $('heroBg').style.backgroundImage = `url(${m.bg || m.cover})`;
    $('heroTitle').textContent = m.title;
    $('heroRating').innerHTML = `<span class="material-icons" style="font-size:15px;color:var(--star)">star</span> ${m.rating}`;
    $('heroYear').textContent = m.year;
    $('heroDesc').textContent = m.summary ? m.summary.slice(0, 120) + '…' : '';
    $('heroInfoBtn').onclick = () => showModal(m);
    document.querySelectorAll('.hero-dot').forEach((d, i) => d.classList.toggle('active', i === heroIndex));
  }

  function buildIndicators() {
    $('heroIndicators').innerHTML = heroMovies.map((_, i) =>
      `<span class="hero-dot${i === 0 ? ' active' : ''}"></span>`
    ).join('');
  }

  // ─── Fetch ───
  async function fetchMovies(reset = false) {
    if (loading || exhausted) return;
    loading = true;
    if (reset) {
      currentPage = 1;
      exhausted = false;
      $('moviesGrid').innerHTML = skeletonGrid();
    }
    $('infiniteSpinner').style.display = 'block';

    const params = new URLSearchParams({
      page: currentPage,
      sort: currentSort,
      ...(currentGenre && { genre: currentGenre }),
      ...(searchQuery  && { q: searchQuery }),
    });

    try {
      const res  = await fetch(`${API}?${params}`);
      const data = await res.json();

      if (!data.ok || !data.movies?.length) {
        exhausted = true;
        if (reset) $('moviesGrid').innerHTML = `<div style="grid-column:1/-1;text-align:center;padding:40px;color:var(--text3)"><span class="material-icons" style="font-size:48px">movie_filter</span><p>لا توجد أفلام</p></div>`;
        return;
      }

      if (reset) {
        $('moviesGrid').innerHTML = data.movies.map(movieCard).join('');
        buildHero(data.movies);
      } else {
        $('moviesGrid').insertAdjacentHTML('beforeend', data.movies.map(movieCard).join(''));
      }

      if (data.movies.length < 20) exhausted = true;
      currentPage++;
    } catch (e) {
      if (reset) $('moviesGrid').innerHTML = `<div style="grid-column:1/-1;text-align:center;padding:40px;color:var(--text3)"><span class="material-icons" style="font-size:48px">wifi_off</span><p>تعذر الاتصال</p></div>`;
    } finally {
      loading = false;
      $('infiniteSpinner').style.display = 'none';
    }
  }

  // ─── Modal ───
  function showModal(m) {
    $('modalBg').style.backgroundImage = `url(${m.bg || m.cover})`;
    $('modalIcon').innerHTML = `<img src="${m.cover}" alt="${m.title}" />`;
    $('modalTitle').textContent = m.title;
    $('modalMeta').textContent = (m.genres || []).join(' • ');
    $('modalRating').textContent = m.rating;
    $('modalYear').textContent = m.year;
    $('modalRuntime').textContent = m.runtime ? `${m.runtime} د` : '—';
    $('modalLang').textContent = m.language?.toUpperCase() || '—';
    $('modalDesc').textContent = m.summary || '—';
    $('modalTags').innerHTML = (m.genres || []).map(g => `<span class="tag">${g}</span>`).join('');

    if (m.trailer) {
      $('trailerWrap').style.display = '';
      $('trailerBtn').href = m.trailer;
    } else {
      $('trailerWrap').style.display = 'none';
    }

    $('modalOverlay').classList.add('open');
    document.body.style.overflow = 'hidden';
  }

  window.openMovie = function(id) {
    const card = document.querySelector(`[data-id="${id}"]`);
    if (!card) return;
    // Find movie from grid data - re-fetch or use cached
    const allData = window._moviesCache || [];
    const m = allData.find(x => x.id == id);
    if (m) showModal(m);
  };

  // cache movies for modal lookup
  const origFetch = fetchMovies;

  // ─── Genre buttons ───
  document.querySelectorAll('[data-genre]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('[data-genre]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentGenre = btn.dataset.genre;
      searchQuery  = '';
      $('movieSearch').value = '';
      $('clearSearch').style.display = 'none';
      fetchMovies(true);
    });
  });

  // ─── Sort buttons ───
  document.querySelectorAll('[data-sort]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('[data-sort]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentSort = btn.dataset.sort;
      fetchMovies(true);
    });
  });

  // ─── Search ───
  $('movieSearch').addEventListener('input', e => {
    const v = e.target.value.trim();
    $('clearSearch').style.display = v ? '' : 'none';
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      searchQuery = v;
      fetchMovies(true);
    }, 400);
  });
  $('clearSearch').addEventListener('click', () => {
    $('movieSearch').value = '';
    $('clearSearch').style.display = 'none';
    searchQuery = '';
    fetchMovies(true);
  });

  // ─── Modal close ───
  $('modalClose').addEventListener('click', () => {
    $('modalOverlay').classList.remove('open');
    document.body.style.overflow = '';
  });
  $('modalOverlay').addEventListener('click', e => {
    if (e.target === $('modalOverlay')) {
      $('modalOverlay').classList.remove('open');
      document.body.style.overflow = '';
    }
  });

  // ─── Infinite scroll ───
  const sentinel = $('infiniteSentinel');
  const observer = new IntersectionObserver(entries => {
    if (entries[0].isIntersecting) fetchMovies(false);
  }, { rootMargin: '200px' });
  observer.observe(sentinel);

  // ─── Store movies for modal ───
  const _origInsert = Element.prototype.insertAdjacentHTML;

  // ─── Init ───
  fetchMovies(true);

  // Store fetched movies globally for modal
  const _fetch = window.fetch;
  window.fetch = async (...args) => {
    const res = await _fetch(...args);
    if (typeof args[0] === 'string' && args[0].startsWith('/api/movies')) {
      const clone = res.clone();
      clone.json().then(d => {
        if (d.movies) window._moviesCache = [...(window._moviesCache || []), ...d.movies];
      }).catch(() => {});
    }
    return res;
  };

})();
