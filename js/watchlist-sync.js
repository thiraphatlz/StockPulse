    // ===== WATCHLIST + SUPABASE SYNC =====
    async function loadWatchlistFromSupabase() {
      if (!SB) return;
      try {
        const { data, error } = await SB.from('watchlist').select('symbol, name').order('created_at');
        if (error) { console.warn('WL Supabase load error:', error.message); return; }
        if (!data || !data.length) return;
        // Merge: add Supabase items not in current wl
        let changed = false;
        data.forEach(row => {
          if (!S.wl.find(w => w.symbol === row.symbol)) {
            S.wl.push({ symbol: row.symbol, name: row.name || row.symbol });
            changed = true;
          }
        });
        if (changed) {
          saveWl();
          renderWishlist();
          updateDashboard();
          updateWishlistPrices().then(updateDashboard);
        }
      } catch (e) { console.warn('WL Supabase error:', e); }
    }

    async function addWatchlistToSupabase(symbol, name) {
      if (!SB) return;
      try { await SB.from('watchlist').upsert({ symbol, name }, { onConflict: 'symbol' }); } catch (e) { }
    }

    async function removeWatchlistFromSupabase(symbol) {
      if (!SB) return;
      try { await SB.from('watchlist').delete().eq('symbol', symbol); } catch (e) { }
    }

