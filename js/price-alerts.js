    // ===== PRICE ALERTS — Supabase-backed (cross-device real-time sync) =====
    // NOTE: Run in Supabase SQL Editor once:
    // CREATE TABLE alerts (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), symbol text NOT NULL, direction text NOT NULL CHECK (direction IN ('above','below')), price numeric NOT NULL, name text, created_at timestamptz DEFAULT now(), UNIQUE(symbol, direction));
    // ALTER TABLE alerts ENABLE ROW LEVEL SECURITY;
    // CREATE POLICY "allow all" ON alerts FOR ALL USING (true) WITH CHECK (true);
    let _alertsCache = {}; // in-memory mirror; refreshed by Realtime + explicit load

    async function loadAlerts() {
      if (!SB) return _alertsCache;
      try {
        const { data } = await SB.from('alerts').select('*');
        const map = {};
        (data || []).forEach(r => {
          if (r.symbol === '__SYS_PREMARKET__') {
            const parts = (r.name || '').split('|');
            if (parts[0]) {
              localStorage.setItem('stockpulse_premarket_sent_date', parts[0]);
              if (parts[1]) localStorage.setItem('stockpulse_premarket_sent_time', parts[1]);
              updateSettingsPremarketStatus();
            }
            return;
          }
          if (r.symbol.startsWith('__')) return; // Ignore internal system records
          if (!map[r.symbol]) map[r.symbol] = {};
          map[r.symbol][r.direction] = { price: r.price, name: r.name };
        });
        _alertsCache = map;
      } catch (e) { console.warn('loadAlerts error:', e); }
      return _alertsCache;
    }

    function loadAlertsSync() { return _alertsCache; }

    async function setAlert(dir) {
      if (!S.sym) return;
      const inp = document.getElementById(dir === 'above' ? 'alertAboveInput' : 'alertBelowInput');
      const val = parseFloat(inp.value);
      if (!val || val <= 0) { inp.classList.add('error'); setTimeout(() => inp.classList.remove('error'), 1500); return; }
      const name = S.profile?.name || S.sym;
      if (SB) {
        const { error } = await SB.from('alerts')
          .upsert({ symbol: S.sym, direction: dir, price: val, name }, { onConflict: 'symbol,direction' });
        if (error) { showToast('Error saving alert: ' + error.message, 'error'); return; }
      }
      // Optimistic local update
      if (!_alertsCache[S.sym]) _alertsCache[S.sym] = {};
      _alertsCache[S.sym][dir] = { price: val, name };
      renderAlertCard();
      showToast(`Alert set: ${S.sym} ${dir === 'above' ? '▲' : '▼'} $${val.toFixed(2)}`, 'success');
      await checkAlerts();
    }

    async function clearAlert(dir) {
      if (!S.sym) return;
      if (SB) {
        await SB.from('alerts').delete().eq('symbol', S.sym).eq('direction', dir);
      }
      if (_alertsCache[S.sym]) {
        delete _alertsCache[S.sym][dir];
        if (!Object.keys(_alertsCache[S.sym]).length) delete _alertsCache[S.sym];
      }
      renderAlertCard();
      showToast('Alert cleared', 'success');
    }

    function renderAlertCard() {
      if (!S.sym) return;
      const alerts = loadAlertsSync();
      const a = alerts[S.sym] || {};
      const hasAbove = !!a.above, hasBelow = !!a.below;
      const aboveInp = document.getElementById('alertAboveInput');
      const belowInp = document.getElementById('alertBelowInput');
      const aboveClear = document.getElementById('alertAboveClear');
      const belowClear = document.getElementById('alertBelowClear');
      const tag = document.getElementById('alertActiveTag');
      aboveInp.value = hasAbove ? a.above.price : '';
      aboveInp.classList.toggle('has-value', hasAbove);
      belowInp.value = hasBelow ? a.below.price : '';
      belowInp.classList.toggle('has-value', hasBelow);
      aboveClear.style.display = hasAbove ? 'flex' : 'none';
      belowClear.style.display = hasBelow ? 'flex' : 'none';
      tag.style.display = (hasAbove || hasBelow) ? 'inline-flex' : 'none';
      renderAlertEmailNote();
      renderDashboardAlerts();
      // Quick-fill % shortcut buttons (desktop only)
      if (S.quote?.c) {
        const cur = S.quote.c;
        const pcts = [1, 2, 5, 10];
        const aqEl = document.getElementById('alertAboveQuick');
        const bqEl = document.getElementById('alertBelowQuick');
        if (aqEl) aqEl.innerHTML = pcts.map(p => {
          const t = (cur * (1 + p / 100)).toFixed(2);
          return `<button class="alert-qf-btn" onclick="document.getElementById('alertAboveInput').value='${t}';document.getElementById('alertAboveInput').classList.add('has-value')">+${p}%</button>`;
        }).join('');
        if (bqEl) bqEl.innerHTML = pcts.map(p => {
          const t = (cur * (1 - p / 100)).toFixed(2);
          return `<button class="alert-qf-btn" onclick="document.getElementById('alertBelowInput').value='${t}';document.getElementById('alertBelowInput').classList.add('has-value')">-${p}%</button>`;
        }).join('');
      }
    }

    function renderDashboardAlerts() {
      const container = document.getElementById('dashAlertsList');
      if (!container) return;
      const alerts = loadAlertsSync();
      const t = I18N[S.lang] || I18N.en;

      const entries = [];
      for (const sym of Object.keys(alerts)) {
        const a = alerts[sym];
        if (a.above) entries.push({ sym, name: a.above.name || sym, dir: 'above', price: a.above.price });
        if (a.below) entries.push({ sym, name: a.below.name || sym, dir: 'below', price: a.below.price });
      }

      if (!entries.length) {
        container.innerHTML = `<div class="dash-empty" style="padding:16px 20px;"><svg viewBox="0 0 24 24"><path d="M12 22c1.1 0 2-.9 2-2h-4c0 1.1.9 2 2 2zm6-6v-5c0-3.07-1.64-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C7.63 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2z"/></svg><span>${t.noActiveAlerts}</span></div>`;
        return;
      }

      container.innerHTML = `<div class="alerts-grid">` + entries.map(item => {
        const isAbove = item.dir === 'above';
        const badgeClass = isAbove ? 'above' : 'below';
        const arrow = isAbove ? '▲' : '▼';
        const label = isAbove ? 'ABOVE' : 'BELOW';
        const wlEntry = S.wl.find(w => w.symbol === item.sym);
        const currPrice = (S.sym === item.sym && S.quote?.c) ? S.quote.c : (wlEntry?._quote?.c || null);
        const cs = getCurSym(item.sym, wlEntry?._quote);
        const currPriceText = currPrice ? `${cs}${fmtNum(currPrice)}` : '—';

        return `
          <div class="alert-grid-item" onclick="loadStock('${esc(item.sym)}')">
            <div class="alert-item-left">
              <div class="alert-item-sym">${esc(item.sym)} ${item.sym.endsWith('.BK') ? '<span class="search-tag-th">SET</span>' : ''}</div>
              <div class="alert-item-name">${esc(item.name)}</div>
            </div>
            <div class="alert-item-mid">
              <span class="alert-pill-badge ${badgeClass}">${arrow} ${label} ${cs}${fmtNum(item.price)}</span>
              <div class="alert-item-cur">Cur: ${currPriceText}</div>
            </div>
            <button class="alert-item-del" onclick="event.stopPropagation(); removeAlertItem('${esc(item.sym)}', '${item.dir}')" title="Delete Alert">
              <svg viewBox="0 0 24 24"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>
            </button>
          </div>
        `;
      }).join('') + `</div>`;
    }

    async function removeAlertItem(sym, dir) {
      if (SB) {
        await SB.from('alerts').delete().eq('symbol', sym).eq('direction', dir);
      }
      if (_alertsCache[sym]) {
        delete _alertsCache[sym][dir];
        if (!Object.keys(_alertsCache[sym]).length) delete _alertsCache[sym];
      }
      renderDashboardAlerts();
      if (S.sym === sym) renderAlertCard();
      showToast(`Removed alert for ${sym}`, 'success');
    }

    function renderAlertEmailNote() {
      const t = I18N[S.lang] || I18N.en;
      const note = document.getElementById('alertEmailNoteText');
      if (!note) return;
      if (S.alertEmail) {
        note.innerHTML = `${t.alertSetEmail} <strong style="color:var(--text-primary)">${S.alertEmail}</strong>`;
      } else {
        note.innerHTML = `${t.alertSetEmail} — <a onclick="openSettings()">${t.alertNoEmail}</a>`;
      }
    }

    async function checkAlerts() {
      const alerts = loadAlertsSync();
      if (!Object.keys(alerts).length) return;
      let changed = false;
      for (const sym of Object.keys(alerts)) {
        let price = null;
        let name = alerts[sym].above?.name || alerts[sym].below?.name || sym;

        // 1. Use currently-loaded stock quote (most up-to-date)
        if (S.sym === sym && S.quote && S.quote.c) {
          price = S.quote.c;
          if (S.profile?.name) name = S.profile.name;
        }
        // 2. Use watchlist cached quote if it was recently updated (< 30s old)
        if (!price && S.wl) {
          const entry = S.wl.find(w => w.symbol === sym);
          if (entry?._quote?.c) { price = entry._quote.c; if (entry.name) name = entry.name; }
        }
        // 3. Bypass CACHE and fetch fresh price directly — critical for alert accuracy
        if (!price) {
          try {
            // Delete any cached quote so fetchQ fetches fresh
            CACHE.quote.delete(sym);
            const q = await fetchQ(sym);
            if (q && q.c) { price = q.c; if (q.name) name = q.name; }
          } catch (e) { console.warn('checkAlerts fetchQ failed for', sym, e); }
        }
        if (!price) continue;

        const a = alerts[sym];
        if (a.above && price >= a.above.price) {
          await sendAlertEmail(sym, name, 'above', a.above.price, price);
          if (SB) await SB.from('alerts').delete().eq('symbol', sym).eq('direction', 'above');
          if (_alertsCache[sym]) delete _alertsCache[sym].above;
          changed = true;
        }
        if (a.below && price <= a.below.price) {
          await sendAlertEmail(sym, name, 'below', a.below.price, price);
          if (SB) await SB.from('alerts').delete().eq('symbol', sym).eq('direction', 'below');
          if (_alertsCache[sym]) delete _alertsCache[sym].below;
          changed = true;
        }
        if (_alertsCache[sym] && !Object.keys(_alertsCache[sym]).length) delete _alertsCache[sym];
      }
      if (changed) { renderAlertCard(); renderDashboardAlerts(); }
    }

    // Utils
    function fmtNum(n) { return n == null ? '0.00' : Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
    function fmtCap(c) { return c >= 1e6 ? '$' + (c / 1e6).toFixed(2) + 'T' : c >= 1e3 ? '$' + (c / 1e3).toFixed(2) + 'B' : '$' + c.toFixed(0) + 'M'; }
    function esc(s) { return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
    function slp(ms) { return new Promise(r => setTimeout(r, ms)); }
    function showToast(m, t = 'success') { const c = document.getElementById('toastContainer'), el = document.createElement('div'); el.className = 'toast ' + t; const ic = t === 'success' ? '<svg class="toast-icon" viewBox="0 0 24 24"><path fill="#10b981" d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/></svg>' : '<svg class="toast-icon" viewBox="0 0 24 24"><path fill="#ef4444" d="M12 2C6.47 2 2 6.47 2 12s4.47 10 10 10 10-4.47 10-10S17.53 2 12 2zm5 13.59L15.59 17 12 13.41 8.41 17 7 15.59 10.59 12 7 8.41 8.41 7 12 10.59 15.59 7 17 8.41 13.41 12 17 15.59z"/></svg>'; el.innerHTML = ic + ' ' + m; c.appendChild(el); setTimeout(() => { el.style.opacity = '0'; el.style.transition = '.2s'; setTimeout(() => el.remove(), 200); }, 2500); }

