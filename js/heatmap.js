    // ===== MARKET HEATMAP LOGIC =====
    function initOrRefreshHeatmap() {
      populateHeatmapSectorOptions();
      if (!HM.cache[HM.market]) {
        loadHeatmapData();
      } else {
        renderHeatmap();
      }
    }

    function setHeatmapMarket(mkt) {
      if (HM.market === mkt && HM.cache[mkt]) return;
      HM.market = mkt;
      document.getElementById('hmMarketUS')?.classList.toggle('active', mkt === 'us');
      document.getElementById('hmMarketSET')?.classList.toggle('active', mkt === 'set');
      HM.filterSector = 'all';
      populateHeatmapSectorOptions();
      if (!HM.cache[mkt]) {
        loadHeatmapData();
      } else {
        renderHeatmap();
      }
    }

    function populateHeatmapSectorOptions() {
      const sel = document.getElementById('hmSectorSelect');
      if (!sel) return;
      const isTh = S.lang === 'th';
      const sectorsList = HM.market === 'us' ? SECTORS : SET_SECTORS;
      
      let html = `<option value="all">${isTh ? 'ทุกกลุ่มอุตสาหกรรม (All Sectors)' : 'All Sectors'}</option>`;
      sectorsList.forEach(sec => {
        const title = isTh && sec.thName ? `${sec.name} (${sec.thName})` : sec.name;
        html += `<option value="${sec.id}">${title}</option>`;
      });
      sel.innerHTML = html;
      sel.value = HM.filterSector || 'all';
    }

    function filterHeatmap(query) {
      HM.filterQuery = (query || '').trim().toUpperCase();
      renderHeatmap();
    }

    function filterHeatmapSector(secId) {
      HM.filterSector = secId || 'all';
      renderHeatmap();
    }

    async function loadHeatmapData(forceRefresh = false) {
      if (HM.loading) return;
      HM.loading = true;
      const content = document.getElementById('heatmapContent');
      if (!HM.cache[HM.market] || forceRefresh) {
        if (content) {
          content.innerHTML = `
            <div class="heatmap-loading">
              <div class="spinner" style="width:28px;height:28px;border:3px solid rgba(255,255,255,0.1);border-top-color:var(--accent);border-radius:50%;animation:spin 0.8s linear infinite;"></div>
              <p>${S.lang === 'th' ? 'กำลังโหลดข้อมูล Market Heatmap...' : 'Loading Market Heatmap data...'}</p>
            </div>`;
        }
      }

      const sectorsList = HM.market === 'us' ? SECTORS : SET_SECTORS;
      const currentMarket = HM.market;

      try {
        const sectorDataPromises = sectorsList.map(async sec => {
          // 1. Fetch Sector ETF Quote if available
          let secQuote = null;
          if (sec.etf) {
            try { secQuote = await fetchQ(sec.etf); } catch (e) { }
          }

          // 2. Fetch constituent tickers for this sector
          const tickerQuotes = await Promise.allSettled(sec.tickers.map(async sym => {
            try {
              const q = await fetchQ(sym);
              return { symbol: sym, quote: q };
            } catch (e) {
              return { symbol: sym, quote: null };
            }
          }));

          const stocks = tickerQuotes.map(r => {
            const sym = r.value.symbol;
            const q = r.value.quote;
            return {
              symbol: sym,
              name: q?.shortName || q?.name || sym,
              price: q?.c ?? null,
              change: q?.d ?? 0,
              dp: q?.dp ?? 0,
              volume: q?.v ?? null,
              currency: q?.currency || (sym.endsWith('.BK') ? 'THB' : 'USD')
            };
          });

          // Calculate Sector Average % Change
          const validStocks = stocks.filter(s => s.price !== null && typeof s.dp === 'number');
          const avgDp = secQuote?.dp ?? (validStocks.length ? (validStocks.reduce((sum, s) => sum + s.dp, 0) / validStocks.length) : 0);

          return {
            id: sec.id,
            name: sec.name,
            thName: sec.thName,
            etf: sec.etf || null,
            avgDp,
            stocks
          };
        });

        const results = await Promise.all(sectorDataPromises);
        HM.cache[currentMarket] = results;
        HM.loading = false;
        renderHeatmap();
      } catch (err) {
        console.error('Heatmap load error:', err);
        HM.loading = false;
        if (content) {
          content.innerHTML = `<div class="heatmap-loading" style="color:var(--red);">Failed to load heatmap data. Click Refresh to try again.</div>`;
        }
      }
    }

    function renderHeatmap() {
      const content = document.getElementById('heatmapContent');
      if (!content) return;
      const data = HM.cache[HM.market];
      if (!data || !data.length) {
        if (!HM.loading) loadHeatmapData();
        return;
      }

      const isTh = S.lang === 'th';
      const qUpper = (HM.filterQuery || '').toUpperCase();
      const secFilter = HM.filterSector || 'all';

      const MEGA_CAPS = new Set(['AAPL', 'MSFT', 'NVDA', 'AMZN', 'GOOGL', 'META', 'TSLA', 'JPM', 'LLY', 'XOM', 'PTT.BK', 'PTTEP.BK', 'DELTA.BK', 'AOT.BK', 'SCB.BK', 'KBANK.BK', 'CPALL.BK', 'ADVANC.BK', 'GULF.BK', 'BDMS.BK']);

      let renderedSectorsCount = 0;
      let html = '';

      data.forEach(sec => {
        if (secFilter !== 'all' && sec.id !== secFilter) return;

        // Filter stocks by search query
        const filteredStocks = sec.stocks.filter(s => {
          if (!qUpper) return true;
          return s.symbol.toUpperCase().includes(qUpper) || (s.name && s.name.toUpperCase().includes(qUpper));
        });

        if (!filteredStocks.length && qUpper) return;

        renderedSectorsCount++;
        const isUp = sec.avgDp >= 0;
        const secBadgeClass = isUp ? 'up' : 'down';
        const secSign = isUp ? '+' : '';
        const secTitle = isTh && sec.thName ? `${sec.name} • ${sec.thName}` : sec.name;

        const tilesHtml = filteredStocks.map(s => {
          const isMega = MEGA_CAPS.has(s.symbol);
          const dp = s.dp || 0;
          const priceStr = s.price != null ? (getCurSym(s.symbol, null) + fmtNum(s.price)) : '—';
          const pctStr = (dp >= 0 ? '+' : '') + dp.toFixed(2) + '%';
          const volStr = s.volume ? fmtVol(s.volume) : '';

          // Determine color background class based on % change
          let bgCls = 'hm-bg-flat';
          if (dp >= 3.0) bgCls = 'hm-bg-up3';
          else if (dp >= 1.5) bgCls = 'hm-bg-up2';
          else if (dp > 0.05) bgCls = 'hm-bg-up1';
          else if (dp <= -3.0) bgCls = 'hm-bg-dn3';
          else if (dp <= -1.5) bgCls = 'hm-bg-dn2';
          else if (dp < -0.05) bgCls = 'hm-bg-dn1';

          return `
            <div class="hm-tile ${bgCls} ${isMega ? 'mega' : ''}" onclick="loadStock('${esc(s.symbol)}')" title="${esc(s.name)} • ${pctStr}">
              <div class="hm-tile-top">
                <span class="hm-tile-sym">${esc(s.symbol)}</span>
                <span class="hm-tile-price">${priceStr}</span>
              </div>
              <div class="hm-tile-name">${esc(s.name)}</div>
              <div class="hm-tile-bottom">
                <span class="hm-tile-pct">${pctStr}</span>
                ${volStr ? `<span class="hm-tile-vol">Vol: ${volStr}</span>` : ''}
              </div>
            </div>`;
        }).join('');

        html += `
          <div class="hm-sector-card">
            <div class="hm-sec-header">
              <div class="hm-sec-title-wrap">
                <span class="hm-sec-name">${secTitle}</span>
                ${sec.etf ? `<span class="hm-sec-etf">${sec.etf}</span>` : ''}
              </div>
              <div class="hm-sec-stats">
                <span class="hm-sec-chg-badge ${secBadgeClass}">${secSign}${sec.avgDp.toFixed(2)}%</span>
              </div>
            </div>
            <div class="hm-tiles-grid">
              ${tilesHtml}
            </div>
          </div>`;
      });

      if (!renderedSectorsCount) {
        html = `
          <div class="heatmap-loading">
            <svg viewBox="0 0 24 24" style="width:36px;height:36px;fill:var(--text-muted);opacity:0.4;">
              <path d="M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 14z"/>
            </svg>
            <p>${isTh ? 'ไม่พบหุ้นที่ค้นหาใน Heatmap' : 'No matching stocks found in Heatmap'}</p>
          </div>`;
      }

      content.innerHTML = html;
    }

    function isUSDST() {
      try {
        const dStr = new Intl.DateTimeFormat('en-US', {
          timeZone: 'America/New_York',
          timeZoneName: 'short'
        }).format(getRealNow());
        return dStr.includes('EDT') || dStr.includes('GMT-4');
      } catch (e) {
        // Fallback: In US, DST starts 2nd Sunday of March (02:00 EST / 07:00 UTC) and ends 1st Sunday of November (02:00 EDT / 06:00 UTC)
        const now = getRealNow();
        const year = now.getUTCFullYear();
        const marchFirst = new Date(Date.UTC(year, 2, 1));
        const marchFirstDay = marchFirst.getUTCDay();
        const secondSundayMarch = 1 + (marchFirstDay === 0 ? 7 : (7 - marchFirstDay) + 7);
        const dstStart = new Date(Date.UTC(year, 2, secondSundayMarch, 7, 0, 0));

        const novFirst = new Date(Date.UTC(year, 10, 1));
        const novFirstDay = novFirst.getUTCDay();
        const firstSundayNov = 1 + (novFirstDay === 0 ? 0 : (7 - novFirstDay));
        const dstEnd = new Date(Date.UTC(year, 10, firstSundayNov, 6, 0, 0));

        return now >= dstStart && now < dstEnd;
      }
    }

    function updateMarketClock() {
      const container = document.getElementById('marketClockStrip');
      if (!container) return;

      const sus = getUSSession();
      const sset = getSETSession();
      const dst = isUSDST();
      const usTz = dst ? 'EDT' : 'EST';
      const openBkk = dst ? '20:30' : '21:30';
      const closeBkk = dst ? '03:00' : '04:00';
      const postCloseBkk = dst ? '07:00' : '08:00';
      const preOpenBkk = dst ? '15:00' : '16:00';
      const isTh = S.lang === 'th';

      const usTimes = {
        regular: {
          title: isTh ? 'เปิดทำการปกติ' : 'Open (Regular)',
          cls: 'open',
          desc: isTh ? `ปิดเวลา ${closeBkk} น. (16:00 ${usTz})` : `Closes ${closeBkk} BKK (16:00 ${usTz})`
        },
        'pre-market': {
          title: isTh ? 'ตลาดก่อนเปิด (Pre-Market)' : 'Pre-Market Active',
          cls: 'pre',
          desc: isTh ? `เปิดเวลา ${openBkk} น. (09:30 ${usTz})` : `Opens ${openBkk} BKK (09:30 ${usTz})`
        },
        'post-market': {
          title: isTh ? 'ตลาดหลังปิด (After-Hours)' : 'After-Hours Active',
          cls: 'after',
          desc: isTh ? `ปิดเวลา ${postCloseBkk} น. (20:00 ${usTz})` : `Closes ${postCloseBkk} BKK (20:00 ${usTz})`
        },
        closed: {
          title: isTh ? 'ตลาดปิดทำการ' : 'Market Closed',
          cls: 'closed',
          desc: isTh ? `เวลาทำการ ${openBkk} - ${closeBkk} น. (${usTz})` : `Trading ${openBkk} - ${closeBkk} BKK (${usTz})`
        }
      };
      const usInfo = usTimes[sus] || usTimes.closed;

      const setTimes = {
        regular: {
          title: isTh ? 'เปิดทำการซื้อขายปกติ' : 'Open (Trading Session)',
          cls: 'open',
          desc: isTh ? 'รอบการซื้อขาย (เช้า 10:00-12:30 / บ่าย 14:30-16:30)' : 'Day Session (10:00-12:30, 14:30-16:30)'
        },
        intermission: {
          title: isTh ? 'พักการซื้อขาย (Intermission)' : 'Lunch Break (Intermission)',
          cls: 'intermission',
          desc: isTh ? 'พักเที่ยง • รอเปิดรอบบ่าย Pre-Open 14:00 น. (ซื้อขาย 14:30)' : 'Lunch Break • Pre-Open resumes 14:00 (Trading 14:30)'
        },
        'pre-market': {
          title: isTh ? 'ช่วงสุ่มเปิดตลาด (Pre-Open)' : 'Pre-Open Call',
          cls: 'pre',
          desc: isTh ? 'จับคู่คำสั่งเปิดตลาด (รอบเช้า 09:30 / รอบบ่าย 14:00)' : 'Matching Orders (09:30/14:00)'
        },
        'post-market': {
          title: isTh ? 'ช่วงสุ่มปิดตลาด (Pre-Close)' : 'Pre-Close Call',
          cls: 'after',
          desc: isTh ? 'สุ่มคำนวณราคาปิดตลาด (16:30 - 16:40 น.)' : 'Closing Call (16:30 - 16:40 ICT)'
        },
        closed: {
          title: isTh ? 'ตลาดปิดทำการ' : 'Market Closed',
          cls: 'closed',
          desc: isTh ? 'เวลาทำการ 10:00-12:30, 14:30-16:30 น.' : 'Trading 10:00-12:30, 14:30-16:30 ICT'
        }
      };
      const setInfo = setTimes[sset] || setTimes.closed;

      const usTimeStr = getRealNow().toLocaleTimeString('en-US', { timeZone: 'America/New_York', hour: '2-digit', minute: '2-digit', hour12: false }) + ' ' + usTz;
      const setTimeStr = getRealNow().toLocaleTimeString('th-TH', { timeZone: 'Asia/Bangkok', hour: '2-digit', minute: '2-digit', hour12: false }) + (isTh ? ' น.' : ' ICT');
      const usMktLbl = isTh ? '🇺🇸 ตลาดหุ้นสหรัฐฯ (NYSE/NASDAQ)' : '🇺🇸 US Market (NYSE/NASDAQ)';
      const setMktLbl = isTh ? '🇹🇭 ตลาดหุ้นไทย (SET)' : '🇹🇭 SET Market (Thailand)';

      container.innerHTML = `
        <div class="stats-inline-wrap">
          <div class="clock-card">
            <div class="clock-dot ${usInfo.cls}"></div>
            <div>
              <div class="clock-mkt-lbl">${usMktLbl} • ${usTimeStr}</div>
              <div class="clock-session-lbl ${usInfo.cls}">${usInfo.title}</div>
              <div class="clock-countdown-txt">${usInfo.desc}</div>
            </div>
          </div>
          <div class="clock-card">
            <div class="clock-dot ${setInfo.cls}"></div>
            <div>
              <div class="clock-mkt-lbl">${setMktLbl} • ${setTimeStr}</div>
              <div class="clock-session-lbl ${setInfo.cls}">${setInfo.title}</div>
              <div class="clock-countdown-txt">${setInfo.desc}</div>
            </div>
          </div>
        </div>`;
    }

    function updateSentiment(ga, lo, total, wl) {
      const card = document.getElementById('sentimentCard');
      if (!card) return;
      if (!total) { card.style.display = 'none'; return; }
      card.style.display = 'flex';

      const isTh = S.lang === 'th';
      const ratio = total > 0 ? (ga / total) : 0.5;
      const validQuotes = (wl || []).filter(s => s._quote && typeof s._quote.dp === 'number');
      const avgDp = validQuotes.length ? (validQuotes.reduce((acc, s) => acc + s._quote.dp, 0) / validQuotes.length) : 0;

      let score = Math.round((ratio * 70) + Math.max(-15, Math.min(15, avgDp * 5)) + 15);
      score = Math.max(5, Math.min(95, score));

      let emoji = '😐', label = isTh ? 'สภาวะเป็นกลาง' : 'Neutral', color = 'var(--amber)';
      if (score >= 75) {
        emoji = '🚀';
        label = isTh ? 'โลภมากเป็นพิเศษ 🚀' : 'Extreme Greed';
        color = 'var(--green)';
      }
      else if (score >= 58) {
        emoji = '📈';
        label = isTh ? 'ตลาดขาขึ้น / ความโลภ 📈' : 'Bullish / Greed';
        color = 'var(--green)';
      }
      else if (score <= 25) {
        emoji = '💥';
        label = isTh ? 'กลัวมากเป็นพิเศษ 💥' : 'Extreme Fear';
        color = 'var(--red)';
      }
      else if (score <= 42) {
        emoji = '📉';
        label = isTh ? 'ตลาดขาลง / ความกลัว 📉' : 'Bearish / Fear';
        color = 'var(--red)';
      }

      const subTxt = isTh
        ? `ขึ้น ${ga} • ลง ${lo} (เฉลี่ย ${avgDp >= 0 ? '+' : ''}${avgDp.toFixed(2)}%)`
        : `${ga} Up • ${lo} Down (${avgDp >= 0 ? '+' : ''}${avgDp.toFixed(2)}% Avg)`;

      card.innerHTML = `
        <div class="sentiment-emoji">${emoji}</div>
        <div style="flex:1;min-width:0;">
          <div style="display:flex;align-items:center;justify-content:space-between;">
            <div class="sentiment-label" style="color:${color}">${label} (${score})</div>
          </div>
          <div class="sentiment-track">
            <div class="sentiment-cursor" style="left:${score}%"></div>
          </div>
          <div class="sentiment-sub">${subTxt}</div>
        </div>`;
    }

    // Dashboard
    function updateDashboard() {
      const wd = S.wl.filter(s => s._quote), ga = wd.filter(s => s._quote.dp >= 0).length, lo = wd.filter(s => s._quote.dp < 0).length;
      let best = wd.length ? wd.reduce((a, b) => a._quote.dp > b._quote.dp ? a : b) : null;
      document.getElementById('summaryTotal').textContent = S.wl.length;
      document.getElementById('summaryGainers').textContent = ga;
      document.getElementById('summaryLosers').textContent = lo;
      document.getElementById('summaryBest').textContent = best ? best.symbol + ' ' + (best._quote.dp >= 0 ? '+' : '') + best._quote.dp.toFixed(2) + '%' : '—';

      updateSentiment(ga, lo, wd.length, wd);
      updateMarketClock();

      const t = I18N[S.lang] || I18N.en;
      const c = document.getElementById('dashWatchlist');
      if (!S.wl.length) { c.innerHTML = `<div class="dash-empty"><svg viewBox="0 0 24 24"><path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/></svg><span>${t.emptyWatchlist}</span></div>`; return; }

      // Unified minimal rows (works desktop + mobile)
      const rows = S.wl.map(s => {
        const q = s._quote, cs = getCurSym(s.symbol, q);
        const p = q ? cs + fmtNum(q.c) : '—';
        const pct = q ? q.dp : null;
        const d = pct === null ? 'flat' : pct >= 0 ? 'up' : 'down';
        const pt = pct !== null ? (pct >= 0 ? '+' : '') + pct.toFixed(2) + '%' : '—';
        const ct = q ? (q.d >= 0 ? '+' : '') + cs + Math.abs(q.d).toFixed(2) : '';
        const vol = q && q.v ? fmtVol(q.v) : null;
        return `<div class="wl-row" onclick="loadStock('${esc(s.symbol)}')">
          <div class="wl-row-left">
            <div class="wl-row-sym-block">
              <div class="wl-sym">${esc(s.symbol)}${s.symbol.endsWith('.BK') ? ' <span class="search-tag-th">SET</span>' : ''}</div>
              <div class="wl-name">${esc(s.name || '')}</div>
            </div>
          </div>
          <div class="wl-row-right">
            <div class="wl-price">${p}</div>
            <div class="wl-row-badges">
              <span class="pct-badge ${d}">${pt}</span>
              ${ct ? `<span class="wl-chg ${d}">${ct}</span>` : ''}
            </div>
            ${vol ? `<div class="wl-row-vol">${vol}</div>` : ''}
          </div>
        </div>`;
      }).join('');

      c.innerHTML = `<div class="wl-list-wrap">${rows}</div>`;
      renderDashboardAlerts();
      updateDashboardExtras();
    }

    // Market status
    function getUSSession() {
      try {
        const parts = new Intl.DateTimeFormat('en-US', {
          timeZone: 'America/New_York',
          hourCycle: 'h23',
          hour: 'numeric',
          minute: 'numeric',
          weekday: 'short'
        }).formatToParts(getRealNow());
        const map = {};
        parts.forEach(p => map[p.type] = p.value);
        if (map.weekday === 'Sun' || map.weekday === 'Sat') return 'closed';
        const h = parseInt(map.hour, 10);
        const m = parseInt(map.minute, 10);
        const t = h * 60 + m;
        // Pre-market: 04:00 - 09:30 (240 - 570 min)
        if (t >= 240 && t < 570) return 'pre-market';
        // Regular: 09:30 - 16:00 (570 - 960 min)
        if (t >= 570 && t < 960) return 'regular';
        // Post-market: 16:00 - 20:00 (960 - 1200 min)
        if (t >= 960 && t < 1200) return 'post-market';
        return 'closed';
      } catch (e) {
        return 'closed';
      }
    }

    function getSETSession() {
      try {
        const bkk = getBkkTimeParts();
        if (bkk.weekday === 'Sun' || bkk.weekday === 'Sat') return 'closed';
        const t = bkk.hour * 60 + bkk.minute;

        // SET Schedule (ICT):
        // 09:30 - 10:00 (570 - 600): Pre-Open 1
        if (t >= 570 && t < 600) return 'pre-market';
        // 10:00 - 12:30 (600 - 750): Morning Trading Session
        if (t >= 600 && t < 750) return 'regular';
        // 12:30 - 14:00 (750 - 840): Intermission / Lunch Break (พักการซื้อขายช่วงเที่ยง)
        if (t >= 750 && t < 840) return 'intermission';
        // 14:00 - 14:30 (840 - 870): Pre-Open 2
        if (t >= 840 && t < 870) return 'pre-market';
        // 14:30 - 16:30 (870 - 990): Afternoon Trading Session
        if (t >= 870 && t < 990) return 'regular';
        // 16:30 - 16:40 (990 - 1000): Pre-Close
        if (t >= 990 && t < 1000) return 'post-market';
        return 'closed';
      } catch (e) {
        return 'closed';
      }
    }

    function updateMarketStatus() {
      const sus = getUSSession();
      const sset = getSETSession();
      const bUS = document.getElementById('marketBadgeUS');
      const tUS = document.getElementById('marketBadgeTextUS');
      const bSET = document.getElementById('marketBadgeSET');
      const tSET = document.getElementById('marketBadgeTextSET');

      bUS.className = 'market-badge';
      bSET.className = 'market-badge';

      const l = I18N[S.lang] || I18N.en;
      const m = {
        regular: ['open', l.marketOpen],
        'pre-market': ['pre-market', l.marketPre],
        'post-market': ['after-hours', l.marketAfter],
        intermission: ['intermission', l.marketIntermission || 'Lunch Break'],
        closed: ['closed', l.marketClosed]
      };

      const [clUS, lbUS] = m[sus] || m.closed;
      bUS.classList.add(clUS);
      tUS.textContent = lbUS;

      const [clSET, lbSET] = m[sset] || m.closed;
      bSET.classList.add(clSET);
      tSET.textContent = lbSET;
    }

    // Desktop Sidebar Collapse / Expand
    function toggleDesktopSidebar(force) {
      const sb = document.getElementById('desktopWishlist');
      if (!sb) return;
      const willCollapse = typeof force === 'boolean' ? force : !sb.classList.contains('collapsed');
      sb.classList.toggle('collapsed', willCollapse);
      document.body.classList.toggle('sidebar-collapsed', willCollapse);
      localStorage.setItem('stockpulse_sidebar_collapsed', willCollapse ? '1' : '0');

      const toggleBtn = document.getElementById('btnToggleSidebar');
      if (toggleBtn) toggleBtn.classList.toggle('active', !willCollapse);

      // Trigger chart resize if chart exists
      setTimeout(() => {
        if (stockChart && document.getElementById('stockChartContainer')) {
          stockChart.applyOptions({ width: document.getElementById('stockChartContainer').clientWidth });
        }
      }, 300);
    }

    // Wishlist
    function toggleWishlist() { if (!S.sym) return; const i = S.wl.findIndex(w => w.symbol === S.sym); if (i >= 0) { S.wl.splice(i, 1); removeWatchlistFromSupabase(S.sym); showToast(S.sym + ' removed', 'success'); } else { const name = S.profile ? S.profile.name : S.sym; S.wl.push({ symbol: S.sym, name: name }); addWatchlistToSupabase(S.sym, name); showToast(S.sym + ' added', 'success'); } saveWl(); renderWishlist(); updateWishlistButton(); updateWishlistPrices().then(updateDashboard); }
    function removeWl(sym, ev) { if (ev) ev.stopPropagation(); S.wl = S.wl.filter(w => w.symbol !== sym); removeWatchlistFromSupabase(sym); saveWl(); renderWishlist(); updateWishlistButton(); updateDashboard(); showToast(sym + ' removed', 'success'); }
    function saveWl() { localStorage.setItem('stockpulse_wishlist', JSON.stringify(S.wl.map(({ symbol, name }) => ({ symbol, name })))); }
    function updateWishlistButton() { const b = document.getElementById('btnWishlist'), ic = document.getElementById('wishlistIcon'), tx = document.getElementById('wishlistBtnText'), isIn = S.wl.some(w => w.symbol === S.sym); if (isIn) { b.classList.add('active'); ic.innerHTML = '<path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/>'; tx.textContent = '★'; } else { b.classList.remove('active'); ic.innerHTML = '<path d="M22 9.24l-7.19-.62L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21 12 17.27 18.18 21l-1.63-7.03L22 9.24zM12 15.4l-3.76 2.27 1-4.28-3.32-2.88 4.38-.38L12 6.1l1.71 4.04 4.38.38-3.32 2.88 1 4.28L12 15.4z"/>'; tx.textContent = (I18N[S.lang] || I18N.en).add; } }

    function renderWishlist() {
      const list = document.getElementById('wishlistList'), cnt = document.getElementById('wishlistCount');
      if (cnt) cnt.textContent = S.wl.length;
      const fBadge = document.getElementById('floatingWlBadge');
      if (fBadge) fBadge.textContent = S.wl.length;
      const t = I18N[S.lang] || I18N.en;
      if (!S.wl.length) { list.innerHTML = `<div class="wishlist-empty"><svg viewBox="0 0 24 24"><path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/></svg><p>${t.emptyWatchlistSidebar}</p></div>`; return; }
      list.innerHTML = S.wl.map(s => {
        const a = s.symbol === S.sym, q = s._quote, cs = getCurSym(s.symbol, q), p = q ? cs + fmtNum(q.c) : '—', pct = q ? q.dp : null, d = pct !== null ? (pct >= 0 ? 'up' : 'down') : '', pt = pct !== null ? (pct >= 0 ? '+' : '') + pct.toFixed(2) + '%' : '';
        return `<div class="wishlist-item${a ? ' active' : ''}" onclick="loadStock('${esc(s.symbol)}')"><div class="wishlist-item-info"><div class="wishlist-item-symbol">${esc(s.symbol)} ${s.symbol.endsWith('.BK') ? '<span class="search-tag-th">SET</span>' : ''}</div><div class="wishlist-item-name">${esc(s.name || s.symbol)}</div></div><div class="wishlist-item-price"><div class="wishlist-item-price-val">${p}</div><div class="wishlist-item-change ${d}">${pt}</div></div><button class="wishlist-item-remove" onclick="removeWl('${esc(s.symbol)}',event)"><svg viewBox="0 0 24 24"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg></button></div>`;
      }).join('');
    }

    async function updateWishlistPrices() {
      if (!S.wl.length) return;
      await Promise.allSettled(S.wl.map(async (item) => {
        try {
          const q = await fetchQ(item.symbol);
          if (q && q.c) item._quote = q;
        } catch (e) { }
      }));
      renderWishlist();
    }

    // Settings
    function openSettings() {
      const inp = document.getElementById('settingsEmail');
      inp.value = S.alertEmail || '';
      document.getElementById('settingsError').classList.remove('visible');
      inp.classList.remove('error');
      const toggle = document.getElementById('settingsPremarketToggle');
      if (toggle) toggle.checked = S.premarketAlert;
      updateSettingsPremarketStatus();
      document.getElementById('settingsModal').classList.add('active');
    }
    function closeSettings() {
      document.getElementById('settingsModal').classList.remove('active');
      document.getElementById('settingsError').classList.remove('visible');
      document.getElementById('settingsEmail').classList.remove('error');
    }
    function saveSettings() {
      const inp = document.getElementById('settingsEmail');
      const err = document.getElementById('settingsError');
      const email = inp.value.trim();
      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        inp.classList.add('error');
        err.textContent = (I18N[S.lang] || I18N.en).settingsEmailLabel + ': invalid email.';
        err.classList.add('visible');
        return;
      }
      S.alertEmail = email;
      localStorage.setItem('stockpulse_alert_email', email);
      const toggle = document.getElementById('settingsPremarketToggle');
      if (toggle) {
        S.premarketAlert = toggle.checked;
        localStorage.setItem('stockpulse_premarket_alert', toggle.checked ? 'true' : 'false');
      }
      closeSettings();
      renderAlertEmailNote();
      showToast('Settings saved!', 'success');
      // Trigger check immediately in case it's currently pre-market time
      checkAndSendDailyPreMarketBriefing();
    }

    function togglePremarketAlert(enabled) {
      S.premarketAlert = enabled;
      localStorage.setItem('stockpulse_premarket_alert', enabled ? 'true' : 'false');
      updateSettingsPremarketStatus();
      const sched = getPreMarketScheduleInfo();
      showToast(enabled ? `Pre-Market Alert enabled (${sched.timeLabel})` : 'Pre-Market Alert disabled', 'success');
      if (enabled) checkAndSendDailyPreMarketBriefing();
    }

    // Events
    function setupEvents() {
      const si = document.getElementById('searchInput');
      si.addEventListener('input', e => { clearTimeout(S.searchTO); const q = e.target.value.trim(); if (!q) { closeDD(); return; } S.searchTO = setTimeout(() => searchSymbols(q), 300); });
      si.addEventListener('keydown', e => { if (e.key === 'Enter') { const q = si.value.trim().toUpperCase(); if (q) { loadStock(q); closeDD(); si.value = ''; si.blur(); } } if (e.key === 'Escape') { closeDD(); si.blur(); } });
      document.addEventListener('keydown', e => { if ((e.metaKey || e.ctrlKey) && e.key === 'k') { e.preventDefault(); si.focus(); } });
      document.addEventListener('click', e => { if (!e.target.closest('.search-wrap')) closeDD(); });
      document.getElementById('settingsModal').addEventListener('click', e => { if (e.target === e.currentTarget) closeSettings(); });
      document.getElementById('alertAboveInput').addEventListener('input', e => { e.target.classList.toggle('has-value', !!e.target.value); });
      document.getElementById('alertBelowInput').addEventListener('input', e => { e.target.classList.toggle('has-value', !!e.target.value); });
    }

