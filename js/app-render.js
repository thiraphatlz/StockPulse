    // ===== ULTRA-FAST CACHE LAYER =====
    const CACHE = {
      quote: new Map(),   // key -> { data, exp }
      metric: new Map(),  // key -> { data, exp }
      profile: new Map(), // key -> { data, exp }
      chart: new Map(),   // key -> { data, exp }
      get(type, key) {
        const item = this[type]?.get(key);
        if (item && Date.now() < item.exp) return item.data;
        return null;
      },
      set(type, key, data, ttlMs) {
        if (!this[type]) return;
        this[type].set(key, { data, exp: Date.now() + ttlMs });
      }
    };

    // API
    const API = 'https://finnhub.io/api/v1';
    async function api(ep, p = {}) {
      p.token = S.apiKey || HARDCODED_API_KEY;
      const cacheKey = ep + '?' + new URLSearchParams(p).toString();
      const cached = CACHE.get('metric', cacheKey) || CACHE.get('profile', cacheKey);
      if (cached) return cached;

      try {
        const r = await fetch(API + ep + '?' + new URLSearchParams(p), { signal: AbortSignal.timeout(4000) });
        if (r.status === 401) throw new Error('Invalid API key');
        if (r.status === 429) {
          console.warn('Finnhub rate limited, using fallback if available');
          throw new Error('Rate limited');
        }
        if (!r.ok) throw new Error('API error');
        const data = await r.json();
        if (ep.includes('metric')) CACHE.set('metric', cacheKey, data, 120000); // 2 min
        else if (ep.includes('profile')) CACHE.set('profile', cacheKey, data, 300000); // 5 min
        return data;
      } catch (err) {
        if (err.name === 'TimeoutError') console.warn('API timeout on', ep);
        throw err;
      }
    }
    const fetchP = s => api('/stock/profile2', { symbol: s }), fetchS = q => api('/search', { q }), fetchM = s => api('/stock/metric', { symbol: s, metric: 'all' });

    async function fetchQ(s) {
      if (!s) return null;
      s = s.trim().toUpperCase();

      // 0. Check in-memory quote cache (15 seconds TTL)
      const cached = CACHE.get('quote', s);
      if (cached) return cached;

      const isThai = s.endsWith('.BK') || s.endsWith('.TH');

      // 1. Try our Vercel Serverless Function first (with 1.5s timeout)
      try {
        const res = await fetch(`/api/quote?symbol=${encodeURIComponent(s)}`, { signal: AbortSignal.timeout(1500) });
        if (res.ok) {
          const data = await res.json();
          if (data && data.c) {
            CACHE.set('quote', s, data, 15000);
            return data;
          }
        }
      } catch (e) { }

      // 2. Direct Finnhub for US stocks (Super Fast ~200ms)
      if (!isThai) {
        try {
          const q = await api('/quote', { symbol: s });
          if (q && q.c) {
            const formatted = {
              symbol: s,
              currency: 'USD',
              exchange: 'US',
              c: q.c,
              d: q.d,
              dp: q.dp,
              h: q.h,
              l: q.l,
              o: q.o,
              pc: q.pc,
              v: null,
              avgVolume: null,
              fiftyTwoWeekHigh: null,
              fiftyTwoWeekLow: null,
              isThai: false
            };
            CACHE.set('quote', s, formatted, 15000);
            return formatted;
          }
        } catch (e) { }
      }

      // 3. Client fallback for Thai stocks (.BK)
      if (isThai) {
        try {
          const yUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(s)}?interval=1d&range=1d`;
          const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(yUrl)}`;
          const res = await fetch(proxyUrl, { signal: AbortSignal.timeout(3000) });
          if (res.ok) {
            const data = await res.json();
            const meta = data?.chart?.result?.[0]?.meta;
            if (meta) {
              const curPrice = meta.regularMarketPrice ?? meta.chartPreviousClose ?? 0;
              const prevClose = meta.chartPreviousClose ?? meta.previousClose ?? curPrice;
              const change = curPrice - prevClose;
              const result = {
                symbol: meta.symbol || s,
                name: meta.longName || meta.shortName || s,
                currency: meta.currency || 'THB',
                exchange: meta.exchangeName || 'SET',
                c: curPrice,
                d: change,
                dp: prevClose ? (change / prevClose) * 100 : 0,
                h: meta.regularMarketDayHigh ?? curPrice,
                l: meta.regularMarketDayLow ?? curPrice,
                o: meta.regularMarketOpen ?? curPrice,
                pc: prevClose,
                v: meta.regularMarketVolume ?? null,
                avgVolume: meta.averageDailyVolume3Month ?? meta.averageDailyVolume10Day ?? null,
                fiftyTwoWeekHigh: meta.fiftyTwoWeekHigh ?? null,
                fiftyTwoWeekLow: meta.fiftyTwoWeekLow ?? null,
                trailingPE: meta.trailingPE ?? null,
                epsTrailingTwelveMonths: meta.epsTrailingTwelveMonths ?? null,
                beta: meta.beta ?? null,
                dividendYield: meta.dividendYield ?? null,
                priceToBook: meta.priceToBook ?? null,
                forwardPE: meta.forwardPE ?? null,
                marketCap: meta.marketCap || 0,
                isThai: true
              };
              CACHE.set('quote', s, result, 15000);
              return result;
            }
          }
        } catch (e) { }
      }

      // 4. Try with .BK if no dot and not found
      if (!s.includes('.')) {
        return fetchQ(`${s}.BK`);
      }

      return null;
    }

    function fmtVol(v) {
      if (v == null || isNaN(v) || v <= 0) return '—';
      if (v >= 1e9) return (v / 1e9).toFixed(2) + 'B';
      if (v >= 1e6) return (v / 1e6).toFixed(2) + 'M';
      if (v >= 1e3) return (v / 1e3).toFixed(1) + 'K';
      return Number(v).toLocaleString();
    }

    function switchTechTab(tab, btn) {
      document.querySelectorAll('.tech-tab').forEach(b => b.classList.remove('active'));
      if (btn) btn.classList.add('active');
      document.querySelectorAll('.tech-section').forEach(s => s.classList.remove('active'));
      const secMap = { pivot: 'techSecPivot', fibo: 'techSecFibo', ma: 'techSecMa', rsi: 'techSecRsi' };
      const sec = document.getElementById(secMap[tab]);
      if (sec) sec.classList.add('active');
    }

    function renderValuation(q) {
      const isTh = q.isThai;
      const cs = isTh ? '฿' : '$';
      document.getElementById('valPE').textContent = (q.trailingPE != null && !isNaN(q.trailingPE) && q.trailingPE > 0) ? Number(q.trailingPE).toFixed(2) + 'x' : '—';
      document.getElementById('valFwdPE').textContent = (q.forwardPE != null && !isNaN(q.forwardPE) && q.forwardPE > 0) ? Number(q.forwardPE).toFixed(2) + 'x' : '—';
      document.getElementById('valEPS').textContent = (q.epsTrailingTwelveMonths != null && !isNaN(q.epsTrailingTwelveMonths)) ? cs + Number(q.epsTrailingTwelveMonths).toFixed(2) : '—';
      document.getElementById('valBeta').textContent = (q.beta != null && !isNaN(q.beta)) ? Number(q.beta).toFixed(2) : '—';
      document.getElementById('valDivYield').textContent = (q.dividendYield != null && !isNaN(q.dividendYield) && q.dividendYield > 0) ? (q.dividendYield > 1 ? Number(q.dividendYield).toFixed(2) : (Number(q.dividendYield) * 100).toFixed(2)) + '%' : '—';
      document.getElementById('valPB').textContent = (q.priceToBook != null && !isNaN(q.priceToBook) && q.priceToBook > 0) ? Number(q.priceToBook).toFixed(2) + 'x' : '—';
    }

    async function calcAndRenderTechnicals(q) {
      if (!q || !q.c) return;
      const cs = getCurSym(S.sym, q);
      const close = q.c;

      // 1. Classic Pivot Points (Daily Standard)
      // Standard Formula uses Previous Trading Day's High, Low, and Close (Fixed throughout the session)
      let high = q.prevHigh || q.h || q.pc || q.c;
      let low = q.prevLow || q.l || q.pc || q.c;
      let prevClose = q.pc || q.c;

      // Fetch daily candles to get accurate Previous Trading Day High & Low
      if (S.sym && (!q.prevHigh || !q.prevLow)) {
        try {
          const dailyCandles = await fetchChartCandles(S.sym, '1d', '5d');
          if (dailyCandles && dailyCandles.length >= 2) {
            const prevCandle = dailyCandles[dailyCandles.length - 2];
            if (prevCandle && prevCandle.high && prevCandle.low && prevCandle.close) {
              high = prevCandle.high;
              low = prevCandle.low;
              prevClose = prevCandle.close;
              q.prevHigh = high;
              q.prevLow = low;
            }
          }
        } catch (e) { }
      }

      const P = (high + low + prevClose) / 3;
      const diffHL = high - low;
      const R1 = (2 * P) - low;
      const R2 = P + diffHL;
      const R3 = high + 2 * (P - low);
      const S1 = (2 * P) - high;
      const S2 = P - diffHL;
      const S3 = low - 2 * (high - P);
      const isTh = S.lang === 'th';

      const levels = [
        { key: isTh ? 'แนวรับ 3 (S3)' : 'Support 3', val: S3, type: 'support' },
        { key: isTh ? 'แนวรับ 2 (S2)' : 'Support 2', val: S2, type: 'support' },
        { key: isTh ? 'แนวรับ 1 (S1)' : 'Support 1', val: S1, type: 'support' },
        { key: isTh ? 'จุดหมุน (P)' : 'Pivot Point', val: P, type: 'pivot-center' },
        { key: isTh ? 'แนวต้าน 1 (R1)' : 'Resist 1', val: R1, type: 'resistance' },
        { key: isTh ? 'แนวต้าน 2 (R2)' : 'Resist 2', val: R2, type: 'resistance' },
        { key: isTh ? 'แนวต้าน 3 (R3)' : 'Resist 3', val: R3, type: 'resistance' },
      ];

      const pivotGrid = document.getElementById('pivotGrid');
      if (pivotGrid) {
        pivotGrid.innerHTML = levels.map(l => {
          const isNear = Math.abs(close - l.val) / l.val < 0.0075;
          return `<div class="pivot-card ${l.type}">
            <div class="pivot-lbl">${l.key}</div>
            <div class="pivot-val">${cs}${fmtNum(l.val)}</div>
            ${isNear ? `<div class="pivot-near">${isTh ? '⚡ ใกล้ระดับ' : '⚡ Near'}</div>` : ''}
          </div>`;
        }).join('');
      }

      // 2. Fibonacci Retracement
      const rangeHigh = q.fiftyTwoWeekHigh || high;
      const rangeLow = q.fiftyTwoWeekLow || low;
      const rangeDiff = rangeHigh - rangeLow;
      if (rangeDiff > 0) {
        const fibLevels = [
          { pct: isTh ? '0% (จุดต่ำสุด)' : '0% (Low)', val: rangeLow },
          { pct: '23.6%', val: rangeLow + rangeDiff * 0.236 },
          { pct: '38.2%', val: rangeLow + rangeDiff * 0.382 },
          { pct: '50.0%', val: rangeLow + rangeDiff * 0.500 },
          { pct: '61.8%', val: rangeLow + rangeDiff * 0.618 },
          { pct: '78.6%', val: rangeLow + rangeDiff * 0.786 },
          { pct: isTh ? '100% (จุดสูงสุด)' : '100% (High)', val: rangeHigh },
        ];

        const marker = document.getElementById('fiboPriceMarker');
        if (marker) {
          const pctPos = Math.max(0, Math.min(100, ((close - rangeLow) / rangeDiff) * 100));
          marker.style.left = `${pctPos}%`;
          marker.setAttribute('data-label', `${cs}${fmtNum(close)} (${pctPos.toFixed(1)}%)`);
        }

        const fiboGrid = document.getElementById('fiboGrid');
        if (fiboGrid) {
          fiboGrid.innerHTML = fibLevels.map(f => `
            <div class="fibo-item">
              <div class="fibo-pct">${f.pct}</div>
              <div class="fibo-v">${cs}${fmtNum(f.val)}</div>
            </div>`).join('');
        }
      }

      // 3. Moving Averages & RSI from 1M / daily chart
      try {
        const dailyCandles = await fetchChartCandles(S.sym, '1d', '1mo');
        if (dailyCandles && dailyCandles.length >= 5) {
          const closes = dailyCandles.map(c => c.close).filter(c => c != null && !isNaN(c));

          let ma20 = null, ma50 = null;
          if (closes.length >= 20) {
            ma20 = closes.slice(-20).reduce((a, b) => a + b, 0) / 20;
          } else if (closes.length >= 10) {
            ma20 = closes.slice(-10).reduce((a, b) => a + b, 0) / 10;
          }

          if (closes.length >= 50) {
            ma50 = closes.slice(-50).reduce((a, b) => a + b, 0) / 50;
          }

          const maList = document.getElementById('maList');
          if (maList) {
            const renderMaRow = (name, val) => {
              if (val == null) return `<div class="ma-row"><span class="ma-label">${name}</span><span class="ma-val">—</span><span class="ma-badge na">N/A</span></div>`;
              const diffPct = ((close - val) / val) * 100;
              const isAbove = diffPct >= 0;
              const badgeCls = isAbove ? 'above' : 'below';
              const sign = isAbove ? '+' : '';
              const statusTxt = isTh ? (isAbove ? 'อยู่เหนือเส้น' : 'อยู่ใต้เส้น') : (isAbove ? 'Above' : 'Below');
              return `<div class="ma-row">
                <span class="ma-label">${name}</span>
                <span class="ma-val">${cs}${fmtNum(val)}</span>
                <span class="ma-badge ${badgeCls}">${statusTxt} (${sign}${diffPct.toFixed(2)}%)</span>
              </div>`;
            };
            maList.innerHTML = renderMaRow(closes.length >= 20 ? (isTh ? 'SMA 20 (ระยะสั้น)' : 'MA 20') : (isTh ? 'SMA 10' : 'MA 10'), ma20) + renderMaRow(isTh ? 'SMA 50 (ระยะกลาง)' : 'MA 50', ma50);
          }

          // RSI 14
          if (closes.length >= 14) {
            let gains = 0, losses = 0;
            for (let i = closes.length - 14; i < closes.length; i++) {
              const diff = closes[i] - closes[i - 1];
              if (diff >= 0) gains += diff;
              else losses += Math.abs(diff);
            }
            const avgGain = gains / 14;
            const avgLoss = losses / 14;
            let rsi = 50;
            if (avgLoss === 0) {
              rsi = 100;
            } else {
              const rs = avgGain / avgLoss;
              rsi = 100 - (100 / (1 + rs));
            }

            const rsiNumEl = document.getElementById('rsiNumber');
            const rsiSigEl = document.getElementById('rsiSignal');
            const rsiCurEl = document.getElementById('rsiCursor');
            const rsiBarLabelsEl = document.getElementById('rsiBarLabels');
            if (rsiBarLabelsEl) {
              rsiBarLabelsEl.innerHTML = `
                <span>0 ${isTh ? 'ขายมากเกิน' : 'Oversold'}</span>
                <span>30</span>
                <span>50</span>
                <span>70</span>
                <span>100 ${isTh ? 'ซื้อมากเกิน' : 'Overbought'}</span>`;
            }
            if (rsiNumEl) rsiNumEl.textContent = rsi.toFixed(1);
            if (rsiCurEl) rsiCurEl.style.left = `${Math.max(2, Math.min(98, rsi))}%`;
            if (rsiSigEl) {
              if (rsi < 30) {
                rsiSigEl.className = 'rsi-signal oversold';
                rsiSigEl.textContent = isTh ? `ขายมากเกินไป (${rsi.toFixed(1)}) — โอกาสกลับตัวขึ้น (Bullish)` : `Oversold (${rsi.toFixed(1)}) — Bullish Reversal Area`;
              } else if (rsi > 70) {
                rsiSigEl.className = 'rsi-signal overbought';
                rsiSigEl.textContent = isTh ? `ซื้อมากเกินไป (${rsi.toFixed(1)}) — ระวังการย่อตัว (Pullback)` : `Overbought (${rsi.toFixed(1)}) — Pullback Risk`;
              } else {
                rsiSigEl.className = 'rsi-signal neutral';
                rsiSigEl.textContent = isTh ? `สภาวะเป็นกลาง (${rsi.toFixed(1)})` : `Neutral (${rsi.toFixed(1)})`;
              }
            }
          }
        }
      } catch (e) {
        console.warn('Technical MA/RSI calculation error:', e);
      }
    }

    // SET Thai Stocks Database (Instant 0ms Search)
    const SET_STOCKS = [
      { s: 'ADVANC.BK', n: 'Advanced Info Service (แอดวานซ์ อินโฟร์ เซอร์วิส)', t: 'ICT' },
      { s: 'DELTA.BK', n: 'Delta Electronics Thailand (เดลต้า อีเลคโทรนิคส์)', t: 'Electronic Components' },
      { s: 'AOT.BK', n: 'Airports of Thailand (ท่าอากาศยานไทย)', t: 'Transportation' },
      { s: 'BDMS.BK', n: 'Bangkok Dusit Medical Services (กรุงเทพดุสิตเวชการ)', t: 'Healthcare' },
      { s: 'CPALL.BK', n: 'CP ALL (ซีพี ออลล์ - 7-Eleven)', t: 'Commerce' },
      { s: 'GULF.BK', n: 'Gulf Energy Development (กัลฟ์ เอ็นเนอร์จี)', t: 'Energy & Utilities' },
      { s: 'PTT.BK', n: 'PTT Public Company (ปตท.)', t: 'Energy & Utilities' },
      { s: 'PTTEP.BK', n: 'PTT Exploration and Production (ปตท. สผ.)', t: 'Energy & Utilities' },
      { s: 'SCB.BK', n: 'SCB X (เอสซีบี เอกซ์ - ธนาคารไทยพาณิชย์)', t: 'Banking' },
      { s: 'KBANK.BK', n: 'Kasikornbank (ธนาคารกสิกรไทย)', t: 'Banking' },
      { s: 'BBL.BK', n: 'Bangkok Bank (ธนาคารกรุงเทพ)', t: 'Banking' },
      { s: 'KTB.BK', n: 'Krungthai Bank (ธนาคารกรุงไทย)', t: 'Banking' },
      { s: 'TRUE.BK', n: 'True Corporation (ทรู คอร์ปอเรชั่น)', t: 'ICT' },
      { s: 'CPN.BK', n: 'Central Pattana (เซ็นทรัลพัฒนา)', t: 'Property Development' },
      { s: 'MINT.BK', n: 'Minor International (ไมเนอร์ อินเตอร์เนชั่นแนล)', t: 'Food & Hospitality' },
      { s: 'CRC.BK', n: 'Central Retail Corporation (เซ็นทรัล รีเทล)', t: 'Commerce' },
      { s: 'BH.BK', n: 'Bumrungrad Hospital (โรงพยาบาลบำรุงราษฎร์)', t: 'Healthcare' },
      { s: 'SCC.BK', n: 'Siam Cement (ปูนซิเมนต์ไทย)', t: 'Construction Materials' },
      { s: 'BGRIM.BK', n: 'B.Grimm Power (บี.กริม เพาเวอร์)', t: 'Energy & Utilities' },
      { s: 'GPSC.BK', n: 'Global Power Synergy (โกลบอล เพาเวอร์ ซินเนอร์ยี่)', t: 'Energy & Utilities' },
      { s: 'HMPRO.BK', n: 'Home Product Center (โฮม โปรดักส์ เซ็นเตอร์)', t: 'Commerce' },
      { s: 'INTUCH.BK', n: 'Intouch Holdings (อินทัช โฮลดิ้งส์)', t: 'ICT' },
      { s: 'IVL.BK', n: 'Indorama Ventures (อินโดรามา เวนเจอร์ส)', t: 'Petrochemicals' },
      { s: 'LH.BK', n: 'Land and Houses (แลนด์แอนด์เฮ้าส์)', t: 'Property Development' },
      { s: 'MTC.BK', n: 'Muangthai Capital (เมืองไทย แคปปิตอล)', t: 'Finance' },
      { s: 'OR.BK', n: 'PTT Oil and Retail (ปตท. น้ำมันและการค้าปลีก)', t: 'Energy & Utilities' },
      { s: 'OSP.BK', n: 'Osotspa (โอสถสภา)', t: 'Food & Beverage' },
      { s: 'PTTGC.BK', n: 'PTT Global Chemical (พีทีที โกลบอล เคมิคอล)', t: 'Petrochemicals' },
      { s: 'RATCH.BK', n: 'RATCH Group (ราช กรุ๊ป)', t: 'Energy & Utilities' },
      { s: 'SAWAD.BK', n: 'Srisawad Corporation (ศรีสวัสดิ์ คอร์ปอเรชั่น)', t: 'Finance' },
      { s: 'SCGP.BK', n: 'SCG Packaging (เอสซีจี แพคเกจจิ้ง)', t: 'Packaging' },
      { s: 'TOP.BK', n: 'Thai Oil (ไทยออยล์)', t: 'Energy & Utilities' },
      { s: 'TU.BK', n: 'Thai Union Group (ไทยยูเนี่ยน กรุ๊ป)', t: 'Food & Beverage' },
      { s: 'WHA.BK', n: 'WHA Corporation (ดับบลิวเอชเอ คอร์ปอเรชั่น)', t: 'Property Development' },
      { s: 'BANPU.BK', n: 'Banpu (บ้านปู)', t: 'Energy & Utilities' },
      { s: 'BTS.BK', n: 'BTS Group Holdings (บีทีเอส กรุ๊ป)', t: 'Transportation' },
      { s: 'CBG.BK', n: 'Carabao Group (คาราบาวกรุ๊ป)', t: 'Food & Beverage' },
      { s: 'COM7.BK', n: 'Com7 (คอมเซเว่น)', t: 'Commerce' },
      { s: 'EA.BK', n: 'Energy Absolute (พลังงานบริสุทธิ์)', t: 'Energy & Utilities' },
      { s: 'EGCO.BK', n: 'Electricity Generating (ผลิตไฟฟ้า)', t: 'Energy & Utilities' },
      { s: 'KCE.BK', n: 'KCE Electronics (เคซีอี อีเลคโทรนิคส์)', t: 'Electronic Components' },
      { s: 'KKP.BK', n: 'Kiatnakin Phatra Bank (ธนาคารเกียรตินาคินภัทร)', t: 'Banking' },
      { s: 'KTC.BK', n: 'Krungthai Card (บัตรกรุงไทย)', t: 'Finance' },
      { s: 'MEGA.BK', n: 'Mega Lifesciences (เมก้า ไลฟ์ไซแอ็นซ์)', t: 'Healthcare' },
      { s: 'PLANB.BK', n: 'Plan B Media (แพลน บี มีเดีย)', t: 'Media & Publishing' },
      { s: 'TCAP.BK', n: 'Thanachart Capital (ทุนธนชาต)', t: 'Finance' },
      { s: 'TIDLOR.BK', n: 'Ngern Tid Lor (เงินติดล้อ)', t: 'Finance' },
      { s: 'TISCO.BK', n: 'TISCO Financial Group (ทิสโก้ไฟแนนเชียลกรุ๊ป)', t: 'Banking' },
      { s: 'TTB.BK', n: 'TMBThanachart Bank (ทีเอ็มบีธนชาต)', t: 'Banking' },
      { s: 'BJC.BK', n: 'Berli Jucker (เบอร์ลี่ ยุคเกอร์ - Big C)', t: 'Commerce' },
      { s: 'CENTEL.BK', n: 'Central Plaza Hotel (โรงแรมเซ็นทรัลพลาซา)', t: 'Food & Hospitality' },
      { s: 'GLOBAL.BK', n: 'Siam Global House (สยามโกลบอลเฮ้าส์)', t: 'Commerce' },
      { s: 'ITC.BK', n: 'i-Tail Corporation (ไอ-เทล คอร์ปอเรชั่น)', t: 'Food & Beverage' },
      { s: 'JMT.BK', n: 'JMT Network Services (เจ เอ็ม ที)', t: 'Finance' },
      { s: 'SIRI.BK', n: 'Sansiri (แสนสิริ)', t: 'Property Development' },
      { s: 'SPRC.BK', n: 'Star Petroleum Refining (สตาร์ ปิโตรเลียม)', t: 'Energy & Utilities' },
      { s: 'STA.BK', n: 'Sri Trang Agro-Industry (ศรีตรังแอโกร)', t: 'Agribusiness' },
      { s: 'STGT.BK', n: 'Sri Trang Gloves (ศรีตรังโกลฟส์)', t: 'Healthcare' },
      { s: 'TASCO.BK', n: 'Tipco Asphalt (ทิปโก้แอสฟัลท์)', t: 'Construction Materials' },
      { s: 'TLI.BK', n: 'Thai Life Insurance (ไทยประกันชีวิต)', t: 'Insurance' },
      { s: 'VGI.BK', n: 'VGI (วีจีไอ)', t: 'Media & Publishing' },
      { s: 'AMATA.BK', n: 'Amata Corporation (อมตะ คอร์ปอเรชัน)', t: 'Property Development' },
      { s: 'AP.BK', n: 'AP Thailand (เอพี ไทยแลนด์)', t: 'Property Development' },
      { s: 'BCP.BK', n: 'Bangchak Corporation (บางจาก คอร์ปอเรชั่น)', t: 'Energy & Utilities' },
      { s: 'CHG.BK', n: 'Chularat Hospital (โรงพยาบาลจุฬารัตน์)', t: 'Healthcare' },
      { s: 'ERW.BK', n: 'The Erawan Group (ดิ เอราวัณ กรุ๊ป)', t: 'Food & Hospitality' },
      { s: 'HANA.BK', n: 'Hana Microelectronics (ฮานา ไมโครอิเล็คโทรนิคส)', t: 'Electronic Components' },
      { s: 'ICHI.BK', n: 'Ichitan Group (อิชิตัน กรุ๊ป)', t: 'Food & Beverage' },
      { s: 'PSL.BK', n: 'Precious Shipping (พรีเชียส ชิพปิ้ง)', t: 'Transportation' },
      { s: 'RCL.BK', n: 'Regional Container Lines (อาร์ ซี แอล)', t: 'Transportation' },
      { s: 'SAPPE.BK', n: 'Sappe (เซ็ปเป้)', t: 'Food & Beverage' },
      { s: 'SNNP.BK', n: 'Srinanaporn Marketing (ศรีนานาพร มาร์เก็ตติ้ง)', t: 'Food & Beverage' },
      { s: 'SPALI.BK', n: 'Supalai (ศุภาลัย)', t: 'Property Development' },
      { s: 'TTW.BK', n: 'TTW (ทีทีดับบลิว)', t: 'Energy & Utilities' },
      { s: 'AURA.BK', n: 'Aurora Design (ออโรร่า ดีไซน์)', t: 'Commerce' },
      { s: 'MOSHI.BK', n: 'Moshi Moshi Retail (โมชิ โมชิ)', t: 'Commerce' },
      { s: 'MAJOR.BK', n: 'Major Cineplex (เมเจอร์ ซีนีเพล็กซ์)', t: 'Media & Publishing' },
      { s: 'SISB.BK', n: 'SISB (เอสไอเอสบี)', t: 'Services' },
      { s: 'MASTER.BK', n: 'Master Style (มาสเตอร์ สไตล์)', t: 'Healthcare' },
      { s: 'SKY.BK', n: 'SKY ICT (สกาย ไอซีที)', t: 'ICT' }
    ];

    // Search
    async function searchSymbols(q) {
      q = q.trim();
      if (!q) return [];
      const qUpper = q.toUpperCase();
      const qClean = qUpper.replace(/\.BK$/, '');
      const results = [];
      const seen = new Set();

      // 1. Instant local search from curated SET stocks (0ms)
      for (const item of SET_STOCKS) {
        const symClean = item.s.replace(/\.BK$/, '');
        if (
          symClean.includes(qClean) ||
          item.n.toUpperCase().includes(qUpper) ||
          item.n.includes(q)
        ) {
          seen.add(item.s);
          results.push({
            symbol: item.s,
            description: item.n,
            type: item.t + ' (SET)',
            isThai: true
          });
        }
      }

      // 2. Try Vercel Serverless Function (Dual search Yahoo Finance)
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
        if (res.ok) {
          const data = await res.json();
          if (data?.result?.length) {
            for (const r of data.result) {
              if (!seen.has(r.symbol)) {
                seen.add(r.symbol);
                results.push(r);
              }
            }
          }
        }
      } catch (e) { }

      // 3. Fallback to Finnhub (for global / US stocks)
      if (results.length < 5) {
        try {
          const fh = await fetchS(q).catch(() => null);
          if (fh?.result?.length) {
            for (const r of fh.result) {
              if (!seen.has(r.symbol)) {
                seen.add(r.symbol);
                results.push({
                  symbol: r.symbol,
                  description: r.description || r.symbol,
                  type: r.type || 'Stock',
                  isThai: r.symbol.endsWith('.BK')
                });
              }
            }
          }
        } catch (e) { }
      }

      // Render search dropdown if active
      const searchDD = document.getElementById('searchDropdown');
      if (searchDD && document.activeElement === document.getElementById('searchInput')) {
        if (!results.length) {
          searchDD.innerHTML = '<div class="search-empty">No stocks found</div>';
          searchDD.classList.add('active');
        } else {
          searchDD.innerHTML = results.slice(0, 8).map(r => `
            <div class="search-item" onclick="selectSearch('${esc(r.symbol)}')">
              <div>
                <div class="search-item-symbol">${esc(r.symbol)} ${r.isThai ? '<span class="search-tag-th">SET</span>' : ''}</div>
                <div class="search-item-name">${esc(r.description || '')}</div>
              </div>
              <span class="search-item-type">${esc(r.type || 'Stock')}</span>
            </div>`).join('');
          searchDD.classList.add('active');
        }
      }

      return results;
    }
    function selectSearch(sym) { document.getElementById('searchInput').value = ''; closeDD(); loadStock(sym); }
    function closeDD() { document.getElementById('searchDropdown').classList.remove('active'); }

    // Load stock
    async function loadStock(sym) {
      sym = sym.toUpperCase().trim(); S.sym = sym;
      document.getElementById('tab-stock').style.display = 'flex';
      document.getElementById('stockTabLabel').textContent = sym;
      document.getElementById('welcomeState').style.display = 'none';
      document.getElementById('stockDetail').style.display = 'block';
      switchPage('stock'); updateWishlistButton(); renderWishlist();
      renderAlertCard();
      try {
        const [qr, pr, mr] = await Promise.allSettled([fetchQ(sym), fetchP(sym), fetchM(sym)]);
        if (qr.status === 'fulfilled' && qr.value?.c) {
          const qData = qr.value;
          S.quote = qData;
          if (qData.symbol && qData.symbol !== sym) {
            S.sym = qData.symbol;
            document.getElementById('stockTabLabel').textContent = S.sym;
          }

          // Fill any missing fundamental metrics from Finnhub metric API
          if (mr.status === 'fulfilled' && mr.value?.metric) {
            const m = mr.value.metric;
            if (qData.trailingPE == null && (m.peTTM || m.peNormalizedAnnual || m.peExclExtraTTM)) qData.trailingPE = m.peTTM || m.peNormalizedAnnual || m.peExclExtraTTM;
            if (qData.forwardPE == null && (m.forwardPE || m.peNormalizedAnnual)) qData.forwardPE = m.forwardPE || m.peNormalizedAnnual;
            if (qData.epsTrailingTwelveMonths == null && (m.epsTTM || m.epsNormalizedAnnual)) qData.epsTrailingTwelveMonths = m.epsTTM || m.epsNormalizedAnnual;
            if (qData.beta == null && m.beta) qData.beta = m.beta;
            if (qData.dividendYield == null && (m.dividendYieldIndicatedAnnual || m.dividendYield5Y)) qData.dividendYield = m.dividendYieldIndicatedAnnual || m.dividendYield5Y;
            if (qData.priceToBook == null && (m.pbTTM || m.pbAnnual || m.pbQuarterly)) qData.priceToBook = m.pbTTM || m.pbAnnual || m.pbQuarterly;
            if (qData.fiftyTwoWeekHigh == null && m['52WeekHigh']) qData.fiftyTwoWeekHigh = m['52WeekHigh'];
            if (qData.fiftyTwoWeekLow == null && m['52WeekLow']) qData.fiftyTwoWeekLow = m['52WeekLow'];
            if (qData.avgVolume == null && (m['3MonthAverageTradingVolume'] || m['10DayAverageTradingVolume'])) {
              qData.avgVolume = (m['3MonthAverageTradingVolume'] || m['10DayAverageTradingVolume']) * 1e6;
            }
            if (qData.v == null && m['10DayAverageTradingVolume']) {
              qData.v = m['10DayAverageTradingVolume'] * 1e6;
            }
          }

          renderQuote(qData);
          setChartRange('1D'); // Load chart data
          const isThai = qData.isThai || S.sym.endsWith('.BK') || qData.currency === 'THB';
          const prof = {
            ticker: S.sym,
            name: qData.name || (pr.status === 'fulfilled' && pr.value?.name ? pr.value.name : S.sym),
            exchange: qData.exchange || (isThai ? 'SET' : (pr.status === 'fulfilled' ? pr.value?.exchange : 'US')),
            finnhubIndustry: isThai ? 'Thai Market' : (pr.status === 'fulfilled' ? pr.value?.finnhubIndustry : '—'),
            country: isThai ? 'Thailand' : (pr.status === 'fulfilled' ? pr.value?.country : 'USA'),
            marketCapitalization: qData.marketCap ? qData.marketCap / 1e6 : (pr.status === 'fulfilled' ? pr.value?.marketCapitalization : null),
            logo: pr.status === 'fulfilled' ? pr.value?.logo : null,
            weburl: pr.status === 'fulfilled' ? pr.value?.weburl : null,
            ipo: pr.status === 'fulfilled' ? pr.value?.ipo : null,
            description: pr.status === 'fulfilled' ? pr.value?.description : null,
            isThai
          };
          S.profile = prof;
          renderProfile(prof);
          renderValuation(qData);
          calcAndRenderTechnicals(qData);
        } else {
          showToast('No quote for ' + sym, 'error');
          if (pr.status === 'fulfilled' && pr.value?.name) { S.profile = pr.value; renderProfile(pr.value); }
          else {
            document.getElementById('stockSymbol').textContent = sym; document.getElementById('stockCompanyName').textContent = ''; document.getElementById('stockExchange').textContent = ''; document.getElementById('stockLogo').innerHTML = '<svg viewBox="0 0 24 24"><path d="M3.5 18.49l6-6.01 4 4L22 6.92l-1.41-1.41-7.09 7.97-4-4L2 16.99z"/></svg>'; document.getElementById('infoIndustry').textContent = '—'; document.getElementById('infoCountry').textContent = '—'; document.getElementById('infoMarketCap').textContent = '—';
          }
        }
        updateLastRefresh();
      } catch (e) { showToast(e.message, 'error'); }
    }

    function renderProfile(p) {
      document.getElementById('stockSymbol').textContent = p.ticker || S.sym;
      document.getElementById('stockCompanyName').textContent = p.name || '';
      document.getElementById('stockExchange').textContent = p.exchange || '';
      document.getElementById('infoIndustry').textContent = p.finnhubIndustry || '—';
      document.getElementById('infoCountry').textContent = p.country || '—';
      document.getElementById('infoMarketCap').textContent = p.marketCapitalization ? fmtCap(p.marketCapitalization) : '—';
      const webEl = document.getElementById('infoWebsite');
      if (webEl) {
        webEl.innerHTML = p.weburl ? `<a href="${p.weburl}" target="_blank" rel="noopener">${p.weburl.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '')} ↗</a>` : '—';
      }
      const ipoEl = document.getElementById('infoIpoDate');
      if (ipoEl) ipoEl.textContent = p.ipo || '—';
      const descEl = document.getElementById('infoDescription');
      if (descEl) {
        if (p.description) {
          descEl.textContent = p.description;
          descEl.style.display = '-webkit-box';
        } else {
          descEl.style.display = 'none';
        }
      }
      const lw = document.getElementById('stockLogo');
      lw.innerHTML = p.logo ? `<img src="${p.logo}" alt="${esc(p.name)}" onerror="this.parentElement.innerHTML='<svg viewBox=\\'0 0 24 24\\'><path d=\\'M3.5 18.49l6-6.01 4 4L22 6.92l-1.41-1.41-7.09 7.97-4-4L2 16.99z\\'/></svg>'" />` : '<svg viewBox="0 0 24 24"><path d="M3.5 18.49l6-6.01 4 4L22 6.92l-1.41-1.41-7.09 7.97-4-4L2 16.99z"/></svg>';
    }

    function renderQuote(q) {
      const cs = getCurSym(S.sym, q);
      const l = I18N[S.lang] || I18N.en;
      const session = q.isThai ? getSETSession() : getUSSession();

      // Determine the price to display — prefer extended-hours when applicable
      let displayPrice = q.c;
      let displayChange = q.d;
      let displayChangePct = q.dp;
      let extHoursType = null; // 'pre' | 'post' | null

      if (!q.isThai) {
        if ((session === 'pre-market' || q.marketState === 'PRE') && q.preMarketPrice) {
          displayPrice = q.preMarketPrice;
          displayChange = q.preMarketChange ?? (q.preMarketPrice - q.c);
          displayChangePct = q.preMarketChangePercent ?? (q.c ? displayChange / q.c * 100 : 0);
          extHoursType = 'pre';
        } else if ((session === 'post-market' || q.marketState === 'POST') && q.postMarketPrice) {
          displayPrice = q.postMarketPrice;
          displayChange = q.postMarketChange ?? (q.postMarketPrice - q.c);
          displayChangePct = q.postMarketChangePercent ?? (q.c ? displayChange / q.c * 100 : 0);
          extHoursType = 'post';
        }
      }

      const up = displayChange > 0, dn = displayChange < 0, dir = up ? 'up' : dn ? 'down' : 'flat';

      document.getElementById('priceMain').textContent = cs + fmtNum(displayPrice);
      document.getElementById('priceMain').style.color = up ? 'var(--green)' : dn ? 'var(--red)' : 'var(--text-primary)';
      document.getElementById('priceChange').className = 'price-change ' + dir;
      document.getElementById('priceArrow').textContent = up ? '▲' : dn ? '▼' : '—';
      document.getElementById('priceChangeVal').textContent = (up ? '+' : dn ? '-' : '') + cs + Math.abs(displayChange).toFixed(2);
      document.getElementById('priceChangePct').textContent = '(' + (displayChangePct >= 0 ? '+' : '') + displayChangePct.toFixed(2) + '%)';

      // Extended-hours reference: show regular close price as context
      const extRef = document.getElementById('extHoursRef');
      if (extRef) {
        if (extHoursType && q.c) {
          const badgeLabel = extHoursType === 'pre' ? (l.marketPre || 'Pre-Market') : (l.marketAfter || 'After Hours');
          const badgeCls = extHoursType === 'pre' ? 'pre' : 'post';
          extRef.style.display = 'flex';
          extRef.innerHTML = `<span class="ext-hours-badge ${badgeCls}">${badgeLabel}</span><span>${l.atClose || 'At close:'} ${cs}${fmtNum(q.c)}</span>`;
        } else {
          extRef.style.display = 'none';
        }
      }

      // Session label
      const sm = { regular: l.marketRealtime, 'post-market': l.marketAfter, 'pre-market': l.marketPre, closed: l.marketAtClose };
      document.getElementById('priceSessionLabel').textContent = sm[session] || l.marketAtClose;

      // Stats 8
      document.getElementById('statOpen').textContent = q.o ? cs + fmtNum(q.o) : '—';
      document.getElementById('statHigh').textContent = q.h ? cs + fmtNum(q.h) : '—';
      document.getElementById('statLow').textContent = q.l ? cs + fmtNum(q.l) : '—';
      document.getElementById('statPrevClose').textContent = q.pc ? cs + fmtNum(q.pc) : '—';
      document.getElementById('statVolume').textContent = fmtVol(q.v);
      document.getElementById('statAvgVolume').textContent = fmtVol(q.avgVolume);
      document.getElementById('stat52High').textContent = q.fiftyTwoWeekHigh ? cs + fmtNum(q.fiftyTwoWeekHigh) : '—';
      document.getElementById('stat52Low').textContent = q.fiftyTwoWeekLow ? cs + fmtNum(q.fiftyTwoWeekLow) : '—';

      renderValuation(q);
    }

    async function refreshCurrentQuote() {
      if (!S.sym) return;
      try {
        const q = await fetchQ(S.sym);
        if (q && q.c) {
          S.quote = q;
          renderQuote(q);
          if (currentChartRange === '1D') {
            const time = (q.t || Math.floor(getRealNowMs() / 1000)) + (7 * 3600);
            if (time >= lastChartTime) {
              try {
                if (areaSeries) areaSeries.update({ time: time, value: q.c });
                if (candleSeries) {
                  candleSeries.update({
                    time: time,
                    open: Number(q.o ?? q.c),
                    high: Number(q.h ?? q.c),
                    low: Number(q.l ?? q.c),
                    close: Number(q.c)
                  });
                }
                if (volumeSeries && q.v) {
                  const isUp = (q.c >= (q.o ?? q.pc ?? q.c));
                  volumeSeries.update({
                    time: time,
                    value: Number(q.v),
                    color: isUp ? 'rgba(16, 185, 129, 0.45)' : 'rgba(239, 68, 68, 0.45)'
                  });
                }
                lastChartTime = time;
              } catch (e) { }
            }
          }
        }
      } catch { }
    }

    let stockChart = null;
    let areaSeries = null;
    let candleSeries = null;
    let volumeSeries = null;
    let sma20Series = null;
    let sma50Series = null;
    let sma200Series = null;
    let pivotPriceLines = [];
    let currentChartRange = '1D';
    let currentChartType = localStorage.getItem('stockpulse_chart_type') || 'area';
    let activeIndicators = (() => {
      try {
        const saved = JSON.parse(localStorage.getItem('stockpulse_chart_indicators') || '{}');
        return Object.assign({ vol: true, sma20: false, sma50: false, sma200: false, pivot: false }, saved);
      } catch {
        return { vol: true, sma20: false, sma50: false, sma200: false, pivot: false };
      }
    })();
    let lastChartTime = 0;
    const chartParams = {
      '1D': { interval: '2m', range: '1d' },
      '1W': { interval: '15m', range: '5d' },
      '1M': { interval: '1d', range: '1mo' },
      '6M': { interval: '1d', range: '6mo' },
      'YTD': { interval: '1d', range: 'ytd' },
      '1Y': { interval: '1d', range: '1y' },
      '5Y': { interval: '1wk', range: '5y' }
    };

    function isIndicatorActive(name) {
      return !!activeIndicators[name];
    }

    function toggleIndicator(name) {
      activeIndicators[name] = !activeIndicators[name];
      localStorage.setItem('stockpulse_chart_indicators', JSON.stringify(activeIndicators));
      updateIndicatorUI();
      applyIndicatorVisibility();
    }

    function updateIndicatorUI() {
      ['vol', 'sma20', 'sma50', 'sma200', 'pivot'].forEach(name => {
        const btn = document.getElementById(`btnInd${name.charAt(0).toUpperCase() + name.slice(1)}`);
        if (btn) btn.classList.toggle('active', !!activeIndicators[name]);
      });
    }

    function applyIndicatorVisibility() {
      if (volumeSeries) volumeSeries.applyOptions({ visible: isIndicatorActive('vol') });
      if (sma20Series) sma20Series.applyOptions({ visible: isIndicatorActive('sma20') });
      if (sma50Series) sma50Series.applyOptions({ visible: isIndicatorActive('sma50') });
      if (sma200Series) sma200Series.applyOptions({ visible: isIndicatorActive('sma200') });
      renderPivotPriceLines();
    }

    function calculateSMA(data, count) {
      const result = [];
      for (let i = 0; i < data.length; i++) {
        if (i < count - 1) continue;
        let sum = 0;
        for (let j = 0; j < count; j++) {
          sum += data[i - j].close;
        }
        result.push({ time: data[i].time, value: sum / count });
      }
      return result;
    }

    function clearPivotPriceLines() {
      if (areaSeries) {
        pivotPriceLines.forEach(l => {
          try { areaSeries.removePriceLine(l); } catch (e) { }
        });
      }
      if (candleSeries) {
        pivotPriceLines.forEach(l => {
          try { candleSeries.removePriceLine(l); } catch (e) { }
        });
      }
      pivotPriceLines = [];
    }

    function renderPivotPriceLines() {
      clearPivotPriceLines();
      if (!isIndicatorActive('pivot') || !S.quote) return;
      const q = S.quote;
      const targetSeries = currentChartType === 'candle' ? candleSeries : areaSeries;
      if (!targetSeries) return;

      const high = q.prevHigh || q.h || q.pc || q.c;
      const low = q.prevLow || q.l || q.pc || q.c;
      const prevClose = q.pc || q.c;
      if (!high || !low || !prevClose) return;

      const P = (high + low + prevClose) / 3;
      const diffHL = high - low;
      const R1 = (2 * P) - low;
      const R2 = P + diffHL;
      const R3 = high + 2 * (P - low);
      const S1 = (2 * P) - high;
      const S2 = P - diffHL;
      const S3 = low - 2 * (high - P);

      const pivotConfigs = [
        { price: R3, title: 'R3', color: '#ef4444' },
        { price: R2, title: 'R2', color: '#f87171' },
        { price: R1, title: 'R1', color: '#fca5a5' },
        { price: P,  title: 'P',  color: '#a78bfa' },
        { price: S1, title: 'S1', color: '#6ee7b7' },
        { price: S2, title: 'S2', color: '#34d399' },
        { price: S3, title: 'S3', color: '#10b981' },
      ];

      pivotConfigs.forEach(cfg => {
        try {
          const line = targetSeries.createPriceLine({
            price: Number(cfg.price.toFixed(2)),
            color: cfg.color,
            lineWidth: 1,
            lineStyle: LightweightCharts.LineStyle.Dashed,
            axisLabelVisible: true,
            title: cfg.title,
          });
          pivotPriceLines.push(line);
        } catch (e) { }
      });
    }

    function initChart() {
      if (stockChart) return;
      const container = document.getElementById('stockChartContainer');
      if (!window.LightweightCharts || !container) return;
      stockChart = LightweightCharts.createChart(container, {
        autoSize: true,
        height: 320,
        layout: {
          background: { color: 'transparent' },
          textColor: '#9898b0',
          fontFamily: 'Inter, sans-serif',
          fontSize: 11
        },
        grid: {
          vertLines: { color: 'rgba(42, 42, 58, 0.4)' },
          horzLines: { color: 'rgba(42, 42, 58, 0.4)' }
        },
        rightPriceScale: {
          borderVisible: false,
          scaleMargins: { top: 0.08, bottom: 0.22 }
        },
        timeScale: {
          borderVisible: false,
          timeVisible: true,
          secondsVisible: false
        },
        crosshair: {
          mode: LightweightCharts.CrosshairMode.Normal,
          vertLine: { color: 'rgba(124, 58, 237, 0.5)', width: 1, style: 3 },
          horzLine: { color: 'rgba(124, 58, 237, 0.5)', width: 1, style: 3 }
        }
      });

      // Volume Series (Overlay at bottom 22%)
      volumeSeries = stockChart.addHistogramSeries({
        priceFormat: { type: 'volume' },
        priceScaleId: 'volume',
        priceLineVisible: false,
        lastValueVisible: false,
        visible: isIndicatorActive('vol')
      });
      stockChart.priceScale('volume').applyOptions({
        scaleMargins: {
          top: 0.78,
          bottom: 0,
        },
      });

      // Area Series
      areaSeries = stockChart.addAreaSeries({
        lineColor: '#7c3aed',
        topColor: 'rgba(124, 58, 237, 0.4)',
        bottomColor: 'rgba(124, 58, 237, 0.0)',
        lineWidth: 2,
        priceFormat: { type: 'price', precision: 2, minMove: 0.01 },
        visible: currentChartType === 'area'
      });

      // Candlestick Series
      candleSeries = stockChart.addCandlestickSeries({
        upColor: '#10b981',
        downColor: '#ef4444',
        borderVisible: false,
        wickUpColor: '#10b981',
        wickDownColor: '#ef4444',
        priceFormat: { type: 'price', precision: 2, minMove: 0.01 },
        visible: currentChartType === 'candle'
      });

      // SMA Series
      sma20Series = stockChart.addLineSeries({
        color: '#f59e0b',
        lineWidth: 1.5,
        priceLineVisible: false,
        lastValueVisible: false,
        crosshairMarkerVisible: false,
        visible: isIndicatorActive('sma20'),
        priceFormat: { type: 'price', precision: 2, minMove: 0.01 }
      });

      sma50Series = stockChart.addLineSeries({
        color: '#3b82f6',
        lineWidth: 1.5,
        priceLineVisible: false,
        lastValueVisible: false,
        crosshairMarkerVisible: false,
        visible: isIndicatorActive('sma50'),
        priceFormat: { type: 'price', precision: 2, minMove: 0.01 }
      });

      sma200Series = stockChart.addLineSeries({
        color: '#ec4899',
        lineWidth: 1.5,
        priceLineVisible: false,
        lastValueVisible: false,
        crosshairMarkerVisible: false,
        visible: isIndicatorActive('sma200'),
        priceFormat: { type: 'price', precision: 2, minMove: 0.01 }
      });

      // Update button UI state
      document.getElementById('btnChartTypeArea')?.classList.toggle('active', currentChartType === 'area');
      document.getElementById('btnChartTypeCandle')?.classList.toggle('active', currentChartType === 'candle');
      updateIndicatorUI();

      window.addEventListener('resize', () => {
        if (stockChart && container) {
          stockChart.applyOptions({ width: container.clientWidth });
        }
      });
    }

    async function setChartType(type) {
      if (type !== 'area' && type !== 'candle') return;
      currentChartType = type;
      localStorage.setItem('stockpulse_chart_type', type);

      document.getElementById('btnChartTypeArea')?.classList.toggle('active', type === 'area');
      document.getElementById('btnChartTypeCandle')?.classList.toggle('active', type === 'candle');

      if (areaSeries) areaSeries.applyOptions({ visible: type === 'area' });
      if (candleSeries) candleSeries.applyOptions({ visible: type === 'candle' });

      renderPivotPriceLines();
      updateChartInfoTag();
      if (stockChart) stockChart.timeScale().fitContent();
    }

    function updateChartInfoTag() {
      const tag = document.getElementById('chartInfoTag');
      if (tag) {
        const typeLabel = currentChartType === 'candle' ? 'Candlestick' : 'Area Chart';
        tag.textContent = `${currentChartRange} • ${typeLabel}`;
      }
    }

    async function setChartRange(range) {
      if (!S.sym) return;
      currentChartRange = range;
      ['1D', '1W', '1M', '6M', 'YTD', '1Y', '5Y'].forEach(r => {
        const tab = document.getElementById(`chartTab${r}`);
        if (tab) tab.classList.toggle('active', r === range);
      });
      updateChartInfoTag();
      await renderChart();
    }

    async function fetchChartCandles(sym, interval, range) {
      sym = sym.trim().toUpperCase();

      const chartCacheKey = `${sym}_${interval}_${range}`;
      const cachedChart = CACHE.get('chart', chartCacheKey);
      if (cachedChart) return cachedChart;

      // 1. Try Vercel Serverless Function
      try {
        const res = await fetch(`/api/chart?symbol=${encodeURIComponent(sym)}&interval=${interval}&range=${range}`, { signal: AbortSignal.timeout(2000) });
        if (res.ok) {
          const json = await res.json();
          if (json?.data?.length) {
            CACHE.set('chart', chartCacheKey, json.data, 30000);
            return json.data;
          }
        }
      } catch (e) { }

      // 2. Client-side fallback via Yahoo Finance proxy
      try {
        const prePost = '&includePrePost=false';
        const yUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?interval=${interval}&range=${range}${prePost}`;
        const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(yUrl)}`;
        const res = await fetch(proxyUrl, { signal: AbortSignal.timeout(3000) });
        if (res.ok) {
          const d = await res.json();
          const result = d?.chart?.result?.[0];
          if (result?.timestamp?.length && result?.indicators?.quote?.[0]?.close) {
            const timestamps = result.timestamp;
            const closes = result.indicators.quote[0].close;
            const volumes = result.indicators.quote[0].volume || [];
            const parsed = timestamps.map((t, i) => {
              const c = closes[i];
              if (c == null) return null;
              return {
                time: t,
                close: c,
                open: result.indicators.quote[0].open?.[i] ?? c,
                high: result.indicators.quote[0].high?.[i] ?? c,
                low: result.indicators.quote[0].low?.[i] ?? c,
                volume: volumes[i] ?? 0
              };
            }).filter(Boolean);
            if (parsed.length > 0) {
              CACHE.set('chart', chartCacheKey, parsed, 30000);
              return parsed;
            }
          }
        }
      } catch (e) { }

      // 3. Fallback to Finnhub candle API for US stocks
      if (!sym.endsWith('.BK') && !sym.endsWith('.TH')) {
        try {
          const now = Math.floor(getRealNowMs() / 1000);
          let res = 'D', from = now - 40 * 86400;
          if (range === '1d') { res = '5'; from = now - 2 * 86400; }
          else if (range === '5d') { res = '60'; from = now - 8 * 86400; }
          else if (range === '1mo') { res = 'D'; from = now - 40 * 86400; }
          else if (range === '6mo') { res = 'D'; from = now - 185 * 86400; }
          else if (range === 'ytd') {
            const bkkYear = getBkkTimeParts().year;
            const startOfYear = Math.floor(new Date(`${bkkYear}-01-01T00:00:00+07:00`).getTime() / 1000);
            res = 'D';
            from = startOfYear;
          }
          else if (range === '1y') { res = 'D'; from = now - 370 * 86400; }
          else if (range === '5y') { res = 'W'; from = now - 5 * 365 * 86400; }
          const fhUrl = `https://finnhub.io/api/v1/stock/candle?symbol=${encodeURIComponent(sym)}&resolution=${res}&from=${from}&to=${now}&token=${S.apiKey || HARDCODED_API_KEY}`;
          const r = await fetch(fhUrl, { signal: AbortSignal.timeout(3000) });
          if (r.ok) {
            const d = await r.json();
            if (d?.s === 'ok' && Array.isArray(d.t)) {
              const parsed = d.t.map((t, i) => ({
                time: t,
                close: d.c[i],
                open: d.o[i],
                high: d.h[i],
                low: d.l[i],
                volume: d.v?.[i] ?? 0
              })).filter(x => x.close != null);
              if (parsed.length > 0) {
                CACHE.set('chart', chartCacheKey, parsed, 30000);
                return parsed;
              }
            }
          }
        } catch (e) { }
      }

      return null;
    }

    async function renderChart() {
      if (!S.sym) return;
      initChart();
      if (!stockChart) return;

      const loading = document.getElementById('chartLoading');
      if (loading) loading.style.display = 'flex';

      try {
        const param = chartParams[currentChartRange] || chartParams['1D'];
        const rawData = await fetchChartCandles(S.sym, param.interval, param.range);

        if (rawData && rawData.length > 0) {
          // Format and deduplicate timestamps for Lightweight Charts
          // Apply UTC+7 offset so the chart axis shows Thai time (e.g. 20:00-03:00)
          const TZ_OFFSET = 7 * 3600; // seconds
          const sorted = rawData
            .filter(d => d && d.time && typeof d.close === 'number' && !isNaN(d.close))
            .map(d => {
              const t = Number(d.time) + TZ_OFFSET;
              const open = Number(d.open ?? d.close);
              const high = Number(d.high ?? Math.max(open, d.close));
              const low = Number(d.low ?? Math.min(open, d.close));
              const close = Number(d.close);
              const volume = Number(d.volume || 0);
              return {
                time: t,
                open,
                high: Math.max(high, open, close),
                low: Math.min(low, open, close),
                close,
                value: close,
                volume
              };
            })
            .sort((a, b) => a.time - b.time);

          const unique = [];
          for (let i = 0; i < sorted.length; i++) {
            if (i === 0 || sorted[i].time > unique[unique.length - 1].time) {
              unique.push(sorted[i]);
            }
          }

          if (unique.length > 0) {
            lastChartTime = unique[unique.length - 1].time;

            // Dynamic theme matching stock price movement
            const firstVal = unique[0].value;
            const lastVal = unique[unique.length - 1].value;
            const isUp = lastVal >= firstVal;
            const lineColor = isUp ? '#10b981' : '#ef4444';
            const topColor = isUp ? 'rgba(16, 185, 129, 0.35)' : 'rgba(239, 68, 68, 0.35)';

            if (areaSeries) {
              areaSeries.applyOptions({
                lineColor: lineColor,
                topColor: topColor,
                bottomColor: 'rgba(0, 0, 0, 0.0)',
                visible: currentChartType === 'area'
              });
              areaSeries.setData(unique.map(d => ({ time: d.time, value: d.value })));
            }

            if (candleSeries) {
              candleSeries.applyOptions({
                visible: currentChartType === 'candle'
              });
              candleSeries.setData(unique.map(d => ({
                time: d.time,
                open: d.open,
                high: d.high,
                low: d.low,
                close: d.close
              })));
            }

            // Volume Sub-chart
            if (volumeSeries) {
              volumeSeries.applyOptions({
                visible: isIndicatorActive('vol')
              });
              volumeSeries.setData(unique.map(d => ({
                time: d.time,
                value: d.volume || 0,
                color: (d.close >= d.open) ? 'rgba(16, 185, 129, 0.45)' : 'rgba(239, 68, 68, 0.45)'
              })));
            }

            // SMAs
            if (sma20Series) {
              sma20Series.applyOptions({ visible: isIndicatorActive('sma20') });
              sma20Series.setData(calculateSMA(unique, 20));
            }
            if (sma50Series) {
              sma50Series.applyOptions({ visible: isIndicatorActive('sma50') });
              sma50Series.setData(calculateSMA(unique, 50));
            }
            if (sma200Series) {
              sma200Series.applyOptions({ visible: isIndicatorActive('sma200') });
              sma200Series.setData(calculateSMA(unique, 200));
            }

            // Pivot S/R Lines
            renderPivotPriceLines();

            const showTime = currentChartRange === '1D' || currentChartRange === '1W';
            stockChart.applyOptions({
              timeScale: {
                timeVisible: showTime,
                secondsVisible: false
              }
            });

            stockChart.timeScale().fitContent();
          } else {
            if (areaSeries) areaSeries.setData([]);
            if (candleSeries) candleSeries.setData([]);
            if (volumeSeries) volumeSeries.setData([]);
            if (sma20Series) sma20Series.setData([]);
            if (sma50Series) sma50Series.setData([]);
            if (sma200Series) sma200Series.setData([]);
            clearPivotPriceLines();
          }
        } else {
          if (areaSeries) areaSeries.setData([]);
          if (candleSeries) candleSeries.setData([]);
          if (volumeSeries) volumeSeries.setData([]);
          if (sma20Series) sma20Series.setData([]);
          if (sma50Series) sma50Series.setData([]);
          if (sma200Series) sma200Series.setData([]);
          clearPivotPriceLines();
        }
      } catch (e) {
        console.error('Chart error', e);
        if (areaSeries) areaSeries.setData([]);
        if (candleSeries) candleSeries.setData([]);
        if (volumeSeries) volumeSeries.setData([]);
        if (sma20Series) sma20Series.setData([]);
        if (sma50Series) sma50Series.setData([]);
        if (sma200Series) sma200Series.setData([]);
        clearPivotPriceLines();
      } finally {
        if (loading) loading.style.display = 'none';
        updateChartInfoTag();
      }
    }

    async function refreshData() { if (!S.sym) return; const b = document.getElementById('btnRefresh'); b.classList.add('spinning'); try { await loadStock(S.sym); showToast('Refreshed', 'success'); } catch { showToast('Failed', 'error'); } setTimeout(() => b.classList.remove('spinning'), 800); }
    async function fullRefresh() { const b = document.getElementById('dashRefreshBtn'); b.disabled = true; b.querySelector('.i18n-lbl').textContent = '...'; try { await updateWishlistPrices(); if (S.sym) await refreshCurrentQuote(); await loadSectorData(); updateDashboard(); updateLastRefresh(); showToast('Refreshed', 'success'); } catch { showToast('Error', 'error'); } b.disabled = false; b.querySelector('.i18n-lbl').textContent = (I18N[S.lang] || I18N.en).refresh; }

    // Sectors
    async function loadSectorData() {
      await Promise.allSettled(SECTORS.map(async (s) => {
        try {
          const q = await fetchQ(s.etf);
          if (q && q.c) S.sectors[s.etf] = q;
        } catch (e) { }
      }));
      renderSectors();
    }
    function renderSectors() {
      document.getElementById('sectorsGrid').innerHTML = SECTORS.map(s => {
        const e = S.sectors[s.etf], p = e ? e.dp : null, cl = p === null ? 'loading' : p >= 0 ? 'up' : 'down', tx = p === null ? '—' : (p >= 0 ? '+' : '') + p.toFixed(2) + '%';
        const vis = s.tickers.slice(0, 4);
        return `<div class="sector-card ${s.css}"><div class="sector-top"><div class="sector-name">${esc(s.name)}</div><span class="sector-perf ${cl}">${tx}</span></div><div class="sector-tickers">${vis.map(t => `<span class="sector-ticker" onclick="loadStock('${t}');event.stopPropagation()">${t}</span>`).join('')}<span class="sector-ticker" style="opacity:.4;cursor:default">+${s.tickers.length - vis.length}</span></div></div>`;
      }).join('');
    }

