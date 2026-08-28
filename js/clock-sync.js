    // ===== REAL-TIME NETWORK CLOCK SYNCHRONIZATION (THAILAND TIME / ICT / UTC+7) =====
    let _netTimeSyncBase = null;
    let _netTimeSyncPerf = null;
    let _isSyncingTime = false;

    function recordNetworkTime(epochMs) {
      if (!epochMs || isNaN(epochMs)) return;
      _netTimeSyncBase = Number(epochMs);
      _netTimeSyncPerf = typeof performance !== 'undefined' && performance.now ? performance.now() : 0;
      console.log('[TimeSync] Synced real time with network:', new Date(getRealNowMs()).toISOString());
    }

    function getRealNowMs() {
      if (_netTimeSyncBase != null && _netTimeSyncPerf != null && typeof performance !== 'undefined' && performance.now) {
        return _netTimeSyncBase + (performance.now() - _netTimeSyncPerf);
      }
      return Date.now();
    }

    function getRealNow() {
      return new Date(getRealNowMs());
    }

    async function syncThailandTime() {
      if (_isSyncingTime) return;
      _isSyncingTime = true;
      try {
        // 1. Binance Atomic Time API (Global Atomic Clock, <100ms, Full CORS on all origins)
        try {
          const r = await fetch('https://api.binance.com/api/v3/time', { signal: AbortSignal.timeout(3000) });
          if (r.ok) {
            const d = await r.json();
            if (d && d.serverTime && typeof d.serverTime === 'number') {
              recordNetworkTime(d.serverTime);
              _isSyncingTime = false;
              updateGreeting();
              updateMarketClock();
              updateMarketStatus();
              updateLastRefresh();
              return;
            }
          }
        } catch (e) { }

        // 2. Kraken Atomic Time API (Global Exchange Atomic Time, Full CORS)
        try {
          const r = await fetch('https://api.kraken.com/0/public/Time', { signal: AbortSignal.timeout(3000) });
          if (r.ok) {
            const d = await r.json();
            if (d && d.result && d.result.unixtime) {
              recordNetworkTime(d.result.unixtime * 1000);
              _isSyncingTime = false;
              updateGreeting();
              updateMarketClock();
              updateMarketStatus();
              updateLastRefresh();
              return;
            }
          }
        } catch (e) { }

        // 3. timeapi.io (Timezone API)
        try {
          const r = await fetch('https://timeapi.io/api/v1/time/current/zone?timeZone=Asia/Bangkok', { signal: AbortSignal.timeout(3000) });
          if (r.ok) {
            const d = await r.json();
            const dateStr = d.date_time || d.dateTime;
            if (dateStr) {
              const ms = Date.parse(dateStr);
              if (ms && !isNaN(ms)) {
                recordNetworkTime(ms);
                _isSyncingTime = false;
                updateGreeting();
                updateMarketClock();
                updateMarketStatus();
                updateLastRefresh();
                return;
              }
            }
          }
        } catch (e) { }

        // 4. Serverless API endpoint (when hosted on Vercel/Node)
        try {
          const r = await fetch('/api/time', { cache: 'no-store', signal: AbortSignal.timeout(2000) });
          if (r.ok) {
            const d = await r.json();
            if (d && d.unixtime) {
              recordNetworkTime(d.unixtime);
              _isSyncingTime = false;
              updateGreeting();
              updateMarketClock();
              updateMarketStatus();
              updateLastRefresh();
              return;
            }
          }
        } catch (e) { }
      } catch (err) {
        console.error('Time sync error:', err);
      } finally {
        _isSyncingTime = false;
      }
    }

    function getBkkDateKey(date = getRealNow()) {
      try {
        return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok' }).format(date);
      } catch (e) {
        const d = new Date(date.getTime() + (7 * 3600000) + (date.getTimezoneOffset() * 60000));
        return d.toISOString().slice(0, 10);
      }
    }

    function getBkkTimeParts(date = getRealNow()) {
      try {
        const parts = new Intl.DateTimeFormat('en-US', {
          timeZone: 'Asia/Bangkok',
          hourCycle: 'h23',
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          weekday: 'short'
        }).formatToParts(date);
        const map = {};
        parts.forEach(p => map[p.type] = p.value);
        return {
          year: parseInt(map.year, 10),
          month: parseInt(map.month, 10),
          day: parseInt(map.day, 10),
          hour: parseInt(map.hour, 10),
          minute: parseInt(map.minute, 10),
          second: parseInt(map.second, 10),
          weekday: map.weekday,
          dateKey: getBkkDateKey(date)
        };
      } catch (e) {
        const d = new Date(date.getTime() + (7 * 3600000) + (date.getTimezoneOffset() * 60000));
        return {
          year: d.getUTCFullYear(),
          month: d.getUTCMonth() + 1,
          day: d.getUTCDate(),
          hour: d.getUTCHours(),
          minute: d.getUTCMinutes(),
          second: d.getUTCSeconds(),
          weekday: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getUTCDay()],
          dateKey: d.toISOString().slice(0, 10)
        };
      }
    }

    function updateGreeting() {
      const bkk = getBkkTimeParts();
      const h = bkk.hour;
      const t = I18N[S.lang] || I18N.en;
      document.getElementById('dashGreeting').textContent = h < 12 ? t.gMorning : h < 17 ? t.gAfternoon : t.gEvening;
      const loc = S.lang === 'th' ? 'th-TH' : 'en-US';
      document.getElementById('dashDate').textContent = getRealNow().toLocaleDateString(loc, {
        timeZone: 'Asia/Bangkok',
        weekday: 'long',
        year: 'numeric',
        month: 'short',
        day: 'numeric'
      });
    }
    function updateLastRefresh() {
      const el = document.getElementById('lastUpdateText');
      if (el) {
        el.textContent = getRealNow().toLocaleTimeString(S.lang === 'th' ? 'th-TH' : 'en-US', {
          timeZone: 'Asia/Bangkok',
          hour: '2-digit',
          minute: '2-digit',
          hour12: false
        }) + (S.lang === 'th' ? ' น.' : ' ICT');
      }
    }

    function switchPage(page) {
      S.page = page;
      document.querySelectorAll('.page-view').forEach(p => p.classList.remove('active'));
      document.getElementById('page-' + page)?.classList.add('active');
      document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
      document.getElementById('tab-' + page)?.classList.add('active');
      document.querySelectorAll('.mnav-btn').forEach(b => b.classList.remove('active'));
      document.getElementById('mnav-' + page)?.classList.add('active');
      if (page === 'heatmap') {
        initOrRefreshHeatmap();
      }
    }

    // Mobile watchlist
    // Helpers for Currency
    function getCurSym(sym, q) {
      if (sym && (sym.endsWith('.BK') || sym.endsWith('.TH'))) return '฿';
      if (q && (q.currency === 'THB' || q.isThai)) return '฿';
      return '$';
    }
    function fmtStockPrice(c, sym, q) {
      if (c == null) return '—';
      return getCurSym(sym, q) + fmtNum(c);
    }

    // Mobile watchlist
    function openMobileWatchlist() { document.getElementById('mobileWlOverlay').classList.add('active'); renderMobileWishlist(); }
    function closeMobileWatchlist() { document.getElementById('mobileWlOverlay').classList.remove('active'); }
    function renderMobileWishlist() {
      document.getElementById('mobileWlCount').textContent = S.wl.length;
      const list = document.getElementById('mobileWlList');
      const t = I18N[S.lang] || I18N.en;
      if (!S.wl.length) { list.innerHTML = `<div class="wishlist-empty"><svg viewBox="0 0 24 24"><path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/></svg><p>${t.emptyWatchlistSidebar}</p></div>`; return; }
      list.innerHTML = S.wl.map(s => {
        const q = s._quote, cs = getCurSym(s.symbol, q), p = q ? cs + fmtNum(q.c) : '—', pct = q ? q.dp : null, d = pct !== null ? (pct >= 0 ? 'up' : 'down') : '';
        return `<div class="wl-card-item" onclick="loadStock('${esc(s.symbol)}');closeMobileWatchlist()">
      <div class="wl-card-left"><div class="wl-sym">${esc(s.symbol)} ${s.symbol.endsWith('.BK') ? '<span class="search-tag-th">SET</span>' : ''}</div><div class="wl-name">${esc(s.name || '')}</div></div>
      <div class="wl-card-right"><div class="wl-price">${p}</div><div class="wl-chg ${d}">${pct !== null ? (pct >= 0 ? '+' : '') + pct.toFixed(2) + '%' : ''}</div></div>
    </div>`;
      }).join('');
    }

