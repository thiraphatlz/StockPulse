    // ===== PRE-MARKET SECTOR FLOW & TOP MOVERS REPORT =====
    function getPreMarketScheduleInfo() {
      const now = getRealNow();
      const dst = isUSDST(now);
      // Target time: 15 min before regular US market open
      // DST (EDT): US open 20:30 BKK -> Pre-Market Briefing at 20:15 BKK
      // Non-DST (EST): US open 21:30 BKK -> Pre-Market Briefing at 21:15 BKK
      const targetHourBkk = dst ? 20 : 21;
      const targetMinBkk = 15;
      const targetTotalMin = targetHourBkk * 60 + targetMinBkk; // e.g. 20*60+15 = 1215

      const bkk = getBkkTimeParts(now);
      const bkkHour = bkk.hour;
      const bkkMin = bkk.minute;
      const curTotalMin = bkkHour * 60 + bkkMin;

      const isWeekday = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'].includes(bkk.weekday);
      const targetDateKey = bkk.dateKey || getBkkDateKey(now);

      // Auto-trigger eligibility:
      // 1. Must be a weekday (Mon-Fri)
      // 2. Current time must be within the active pre-market window [targetTotalMin, targetTotalMin + 45] (e.g. 20:15 - 21:00 BKK)
      // This ensures opening the site late at night (e.g. 23:00 or next morning) will NOT blindly auto-send an obsolete email.
      const isTimeReached = isWeekday && (curTotalMin >= targetTotalMin);
      const isWithinActiveWindow = isWeekday && (curTotalMin >= targetTotalMin && curTotalMin <= (targetTotalMin + 45));

      return {
        isWeekday,
        bkkHour,
        bkkMin,
        dateKey: targetDateKey,
        targetDateKey,
        targetHourBkk,
        targetMinBkk,
        timeLabel: `${targetHourBkk}:${targetMinBkk < 10 ? '0' : ''}${targetMinBkk} น.`,
        isTimeReached,
        isEligibleTime: isWithinActiveWindow
      };
    }

    async function loadPreMarketSentStateFromSupabase() {
      if (!SB) return;
      try {
        const { data, error } = await SB.from('alerts').select('*').eq('symbol', '__SYS_PREMARKET__').maybeSingle();
        if (!error && data && data.name) {
          const parts = data.name.split('|');
          const sentDate = parts[0] || '';
          const sentTime = parts[1] || '';
          if (sentDate) {
            localStorage.setItem('stockpulse_premarket_sent_date', sentDate);
            if (sentTime) localStorage.setItem('stockpulse_premarket_sent_time', sentTime);
            updateSettingsPremarketStatus();
          }
        }
      } catch (e) {
        console.warn('[Premarket Sync Error]:', e);
      }
    }

    async function markPreMarketSentToSupabase(dateKey, timeStr) {
      localStorage.setItem('stockpulse_premarket_sent_date', dateKey);
      localStorage.setItem('stockpulse_premarket_sent_time', timeStr);
      updateSettingsPremarketStatus();
      if (SB) {
        try {
          await SB.from('alerts').upsert({
            symbol: '__SYS_PREMARKET__',
            direction: 'above',
            price: Date.now(),
            name: `${dateKey}|${timeStr}`
          }, { onConflict: 'symbol,direction' });
        } catch (e) {
          console.warn('[Supabase Premarket Save Error]:', e);
        }
      }
    }

    async function clearPreMarketSentFromSupabase() {
      localStorage.removeItem('stockpulse_premarket_sent_date');
      localStorage.removeItem('stockpulse_premarket_sent_time');
      updateSettingsPremarketStatus();
      if (SB) {
        try {
          await SB.from('alerts').delete().eq('symbol', '__SYS_PREMARKET__');
        } catch (e) {
          console.warn('[Supabase Premarket Clear Error]:', e);
        }
      }
    }

    function updateSettingsPremarketStatus() {
      const el = document.getElementById('settingsPremarketStatus');
      const titleEl = document.getElementById('settingsPremarketTitle');
      const sched = getPreMarketScheduleInfo();
      if (titleEl) {
        titleEl.textContent = `Pre-Market Briefing (${sched.timeLabel})`;
      }
      if (!el) return;

      const lastSent = localStorage.getItem('stockpulse_premarket_sent_date');
      const lastTime = localStorage.getItem('stockpulse_premarket_sent_time');

      if (!S.premarketAlert) {
        el.innerHTML = `<span style="color:var(--text-muted);">⚪ ปิดการใช้งาน</span>`;
      } else if (lastSent === sched.targetDateKey) {
        el.innerHTML = `<span style="color:var(--green);">🟢 ส่งแล้ววันนี้ (${lastTime || 'สำเร็จ'})</span> <a onclick="resetPreMarketBriefingSentToday()" style="color:var(--accent-light); cursor:pointer; text-decoration:underline; margin-left:6px;">รีเซ็ตเพื่อส่งใหม่</a>`;
      } else if (sched.isEligibleTime) {
        el.innerHTML = `<span style="color:var(--amber);">⚡ ถึงเวลาส่งแล้ว (${sched.timeLabel}) — พร้อมส่งอัตโนมัติ</span>`;
      } else {
        el.innerHTML = `<span style="color:var(--text-secondary);">⏰ กำหนดส่งรอบถัดไป: วันทำการ เวลา ${sched.timeLabel}</span>`;
      }
    }

    async function resetPreMarketBriefingSentToday() {
      await clearPreMarketSentFromSupabase();
      updateSettingsPremarketStatus();
      showToast('🔄 Reset pre-market status for today. Triggering send...', 'success');
      sendPreMarketBriefingEmail(true);
    }

    async function generatePreMarketReport() {
      // 1. Fetch Sector ETF Quotes in small batches (5 per batch)
      const sectorResults = [];
      const batchSize = 5;
      for (let i = 0; i < SECTORS.length; i += batchSize) {
        const chunk = SECTORS.slice(i, i + batchSize);
        const chunkRes = await Promise.allSettled(chunk.map(async s => {
          try {
            const q = await fetchQ(s.etf);
            return { ...s, quote: q };
          } catch (e) {
            return { ...s, quote: null };
          }
        }));
        chunkRes.forEach(r => {
          if (r.status === 'fulfilled') sectorResults.push(r.value);
        });
      }

      const validSectors = sectorResults
        .filter(r => r && r.quote && (r.quote.c || r.quote.preMarketPrice))
        .map(r => {
          const price = r.quote.preMarketPrice ?? r.quote.c ?? 0;
          const dp = r.quote.preMarketChangePercent ?? r.quote.dp ?? 0;
          return {
            id: r.id,
            name: r.name,
            etf: r.etf,
            price: Number(price),
            dp: Number(dp),
            tickers: r.tickers || []
          };
        })
        .sort((a, b) => b.dp - a.dp);

      if (!validSectors.length) return null;

      const leadingSector = validSectors[0];
      const laggingSector = validSectors[validSectors.length - 1];

      // 2. Fetch constituent stock prices for all sectors in controlled batches
      const detailedSectors = [];
      for (const sec of validSectors) {
        const tickerQuotes = [];
        for (let i = 0; i < sec.tickers.length; i += 4) {
          const chunk = sec.tickers.slice(i, i + 4);
          const chunkRes = await Promise.allSettled(chunk.map(async sym => {
            try {
              const q = await fetchQ(sym);
              return { symbol: sym, quote: q };
            } catch (e) {
              return { symbol: sym, quote: null };
            }
          }));
          chunkRes.forEach(r => {
            if (r.status === 'fulfilled' && r.value.quote && (r.value.quote.c || r.value.quote.preMarketPrice)) {
              const price = r.value.quote.preMarketPrice ?? r.value.quote.c ?? 0;
              const dp = r.value.quote.preMarketChangePercent ?? r.value.quote.dp ?? 0;
              tickerQuotes.push({
                symbol: r.value.symbol,
                price: Number(price),
                dp: Number(dp)
              });
            }
          });
        }

        const rankedTickers = tickerQuotes.sort((a, b) => b.dp - a.dp);
        const gainers = rankedTickers.filter(t => t.dp > 0).slice(0, 3);
        const losers = [...rankedTickers].reverse().filter(t => t.dp < 0).slice(0, 3);

        detailedSectors.push({
          ...sec,
          topGainers: gainers,
          topLosers: losers,
          allRanked: rankedTickers
        });
      }

      const now = getRealNow();
      const timeStr = now.toLocaleTimeString('th-TH', { timeZone: 'Asia/Bangkok', hour: '2-digit', minute: '2-digit', hour12: false }) + ' น. ICT';
      const dateStr = now.toLocaleDateString('th-TH', { timeZone: 'Asia/Bangkok', weekday: 'long', year: 'numeric', month: 'short', day: 'numeric' });

      // Plain Text Summary
      let textSummary = `🚀 [StockPulse] Pre-Market US Sector Flow Intelligence (${dateStr} • ${timeStr})\n\n`;
      textSummary += `🏆 #1 Sector ที่เงินไหลเข้ามากที่สุด: ${leadingSector.name} (${leadingSector.etf}) ${(leadingSector.dp >= 0 ? '+' : '')}${leadingSector.dp.toFixed(2)}%\n`;
      textSummary += `🔻 Sector ที่ปรับตัวลงมากที่สุด: ${laggingSector.name} (${laggingSector.etf}) ${(laggingSector.dp >= 0 ? '+' : '')}${laggingSector.dp.toFixed(2)}%\n\n`;
      textSummary += `📊 สรุปการจัดอันดับ Sector Flow ทั้งหมด:\n`;
      detailedSectors.forEach((s, idx) => {
        const sign = s.dp >= 0 ? '+' : '';
        textSummary += `${idx + 1}. ${s.name} (${s.etf}): ${sign}${s.dp.toFixed(2)}% | ราคา $${s.price.toFixed(2)}\n`;
      });

      textSummary += `\n🔥 Top 3 หุ้นเด่น (บวก/ลบ) ราย Sector:\n`;
      detailedSectors.forEach(s => {
        textSummary += `\n[ ${s.name} - ${s.etf} (${s.dp >= 0 ? '+' : ''}${s.dp.toFixed(2)}%) ]\n`;
        if (s.topGainers.length) {
          textSummary += `  🟢 Top Gainers: ` + s.topGainers.map(t => `${t.symbol} +${t.dp.toFixed(2)}% ($${t.price.toFixed(2)})`).join(', ') + '\n';
        }
        if (s.topLosers.length) {
          textSummary += `  🔴 Top Losers: ` + s.topLosers.map(t => `${t.symbol} ${t.dp.toFixed(2)}% ($${t.price.toFixed(2)})`).join(', ') + '\n';
        }
      });

      // HTML Email Table
      let sectorTableRows = detailedSectors.map((s, idx) => {
        const isUp = s.dp >= 0;
        const color = isUp ? '#10b981' : '#ef4444';
        const sign = isUp ? '+' : '';
        return `
          <tr style="border-bottom: 1px solid #2a2a3a;">
            <td style="padding: 8px 12px; font-weight: bold; color: #eaeaf0;">${idx + 1}. ${s.name} <span style="color:#9898b0; font-size:11px;">(${s.etf})</span></td>
            <td style="padding: 8px 12px; font-family: monospace; text-align: right; color: #eaeaf0;">$${s.price.toFixed(2)}</td>
            <td style="padding: 8px 12px; font-family: monospace; font-weight: bold; text-align: right; color: ${color};">${sign}${s.dp.toFixed(2)}%</td>
          </tr>`;
      }).join('');

      let topMoversHtml = detailedSectors.map(s => {
        const isUp = s.dp >= 0;
        const secColor = isUp ? '#10b981' : '#ef4444';

        let gainerBadges = s.topGainers.map(t => `
          <span style="display:inline-block; background:rgba(16,185,129,0.12); color:#10b981; border:1px solid rgba(16,185,129,0.3); border-radius:4px; padding:3px 8px; margin:2px; font-size:11px; font-family:monospace;">
            <strong>${t.symbol}</strong> +${t.dp.toFixed(2)}% <span style="color:#9898b0;">($${t.price.toFixed(2)})</span>
          </span>`).join('') || '<span style="color:#5a5a72; font-size:11px;">ไม่มีหุ้นบวก</span>';

        let loserBadges = s.topLosers.map(t => `
          <span style="display:inline-block; background:rgba(239,68,68,0.12); color:#ef4444; border:1px solid rgba(239,68,68,0.3); border-radius:4px; padding:3px 8px; margin:2px; font-size:11px; font-family:monospace;">
            <strong>${t.symbol}</strong> ${t.dp.toFixed(2)}% <span style="color:#9898b0;">($${t.price.toFixed(2)})</span>
          </span>`).join('') || '<span style="color:#5a5a72; font-size:11px;">ไม่มีหุ้นลบ</span>';

        return `
          <div style="background:#16161f; border:1px solid #2a2a3a; border-radius:8px; padding:12px; margin-bottom:10px;">
            <div style="display:flex; justify-content:space-between; margin-bottom:6px;">
              <span style="font-weight:bold; font-size:13px; color:#eaeaf0;">${s.name} (${s.etf})</span>
              <span style="font-weight:bold; font-family:monospace; color:${secColor};">${s.dp >= 0 ? '+' : ''}${s.dp.toFixed(2)}%</span>
            </div>
            <div style="margin-bottom:6px;">
              <div style="font-size:10px; color:#9898b0; text-transform:uppercase; margin-bottom:2px;">🟢 Top Gainers (บวกมากสุด)</div>
              <div>${gainerBadges}</div>
            </div>
            <div>
              <div style="font-size:10px; color:#9898b0; text-transform:uppercase; margin-bottom:2px;">🔴 Top Losers (ลบมากสุด)</div>
              <div>${loserBadges}</div>
            </div>
          </div>`;
      }).join('');

      return {
        leadingSector,
        laggingSector,
        detailedSectors,
        textSummary,
        sectorTableRows,
        topMoversHtml,
        dateStr,
        timeStr
      };
    }

    let _isSendingPreMarketBriefing = false;

    async function sendPreMarketBriefingEmail(isManual = false) {
      const email = S.alertEmail;
      if (!email) {
        showToast('⚠️ No alert email set (Go to Settings)', 'error');
        if (isManual) openSettings();
        return false;
      }

      if (_isSendingPreMarketBriefing) {
        showToast('Pre-Market Briefing is already being sent...', 'info');
        return false;
      }

      _isSendingPreMarketBriefing = true;
      showToast('📊 Gathering Pre-Market Sector Flow...', 'success');
      try {
        const report = await generatePreMarketReport();
        if (!report) {
          showToast('Failed to gather sector data', 'error');
          _isSendingPreMarketBriefing = false;
          return false;
        }

        const params = {
          to_email: email,
          report_date: report.dateStr + ' • ' + report.timeStr,
          leading_sector: `${report.leadingSector.name} (${report.leadingSector.etf})`,
          leading_sector_chg: (report.leadingSector.dp >= 0 ? '+' : '') + report.leadingSector.dp.toFixed(2) + '%',
          lagging_sector: `${report.laggingSector.name} (${report.laggingSector.etf})`,
          lagging_sector_chg: (report.laggingSector.dp >= 0 ? '+' : '') + report.laggingSector.dp.toFixed(2) + '%',
          sector_table_rows: report.sectorTableRows,
          top_movers_html: report.topMoversHtml,
          full_report_text: report.textSummary,
          timestamp: report.timeStr
        };

        const sched = getPreMarketScheduleInfo();
        const saveDateKey = sched.targetDateKey || getBkkDateKey();

        if (typeof emailjs !== 'undefined' && EMAILJS_PUBLIC_KEY && EMAILJS_PUBLIC_KEY !== 'YOUR_PUBLIC_KEY') {
          await emailjs.send(EMAILJS_SERVICE_ID, EMAILJS_PREMARKET_TEMPLATE_ID, params);
          await markPreMarketSentToSupabase(saveDateKey, report.timeStr);
          showToast(`🚀 Pre-Market Briefing sent to ${email}!`, 'success');
        } else {
          console.log('[Pre-Market Briefing Report]:', params);
          await markPreMarketSentToSupabase(saveDateKey, report.timeStr);
          showToast('🚀 Pre-Market Briefing generated! (EmailJS logged)', 'success');
        }
        _isSendingPreMarketBriefing = false;
        return true;
      } catch (err) {
        console.error('Pre-Market Briefing Error:', err);
        showToast('Error sending briefing: ' + (err.text || err.message || 'Network error'), 'error');
        _isSendingPreMarketBriefing = false;
        return false;
      }
    }

    async function checkAndSendDailyPreMarketBriefing(isManual = false) {
      if (!isManual && !S.premarketAlert) return;
      const sched = getPreMarketScheduleInfo();
      
      // Auto mode: Only trigger on weekdays within the active 20:15 pre-market window
      if (!isManual && (!sched.isWeekday || !sched.isEligibleTime)) return;

      // 1. Check local cache first
      const lastSent = localStorage.getItem('stockpulse_premarket_sent_date');
      if (!isManual && lastSent === sched.targetDateKey) {
        return; // Already sent today
      }

      // 2. Check Supabase shared record across all devices to prevent race conditions & duplicate sends
      if (!isManual && SB) {
        try {
          const { data } = await SB.from('alerts').select('*').eq('symbol', '__SYS_PREMARKET__').maybeSingle();
          if (data && data.name) {
            const parts = data.name.split('|');
            if (parts[0] === sched.targetDateKey) {
              localStorage.setItem('stockpulse_premarket_sent_date', parts[0]);
              if (parts[1]) localStorage.setItem('stockpulse_premarket_sent_time', parts[1]);
              updateSettingsPremarketStatus();
              return; // Already sent today on another device or via automated cron!
            }
          }
        } catch (e) { }
      }

      if (!S.alertEmail) {
        console.warn(`[Auto Scheduler] Pre-Market Briefing reached (${sched.timeLabel}) but no Alert Email is set.`);
        return;
      }

      if (_isSendingPreMarketBriefing) return;

      console.log(`[Auto Scheduler] Triggering Pre-Market Briefing (${sched.timeLabel}) for ${sched.targetDateKey}...`);
      await sendPreMarketBriefingEmail(isManual);
    }

