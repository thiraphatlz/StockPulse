    // ===== SUPABASE REALTIME ALERT SYNC =====
    function subscribeAlerts() {
      if (!SB) return;
      SB.channel('alerts-realtime')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'alerts' }, async () => {
          await loadAlerts();
          renderAlertCard();
          renderDashboardAlerts();
          updateAlertStats();
        })
        .subscribe();
    }

