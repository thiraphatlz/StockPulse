    // ===== PORTFOLIO & SUPABASE =====
    const SUPABASE_URL = 'https://pxxtyzphnbbxrogikotc.supabase.co';
    const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB4eHR5enBobmJieHJvZ2lrb3RjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY3Njg0NTQsImV4cCI6MjEwMjM0NDQ1NH0.w0tui-y9KFY-6qqZfM8ol2b3EuR3LP0sXZRjIYM6xVc';
    const PORTFOLIO_PIN = '111248';  // ← เปลี่ยน PIN ได้ที่นี่
    const MAX_PORTFOLIOS = 5;

    let SB = null; // Supabase client
    const PF = {
      unlocked: false,
      portfolios: [],
      activeId: null,
      positions: [],
      usdThb: null,
      usdThbTs: 0
    };

    function initSupabase() {
      try {
        SB = supabase.createClient(SUPABASE_URL, SUPABASE_ANON);
        loadWatchlistFromSupabase();
      } catch (e) { console.error('Supabase init error:', e); }
    }

    // --- PIN ---
    function openPortfolioPage() {
      if (PF.unlocked) {
        switchPage('portfolio');
        pfEnterPage();
        return;
      }
      const overlay = document.getElementById('pinOverlay');
      overlay.classList.add('active');
      const inp = document.getElementById('pinInput');
      inp.value = '';
      document.getElementById('pinError').textContent = '';
      setTimeout(() => inp.focus(), 100);
    }

    function closePinModal() {
      const overlay = document.getElementById('pinOverlay');
      if (overlay) overlay.classList.remove('active');
      const inp = document.getElementById('pinInput');
      if (inp) inp.value = '';
      const err = document.getElementById('pinError');
      if (err) err.textContent = '';
      // Ensure nav highlight goes back to current active page
      if (S.page === 'portfolio' && !PF.unlocked) {
        switchPage('dashboard');
      } else {
        switchPage(S.page || 'dashboard');
      }
    }

    function verifyPin() {
      const inp = document.getElementById('pinInput');
      const val = inp.value.trim();
      const t = I18N[S.lang] || I18N.en;
      if (val === PORTFOLIO_PIN) {
        document.getElementById('pinOverlay').classList.remove('active');
        PF.unlocked = true;
        switchPage('portfolio');
        pfEnterPage();
      } else {
        inp.classList.add('error');
        document.getElementById('pinError').textContent = t.pinIncorrect || 'Incorrect PIN. Please try again.';
        setTimeout(() => { inp.classList.remove('error'); inp.value = ''; inp.focus(); }, 1200);
      }
    }

    document.addEventListener('DOMContentLoaded', () => {
      const pinInput = document.getElementById('pinInput');
      if (pinInput) {
        pinInput.addEventListener('keydown', e => {
          if (e.key === 'Enter') verifyPin();
          if (e.key === 'Escape') closePinModal();
        });
      }
    });

    // --- Exchange Rate ---
    async function fetchUsdThb() {
      const now = getRealNowMs();
      if (PF.usdThb && now - PF.usdThbTs < 10 * 60 * 1000) return PF.usdThb; // cache 10 min
      try {
        const r = await fetch('https://open.er-api.com/v6/latest/USD');
        const dateHeader = r.headers.get('date');
        if (dateHeader) {
          const ms = Date.parse(dateHeader);
          if (ms && !isNaN(ms)) recordNetworkTime(ms);
        }
        const d = await r.json();
        if (d.rates && d.rates.THB) {
          PF.usdThb = d.rates.THB;
          PF.usdThbTs = now;
          const el = document.getElementById('pfUsdThbRate');
          if (el) el.textContent = PF.usdThb.toFixed(2);
          const te = document.getElementById('pfRateTime');
          if (te) te.textContent = 'Updated ' + getRealNow().toLocaleTimeString('th-TH', { timeZone: 'Asia/Bangkok', hour: '2-digit', minute: '2-digit', hour12: false }) + ' ICT';
          return PF.usdThb;
        }
      } catch (e) { console.error('Exchange rate fetch error:', e); }
      PF.usdThb = 33.5; // fallback
      const el = document.getElementById('pfUsdThbRate');
      if (el) el.textContent = PF.usdThb.toFixed(2) + ' (fallback)';
      return PF.usdThb;
    }

    // --- Portfolio CRUD ---
    async function pfEnterPage() {
      const t = I18N[S.lang] || I18N.en;
      document.getElementById('pfContent').innerHTML = `<div class="pf-loading"><div class="pf-spinner"></div>${t.pfLoading}</div>`;
      document.getElementById('pfSummary').style.display = 'none';
      document.getElementById('pfAddPositionBtn').style.display = 'none';
      await fetchUsdThb();
      await loadPortfolios();
    }

    async function loadPortfolios() {
      if (!SB) { showToast('Supabase not initialized', 'error'); return; }
      const { data, error } = await SB.from('portfolios').select('*').order('created_at');
      if (error) { showToast('Error loading portfolios: ' + error.message, 'error'); return; }
      PF.portfolios = data || [];
      if (!PF.activeId && PF.portfolios.length > 0) PF.activeId = PF.portfolios[0].id;
      renderPfTabs();
      if (PF.portfolios.length === 0) {
        const t2 = I18N[S.lang] || I18N.en;
        document.getElementById('pfContent').innerHTML = `<div class="pf-empty"><svg viewBox="0 0 24 24"><path d="M20 7H4c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V9c0-1.1-.9-2-2-2zm0 12H4V9h16v10zM12 3.5l-4 4h2.5V11h3V7.5H16l-4-4z"/></svg><p>${t2.pfNoPortfolio}</p></div>`;
        document.getElementById('pfSummary').style.display = 'none';
        document.getElementById('pfAddPositionBtn').style.display = 'none';
      } else {
        await loadPositions();
      }
    }

    async function createPortfolio() {
      if (PF.portfolios.length >= MAX_PORTFOLIOS) { showToast(`Max ${MAX_PORTFOLIOS} portfolios allowed`, 'error'); return; }
      const name = prompt(`Portfolio name (${PF.portfolios.length + 1}/${MAX_PORTFOLIOS}):`);
      if (!name || !name.trim()) return;
      const { data, error } = await SB.from('portfolios').insert({ name: name.trim() }).select().single();
      if (error) { showToast('Error: ' + error.message, 'error'); return; }
      PF.portfolios.push(data);
      PF.activeId = data.id;
      showToast('Portfolio created!', 'success');
      renderPfTabs();
      await loadPositions();
    }

    async function deletePortfolio(id) {
      const pf = PF.portfolios.find(p => p.id === id);
      if (!pf) return;
      if (!confirm(`Delete portfolio "${pf.name}"? All positions will be lost.`)) return;
      const { error } = await SB.from('portfolios').delete().eq('id', id);
      if (error) { showToast('Error: ' + error.message, 'error'); return; }
      PF.portfolios = PF.portfolios.filter(p => p.id !== id);
      PF.activeId = PF.portfolios.length > 0 ? PF.portfolios[0].id : null;
      showToast('Portfolio deleted', 'success');
      await loadPortfolios();
    }

    // --- Position CRUD ---
    async function loadPositions() {
      if (!PF.activeId) return;
      const t = I18N[S.lang] || I18N.en;
      document.getElementById('pfContent').innerHTML = `<div class="pf-loading"><div class="pf-spinner"></div>${t.pfLoadingPos}</div>`;
      const { data, error } = await SB.from('positions').select('*').eq('portfolio_id', PF.activeId).order('created_at');
      if (error) { showToast('Error loading positions: ' + error.message, 'error'); return; }
      PF.positions = data || [];
      await renderPortfolio();
    }

    function openPosModal() {
      if (!PF.activeId) { showToast('Please create a portfolio first', 'error'); return; }
      const t = I18N[S.lang] || I18N.en;
      document.getElementById('posModalOverlay').classList.add('active');
      const initialSym = S.sym || '';
      document.getElementById('posSymbol').value = initialSym;
      document.getElementById('posPricePerShare').value = '';
      document.getElementById('posAmount').value = '';
      document.getElementById('posPurchaseDate').value = getBkkDateKey();
      document.getElementById('posCalcResult').textContent = '';
      document.getElementById('posPricePreview').style.display = 'none';
      document.getElementById('posSymbolDD').classList.remove('active');

      const isThai = initialSym.endsWith('.BK');
      PF.posAmountCur = isThai ? 'THB' : 'USD';
      const btn = document.getElementById('posCurBtn');
      btn.textContent = PF.posAmountCur;
      btn.className = 'cur-toggle-btn ' + PF.posAmountCur.toLowerCase();

      const curText = isThai ? 'THB' : 'USD';
      const lblPrice = document.getElementById('posLabelPrice');
      if (lblPrice) lblPrice.textContent = S.lang === 'th' ? `ราคาหุ้นตอนซื้อ (${curText} / หุ้น)` : `Price When Purchased (${curText} / Share)`;

      // If stock open, prefill price
      if (initialSym && S.quote?.c) {
        document.getElementById('posPricePerShare').value = S.quote.c.toFixed(2);
        const cs = getCurSym(initialSym, S.quote);
        const prev = document.getElementById('posPricePreview');
        prev.style.display = 'inline-flex';
        prev.innerHTML = `<svg viewBox="0 0 24 24" style="width:11px;height:11px;fill:currentColor;"><path d="M3.5 18.49l6-6.01 4 4L22 6.92l-1.41-1.41-7.09 7.97-4-4L2 16.99z"/></svg> ${t.pfCurLoaded(cs + S.quote.c.toFixed(2))}`;
      } else if (initialSym) {
        posSelectSymbol(initialSym);
      }
      setTimeout(() => document.getElementById('posAmount').focus(), 100);
    }
    function closePosModal() {
      document.getElementById('posModalOverlay').classList.remove('active');
      document.getElementById('posSymbolDD').classList.remove('active');
    }

    // Symbol autocomplete
    let posSymTO = null;
    function posSymbolInput(val) {
      document.getElementById('posSymbol').value = val.toUpperCase();
      clearTimeout(posSymTO);
      const dd = document.getElementById('posSymbolDD');
      if (!val.trim()) { dd.classList.remove('active'); return; }
      posSymTO = setTimeout(async () => {
        const results = await searchSymbols(val);
        if (!results || !results.length) { dd.classList.remove('active'); return; }
        dd.classList.add('active');
        dd.innerHTML = results.slice(0, 6).map(r => `
          <div class="pos-sym-item" onclick="posSelectSymbol('${esc(r.symbol)}','${esc(r.description || '')}')">
            <span style="font-weight:700;">${esc(r.symbol)} ${r.isThai ? '<span class="search-tag-th">SET</span>' : ''}</span>
            <span class="pos-sym-name">${esc(r.description || '')}</span>
          </div>`).join('');
      }, 250);
    }
    function posSelectSymbol(sym, name) {
      const t = I18N[S.lang] || I18N.en;
      sym = sym.toUpperCase().trim();
      document.getElementById('posSymbol').value = sym;
      document.getElementById('posSymbolDD').classList.remove('active');

      const isThai = sym.endsWith('.BK');
      PF.posAmountCur = isThai ? 'THB' : 'USD';
      const btn = document.getElementById('posCurBtn');
      btn.textContent = PF.posAmountCur;
      btn.className = 'cur-toggle-btn ' + PF.posAmountCur.toLowerCase();

      const curText = isThai ? 'THB' : 'USD';
      const lblPrice = document.getElementById('posLabelPrice');
      if (lblPrice) lblPrice.textContent = S.lang === 'th' ? `ราคาหุ้นตอนซื้อ (${curText} / หุ้น)` : `Price When Purchased (${curText} / Share)`;

      // Fetch price for this symbol
      const prev = document.getElementById('posPricePreview');
      prev.style.display = 'inline-flex'; prev.textContent = t.pfCurFetch;
      fetchQ(sym).then(q => {
        if (q?.c) {
          document.getElementById('posPricePerShare').value = q.c.toFixed(2);
          const cs = getCurSym(sym, q);
          prev.innerHTML = `<svg viewBox="0 0 24 24" style="width:11px;height:11px;fill:currentColor;"><path d="M3.5 18.49l6-6.01 4 4L22 6.92l-1.41-1.41-7.09 7.97-4-4L2 16.99z"/></svg> ${t.pfCurLoaded(cs + q.c.toFixed(2))}`;
          posCalcShares();
        } else { prev.style.display = 'none'; }
      }).catch(() => { prev.style.display = 'none'; });
      document.getElementById('posAmount').focus();
    }

    function posToggleCurrency() {
      const btn = document.getElementById('posCurBtn');
      PF.posAmountCur = PF.posAmountCur === 'USD' ? 'THB' : 'USD';
      btn.textContent = PF.posAmountCur;
      btn.className = 'cur-toggle-btn ' + PF.posAmountCur.toLowerCase();
      document.getElementById('posAmount').placeholder = PF.posAmountCur === 'USD' ? '0.00 USD' : '0.00 ฿';
      posCalcShares();
    }

    function posCalcShares() {
      const t = I18N[S.lang] || I18N.en;
      const sym = document.getElementById('posSymbol').value.trim().toUpperCase();
      const isThai = sym.endsWith('.BK');
      const price = parseFloat(document.getElementById('posPricePerShare').value);
      const amount = parseFloat(document.getElementById('posAmount').value);
      const res = document.getElementById('posCalcResult');
      if (!price || !amount || price <= 0 || amount <= 0) { res.textContent = ''; return; }
      const rate = PF.usdThb || 33.5;

      let shares = 0;
      if (isThai) {
        const amountThb = PF.posAmountCur === 'USD' ? amount * rate : amount;
        shares = amountThb / price;
      } else {
        const amountUsd = PF.posAmountCur === 'THB' ? amount / rate : amount;
        shares = amountUsd / price;
      }
      res.textContent = t.pfCalcShares(shares.toFixed(4));
    }

    async function submitPosition() {
      const symbol = document.getElementById('posSymbol').value.trim().toUpperCase();
      const pricePerShare = parseFloat(document.getElementById('posPricePerShare').value);
      const amount = parseFloat(document.getElementById('posAmount').value);
      const purchaseDate = document.getElementById('posPurchaseDate').value || null;

      // Validation
      let valid = true;
      if (!symbol) { document.getElementById('posSymbol').classList.add('error'); valid = false; } else { document.getElementById('posSymbol').classList.remove('error'); }
      if (!pricePerShare || pricePerShare <= 0) { document.getElementById('posPricePerShare').classList.add('error'); valid = false; } else { document.getElementById('posPricePerShare').classList.remove('error'); }
      if (!amount || amount <= 0) { document.getElementById('posAmount').classList.add('error'); valid = false; } else { document.getElementById('posAmount').classList.remove('error'); }
      if (!valid) { showToast('Please fill all required fields', 'error'); return; }

      // Calculate shares from amount
      const rate = PF.usdThb || await fetchUsdThb();
      const isThai = symbol.endsWith('.BK');
      let shares = 0;
      if (isThai) {
        const amountThb = PF.posAmountCur === 'USD' ? amount * rate : amount;
        shares = amountThb / pricePerShare;
      } else {
        const amountUsd = PF.posAmountCur === 'THB' ? amount / rate : amount;
        shares = amountUsd / pricePerShare;
      }
      shares = parseFloat(shares.toFixed(6));

      // Check for existing positions with the same symbol in current portfolio
      const existingPositions = PF.positions.filter(p => p.symbol === symbol && p.portfolio_id === PF.activeId);
      if (existingPositions.length > 0) {
        // Show merge-or-separate dialog
        await showMergeDialog(symbol, shares, pricePerShare, amount, purchaseDate, existingPositions);
        return;
      }

      // No existing position — insert as new
      await insertNewPosition(symbol, shares, pricePerShare, amount, purchaseDate);
    }

    async function insertNewPosition(symbol, shares, pricePerShare, amount, purchaseDate) {
      const isThai = symbol.endsWith('.BK');
      const payload = {
        portfolio_id: PF.activeId,
        symbol,
        shares,
        avg_cost_usd: pricePerShare,
        invested_amount: amount,
        invested_currency: PF.posAmountCur,
        commission_usd: 0,
        purchase_date: purchaseDate,
        note: null
      };
      const { data, error } = await SB.from('positions').insert(payload).select().single();
      if (error) { showToast('Error: ' + error.message, 'error'); return; }
      PF.positions.push(data);
      closePosModal();
      showToast(`${symbol} added!`, 'success');
      await renderPortfolio();
    }

    function showMergeDialog(symbol, newShares, newPrice, newAmount, purchaseDate, existingPositions) {
      return new Promise((resolve) => {
        const t = I18N[S.lang] || I18N.en;
        const isTH = S.lang === 'th';

        // Calculate total existing shares and weighted avg cost
        let totalExShares = 0, totalExCost = 0;
        for (const p of existingPositions) {
          const avgCost = p.avg_cost ?? p.avg_cost_usd ?? 0;
          totalExShares += p.shares;
          totalExCost += p.shares * avgCost;
        }
        const mergedShares = parseFloat((totalExShares + newShares).toFixed(6));
        const mergedAvgCost = parseFloat(((totalExCost + newShares * newPrice) / mergedShares).toFixed(4));
        const isThai = symbol.endsWith('.BK');
        const cs = isThai ? '฿' : '$';

        const title = isTH ? `${symbol} มีอยู่แล้ว` : `${symbol} Already Exists`;
        const msgMerge = isTH
          ? `รวมกับ ${existingPositions.length > 1 ? existingPositions.length + ' positions' : 'position'} ที่มีอยู่\nหุ้นรวม: ${mergedShares.toLocaleString()} | ต้นทุนเฉลี่ยใหม่: ${cs}${mergedAvgCost.toFixed(4)}`
          : `Merge with existing ${existingPositions.length > 1 ? existingPositions.length + ' positions' : 'position'}\nTotal shares: ${mergedShares.toLocaleString()} | New avg cost: ${cs}${mergedAvgCost.toFixed(4)}`;
        const msgSep = isTH ? 'เพิ่มเป็น Position แยกใหม่' : 'Add as separate new position';
        const msgCancel = isTH ? 'ยกเลิก' : 'Cancel';

        // Build overlay
        const overlay = document.createElement('div');
        overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.7);z-index:9999;display:flex;align-items:center;justify-content:center;padding:20px;';
        overlay.innerHTML = `
          <div style="background:var(--bg-card);border:1px solid var(--border-primary);border-radius:16px;padding:24px;max-width:360px;width:100%;box-shadow:var(--shadow-lg);">
            <div style="display:flex;align-items:center;gap:10px;margin-bottom:16px;">
              <svg viewBox="0 0 24 24" style="width:22px;height:22px;fill:var(--amber);flex-shrink:0;"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/></svg>
              <span style="font-size:15px;font-weight:700;color:var(--text-primary);">${title}</span>
            </div>
            <p style="font-size:13px;color:var(--text-secondary);margin-bottom:20px;line-height:1.6;">${isTH ? `พบหุ้น <strong style="color:var(--accent-light);">${symbol}</strong> ในพอร์ตอยู่แล้ว ต้องการทำอะไร?` : `You already hold <strong style="color:var(--accent-light);">${symbol}</strong> in this portfolio. What would you like to do?`}</p>
            <button id="mergeDialogMerge" style="width:100%;background:var(--bg-elevated);border:1px solid var(--border-primary);border-radius:10px;padding:12px 14px;text-align:left;cursor:pointer;margin-bottom:8px;transition:border-color 0.2s;">
              <div style="font-size:13px;font-weight:600;color:var(--accent-light);margin-bottom:4px;">${isTH ? '🔗 รวม Position (เฉลี่ยต้นทุน)' : '🔗 Merge (Average Cost)'}</div>
              <div style="font-size:11.5px;color:var(--text-secondary);line-height:1.5;white-space:pre-line;">${msgMerge}</div>
            </button>
            <button id="mergeDialogSep" style="width:100%;background:var(--bg-elevated);border:1px solid var(--border-primary);border-radius:10px;padding:12px 14px;text-align:left;cursor:pointer;margin-bottom:16px;transition:border-color 0.2s;">
              <div style="font-size:13px;font-weight:600;color:var(--green);margin-bottom:4px;">${isTH ? '➕ เพิ่มแยกต่างหาก' : '➕ Add Separately'}</div>
              <div style="font-size:11.5px;color:var(--text-secondary);">${msgSep}</div>
            </button>
            <button id="mergeDialogCancel" style="width:100%;background:transparent;border:1px solid var(--border-subtle);border-radius:10px;padding:10px;color:var(--text-muted);font-size:13px;cursor:pointer;">${msgCancel}</button>
          </div>`;

        document.body.appendChild(overlay);

        // Hover effects
        ['mergeDialogMerge','mergeDialogSep'].forEach(id => {
          const btn = overlay.querySelector('#' + id);
          btn.addEventListener('mouseenter', () => btn.style.borderColor = 'var(--border-accent)');
          btn.addEventListener('mouseleave', () => btn.style.borderColor = 'var(--border-primary)');
        });

        async function cleanup() { overlay.remove(); resolve(); }

        overlay.querySelector('#mergeDialogMerge').onclick = async () => {
          overlay.remove();
          // Update all existing positions for this symbol with merged weighted avg
          try {
            // We update the first existing position with merged data, delete the rest
            const primary = existingPositions[0];
            const { error } = await SB.from('positions')
              .update({ shares: mergedShares, avg_cost_usd: mergedAvgCost })
              .eq('id', primary.id);
            if (error) { showToast('Error merging: ' + error.message, 'error'); resolve(); return; }
            // Delete other positions for the same symbol if >1 existing
            for (let i = 1; i < existingPositions.length; i++) {
              await SB.from('positions').delete().eq('id', existingPositions[i].id);
            }
            // Update local state
            const idx = PF.positions.findIndex(p => p.id === primary.id);
            if (idx !== -1) {
              PF.positions[idx].shares = mergedShares;
              PF.positions[idx].avg_cost_usd = mergedAvgCost;
              PF.positions[idx].avg_cost = mergedAvgCost;
            }
            // Remove other merged positions from local state
            for (let i = 1; i < existingPositions.length; i++) {
              PF.positions = PF.positions.filter(p => p.id !== existingPositions[i].id);
            }
            closePosModal();
            showToast(`${symbol} merged! Avg cost: ${cs}${mergedAvgCost.toFixed(4)}`, 'success');
            await renderPortfolio();
          } catch (e) { showToast('Merge error: ' + e.message, 'error'); }
          resolve();
        };

        overlay.querySelector('#mergeDialogSep').onclick = async () => {
          overlay.remove();
          await insertNewPosition(symbol, newShares, newPrice, newAmount, purchaseDate);
          resolve();
        };

        overlay.querySelector('#mergeDialogCancel').onclick = () => { overlay.remove(); resolve(); };
      });
    }

    async function deletePosition(id) {
      const pos = PF.positions.find(p => p.id === id);
      if (!confirm(`Remove ${pos?.symbol || 'this position'}?`)) return;
      const { error } = await SB.from('positions').delete().eq('id', id);
      if (error) { showToast('Error: ' + error.message, 'error'); return; }
      PF.positions = PF.positions.filter(p => p.id !== id);
      showToast('Position removed', 'success');
      await renderPortfolio();
    }

    // --- Render ---
    function renderPfTabs() {
      const bar = document.getElementById('pfTabsBar');
      let html = PF.portfolios.map(p => `
        <button class="pf-tab ${p.id === PF.activeId ? 'active' : ''}" onclick="pfSelectTab('${p.id}')">
          ${esc(p.name)}
          <span class="pf-tab-del" onclick="event.stopPropagation();deletePortfolio('${p.id}')">
            <svg viewBox="0 0 24 24"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>
          </span>
        </button>`).join('');
      if (PF.portfolios.length < MAX_PORTFOLIOS) {
        const tPf = I18N[S.lang] || I18N.en;
        html += `<button class="pf-tab pf-tab-add" onclick="createPortfolio()">
          <svg viewBox="0 0 24 24" style="width:12px;height:12px;fill:currentColor;"><path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/></svg>
          ${tPf.pfNewLabel}
        </button>`;
      }
      bar.innerHTML = html;
    }

    async function pfSelectTab(id) {
      PF.activeId = id;
      renderPfTabs();
      await loadPositions();
    }

    async function renderPortfolio() {
      const t = I18N[S.lang] || I18N.en;
      const rate = PF.usdThb || await fetchUsdThb();
      if (PF.positions.length === 0) {
        document.getElementById('pfSummary').style.display = 'none';
        document.getElementById('pfAddPositionBtn').style.display = 'flex';
        document.getElementById('pfContent').innerHTML = `<div class="pf-empty">
          <svg viewBox="0 0 24 24"><path d="M20 7H4c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V9c0-1.1-.9-2-2-2zm0 12H4V9h16v10zM12 3.5l-4 4h2.5V11h3V7.5H16l-4-4z"/></svg>
          <p>${t.pfNoPositions}</p>
        </div>`;
        return;
      }

      const symbols = [...new Set(PF.positions.map(p => p.symbol))];
      const priceMap = {};
      for (const sym of symbols) {
        try {
          if (S.sym === sym && S.quote?.c) { priceMap[sym] = S.quote.c; continue; }
          const wl = S.wl.find(w => w.symbol === sym);
          if (wl?._quote?.c) { priceMap[sym] = wl._quote.c; continue; }
          const q = await fetchQ(sym);
          if (q?.c) priceMap[sym] = q.c;
          await slp(80);
        } catch (e) { }
      }

      let costUsd = 0, valUsd = 0;
      let costThb = 0, valThb = 0;

      const rows = PF.positions.map(pos => {
        const isThai = pos.symbol.endsWith('.BK');
        const cs = isThai ? '฿' : '$';
        const curPrice = priceMap[pos.symbol] || null;
        const avgPrice = pos.avg_cost ?? pos.avg_cost_usd;

        const invCur = pos.invested_currency || (isThai ? 'THB' : 'USD');
        const invAmt = pos.invested_amount ?? (pos.shares * avgPrice);
        const invCs = invCur === 'THB' ? '฿' : '$';

        const valNative = curPrice ? curPrice * pos.shares : null;
        const valPosUsd = valNative != null ? (isThai ? valNative / rate : valNative) : null;
        const valPosThb = valNative != null ? (isThai ? valNative : valNative * rate) : null;

        const currentValInInvCur = invCur === 'THB' ? valPosThb : valPosUsd;

        let plUsd = null, plThb = null, plPct = null;

        if (invCur === 'USD') {
          costUsd += invAmt;
          if (valPosUsd != null) valUsd += valPosUsd;
          plUsd = valPosUsd != null ? valPosUsd - invAmt : null;
          plPct = (plUsd != null && invAmt > 0) ? (plUsd / invAmt) * 100 : null;
        } else {
          costThb += invAmt;
          if (valPosThb != null) valThb += valPosThb;
          plThb = valPosThb != null ? valPosThb - invAmt : null;
          plPct = (plThb != null && invAmt > 0) ? (plThb / invAmt) * 100 : null;
        }

        const dir = plPct == null ? '' : plPct >= 0 ? 'up' : 'down';
        const dirSign = plPct == null ? '' : plPct >= 0 ? '+' : '';

        return `<div class="pf-pos-card">
          <div class="pf-pos-header">
            <div class="pf-pos-sym-block">
              <div class="pf-sym" style="cursor:pointer" onclick="loadStock('${esc(pos.symbol)}')">${esc(pos.symbol)} ${isThai ? '<span class="search-tag-th">SET</span>' : ''}</div>
              ${pos.purchase_date ? `<span class="pf-note">${new Date(pos.purchase_date + 'T00:00:00+07:00').toLocaleDateString(S.lang === 'th' ? 'th-TH' : 'en-US', { timeZone: 'Asia/Bangkok', month: 'short', day: 'numeric', year: 'numeric' })}</span>` : ''}
            </div>
            <div class="pf-pos-right-header">
              <span class="pf-pos-pl-badge ${dir}">${plPct != null ? dirSign + plPct.toFixed(2) + '%' : '—'}</span>
              <button class="pf-del-btn" onclick="deletePosition('${pos.id}')" title="Remove"><svg viewBox="0 0 24 24"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg></button>
            </div>
          </div>
          <div class="pf-pos-stats">
            <div class="pf-pos-stat">
              <span class="pf-pos-stat-lbl">${t.pfShares || 'Shares'}</span>
              <span class="pf-pos-stat-val">${Number(pos.shares) % 1 === 0 ? pos.shares : Number(pos.shares).toFixed(4)}</span>
            </div>
            <div class="pf-pos-stat">
              <span class="pf-pos-stat-lbl">${t.pfAvgCost || 'Avg Cost'}</span>
              <span class="pf-pos-stat-val">${cs}${fmtNum(avgPrice)}</span>
            </div>
            <div class="pf-pos-stat">
              <span class="pf-pos-stat-lbl">${t.pfPrice || 'Current Price'}</span>
              <span class="pf-pos-stat-val">${curPrice ? cs + fmtNum(curPrice) : '<span style="color:var(--text-muted)">—</span>'}</span>
            </div>
            <div class="pf-pos-stat">
              <span class="pf-pos-stat-lbl">${t.pfCostBasis || 'Invested'}</span>
              <span class="pf-pos-stat-val">${invCs}${fmtNum(invAmt)}</span>
            </div>
            <div class="pf-pos-stat">
              <span class="pf-pos-stat-lbl">${t.pfMktValue || 'Market Value'}</span>
              <span class="pf-pos-stat-val">${currentValInInvCur != null ? invCs + fmtNum(currentValInInvCur) : '—'}</span>
            </div>
            <div class="pf-pos-stat">
              <span class="pf-pos-stat-lbl">${t.pfPL || 'P&L'}</span>
              <span class="pf-pos-stat-val ${dir}">${plUsd != null ? dirSign + (invCur === 'USD' ? '$' : '฿') + fmtNum(Math.abs(invCur === 'USD' ? plUsd : plThb)) : '—'}</span>
            </div>
          </div>
        </div>`;
      }).join('');

      const totalCostUsd = costUsd + (rate > 0 ? costThb / rate : 0);
      const totalValueUsd = valUsd + (rate > 0 ? valThb / rate : 0);
      const totalCostThb = costThb + (costUsd * rate);
      const totalValueThb = valThb + (valUsd * rate);
      const totalPlUsd = totalValueUsd - totalCostUsd;
      const totalPlThb = totalValueThb - totalCostThb;
      const totalPlPct = totalCostUsd > 0 ? (totalPlUsd / totalCostUsd) * 100 : 0;
      const sumDir = totalPlUsd >= 0 ? 'up' : 'down';
      const sumSign = totalPlUsd >= 0 ? '+' : '';

      document.getElementById('pfSummary').style.display = 'grid';
      document.getElementById('pfSummary').innerHTML = `
        <div class="pf-sum-card">
          <div class="pf-sum-lbl">${t.pfTotalCost}</div>
          <div class="pf-sum-val">$${fmtNum(totalCostUsd)}</div>
          <div class="pf-sum-sub">฿${Math.round(totalCostThb).toLocaleString()}</div>
        </div>
        <div class="pf-sum-card">
          <div class="pf-sum-lbl">${t.pfMktVal}</div>
          <div class="pf-sum-val">$${fmtNum(totalValueUsd)}</div>
          <div class="pf-sum-sub">฿${Math.round(totalValueThb).toLocaleString()}</div>
        </div>
        <div class="pf-sum-card">
          <div class="pf-sum-lbl">${t.pfPL}</div>
          <div class="pf-sum-val ${sumDir}">${sumSign}$${fmtNum(Math.abs(totalPlUsd))}</div>
          <div class="pf-sum-sub ${sumDir}">${sumSign}฿${Math.round(Math.abs(totalPlThb)).toLocaleString()}</div>
        </div>
        <div class="pf-sum-card">
          <div class="pf-sum-lbl">${t.pfReturn}</div>
          <div class="pf-sum-val ${sumDir}">${sumSign}${totalPlPct.toFixed(2)}%</div>
          <div class="pf-sum-sub">${t.pfPositions(PF.positions.length)}</div>
        </div>`;

      document.getElementById('pfAddPositionBtn').style.display = 'flex';
      document.getElementById('pfContent').innerHTML = `<div class="pf-pos-grid">${rows}</div>`;
    }

