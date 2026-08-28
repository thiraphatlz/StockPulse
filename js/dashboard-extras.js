    // ===== DASHBOARD EXTRAS =====
    function updateDashboardExtras() {
      renderTopMovers();
      renderPfSnapshot();
      updateAlertStats();
    }

    function renderTopMovers() {
      const wdq = S.wl.filter(s => s._quote);
      const container = document.getElementById('dashWatchlist');
      const existing = document.getElementById('dashMovers');
      if (!wdq.length || !container) { if (existing) existing.remove(); return; }
      const sorted = [...wdq].sort((a, b) => Math.abs(b._quote.dp) - Math.abs(a._quote.dp));
      const top = sorted.slice(0, 5);
      const html = `<div class="dash-movers">${top.map(s => {
        const d = s._quote.dp >= 0 ? 'up' : 'down';
        const pct = (s._quote.dp >= 0 ? '+' : '') + s._quote.dp.toFixed(2) + '%';
        return `<div class="mover-pill ${d}" onclick="loadStock('${esc(s.symbol)}')"><span class="mover-sym">${esc(s.symbol)}</span><span class="mover-pct">${pct}</span></div>`;
      }).join('')}</div>`;
      if (!existing) {
        const div = document.createElement('div');
        div.id = 'dashMovers'; div.innerHTML = html;
        container.appendChild(div);
      } else { existing.innerHTML = html; }
    }

    function renderPfSnapshot() {
      const section = document.getElementById('dashPfSnapshotSection');
      const snap = document.getElementById('dashPfSnapshot');
      if (!section || !snap) return;
      if (!PF.unlocked || !PF.positions || !PF.positions.length) { section.style.display = 'none'; return; }
      section.style.display = 'block';
      const rate = PF.usdThb || 33.5;
      let costUsd = 0, valUsd = 0;
      PF.positions.forEach(pos => {
        const wl = S.wl.find(w => w.symbol === pos.symbol);
        const curPrice = (S.sym === pos.symbol && S.quote?.c) ? S.quote.c : wl?._quote?.c;
        if (!curPrice) return;
        const isThai = pos.symbol.endsWith('.BK');
        const avgPrice = pos.avg_cost_usd ?? pos.avg_cost ?? 0;
        const invAmt = pos.invested_amount ?? (pos.shares * avgPrice);
        const invUsd = (pos.invested_currency === 'THB') ? invAmt / rate : invAmt;
        const valU = isThai ? (curPrice * pos.shares) / rate : curPrice * pos.shares;
        costUsd += invUsd; valUsd += valU;
      });
      if (!costUsd) { section.style.display = 'none'; return; }
      const pl = valUsd - costUsd;
      const pct = costUsd > 0 ? (pl / costUsd) * 100 : 0;
      const dir = pl >= 0 ? 'up' : 'down';
      const sign = pl >= 0 ? '+' : '';
      snap.innerHTML = `<div class="pf-snapshot-strip" onclick="openPortfolioPage()" style="cursor:pointer;">
        <div class="pf-snap-card">
          <div class="pf-snap-lbl">Total Invested</div>
          <div class="pf-snap-val">$${fmtNum(costUsd)}</div>
          <div class="pf-snap-sub">฿${Math.round(costUsd * rate).toLocaleString()}</div>
        </div>
        <div class="pf-snap-card">
          <div class="pf-snap-lbl">Market Value</div>
          <div class="pf-snap-val ${dir}">$${fmtNum(valUsd)}</div>
          <div class="pf-snap-sub">฿${Math.round(valUsd * rate).toLocaleString()}</div>
        </div>
        <div class="pf-snap-card">
          <div class="pf-snap-lbl">Unrealized P&amp;L</div>
          <div class="pf-snap-val ${dir}">${sign}$${fmtNum(Math.abs(pl))}</div>
          <div class="pf-snap-sub ${dir}">${sign}${pct.toFixed(2)}%</div>
        </div>
      </div>`;
    }

    function updateAlertStats() {
      const alerts = loadAlertsSync();
      const total = Object.values(alerts).flatMap(a => Object.keys(a)).length;
      const existing = document.getElementById('dashAlertStats');
      if (!total) { if (existing) existing.remove(); return; }
      let near = 0;
      Object.entries(alerts).forEach(([sym, a]) => {
        const wl = S.wl.find(w => w.symbol === sym);
        const cur = (S.sym === sym && S.quote?.c) ? S.quote.c : wl?._quote?.c;
        if (!cur) return;
        if (a.above && Math.abs(cur - a.above.price) / a.above.price < 0.02) near++;
        if (a.below && Math.abs(cur - a.below.price) / a.below.price < 0.02) near++;
      });
      const statsHtml = `<div class="dash-alert-stats">
        <div class="alert-stat-badge">🔔 ${total} active alert${total > 1 ? 's' : ''}</div>
        ${near ? `<div class="alert-stat-badge alert-near-badge">⚡ ${near} near trigger!</div>` : ''}
      </div>`;
      const container = document.getElementById('dashAlertsList');
      if (!container) return;
      if (!existing) {
        const div = document.createElement('div');
        div.id = 'dashAlertStats'; div.innerHTML = statsHtml;
        container.parentElement.insertBefore(div, container);
      } else { existing.innerHTML = statsHtml; }
    }
