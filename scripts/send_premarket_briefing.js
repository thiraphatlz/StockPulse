/**
 * StockPulse - Automated Pre-Market Sector Flow Briefing
 * Runs standalone via Node.js / GitHub Actions / Serverless Cron
 */

const EMAILJS_PUBLIC_KEY = process.env.EMAILJS_PUBLIC_KEY || '8EBack4zwyOa1x49O';
const EMAILJS_SERVICE_ID = process.env.EMAILJS_SERVICE_ID || 'service_u55ha9b';
const EMAILJS_PREMARKET_TEMPLATE_ID = process.env.EMAILJS_PREMARKET_TEMPLATE_ID || 'template_2mgjigz';
const ALERT_EMAIL = process.env.ALERT_EMAIL || 'thiraphatlaohiao1@gmail.com';
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://pxxtyzphnbbxrogikotc.supabase.co';
const SUPABASE_ANON = process.env.SUPABASE_ANON || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB4eHR5enBobmJieHJvZ2lrb3RjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY3Njg0NTQsImV4cCI6MjEwMjM0NDQ1NH0.w0tui-y9KFY-6qqZfM8ol2b3EuR3LP0sXZRjIYM6xVc';

export async function checkPremarketSentInSupabase(dateKey) {
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/alerts?symbol=eq.__SYS_PREMARKET__&select=*&limit=1`, {
      headers: { apikey: SUPABASE_ANON, Authorization: `Bearer ${SUPABASE_ANON}` }
    });
    if (res.ok) {
      const rows = await res.json();
      if (rows && rows.length && rows[0].name) {
        const parts = rows[0].name.split('|');
        if (parts[0] === dateKey) return true;
      }
    }
  } catch (e) { }
  return false;
}

export async function syncPremarketSentToSupabase(dateKey, timeStr) {
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/alerts`, {
      method: 'POST',
      headers: {
        apikey: SUPABASE_ANON,
        Authorization: `Bearer ${SUPABASE_ANON}`,
        'Content-Type': 'application/json',
        'Prefer': 'resolution=merge-duplicates'
      },
      body: JSON.stringify({
        symbol: '__SYS_PREMARKET__',
        direction: 'above',
        price: Date.now(),
        name: `${dateKey}|${timeStr}`
      })
    });
    if (res.ok) {
      console.log(`[StockPulse] ✅ Synced pre-market sent state (${dateKey}) to Supabase.`);
    }
  } catch (e) {
    console.warn('[StockPulse] Supabase sync warning:', e.message);
  }
}

const SECTORS = [
  { id: 'tech', name: 'Technology', etf: 'XLK', tickers: ['AAPL', 'MSFT', 'NVDA', 'META', 'GOOGL', 'AVGO', 'AMD', 'INTC', 'ORCL', 'CRM'] },
  { id: 'finance', name: 'Financials', etf: 'XLF', tickers: ['JPM', 'BAC', 'WFC', 'GS', 'MS', 'V', 'MA', 'AXP', 'BLK'] },
  { id: 'health', name: 'Healthcare', etf: 'XLV', tickers: ['JNJ', 'UNH', 'PFE', 'ABBV', 'MRK', 'LLY', 'TMO', 'AMGN'] },
  { id: 'energy', name: 'Energy', etf: 'XLE', tickers: ['XOM', 'CVX', 'COP', 'EOG', 'SLB', 'MPC', 'OXY'] },
  { id: 'consumer', name: 'Consumer', etf: 'XLY', tickers: ['AMZN', 'HD', 'NKE', 'MCD', 'SBUX', 'TGT', 'LOW'] },
  { id: 'industrial', name: 'Industrials', etf: 'XLI', tickers: ['CAT', 'HON', 'GE', 'UPS', 'RTX', 'BA', 'DE'] },
  { id: 'materials', name: 'Materials', etf: 'XLB', tickers: ['LIN', 'APD', 'ECL', 'NEM', 'FCX', 'NUE'] },
  { id: 'realestate', name: 'Real Estate', etf: 'XLRE', tickers: ['PLD', 'AMT', 'EQIX', 'PSA', 'O', 'SPG'] },
  { id: 'utilities', name: 'Utilities', etf: 'XLU', tickers: ['NEE', 'DUK', 'SO', 'D', 'SRE', 'AEP'] },
  { id: 'comm', name: 'Comm Services', etf: 'XLC', tickers: ['META', 'GOOGL', 'NFLX', 'DIS', 'VZ', 'T'] },
];

function isUSDST(date = new Date()) {
  try {
    const dStr = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/New_York',
      timeZoneName: 'short'
    }).format(date);
    return dStr.includes('EDT') || dStr.includes('GMT-4');
  } catch (e) {
    return true; // Default to EDT for summer months
  }
}

async function fetchQuoteYahoo(symbol) {
  const url = `https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1m&range=1d&includePrePost=true`;
  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'Accept': 'application/json, text/plain, */*',
  };

  try {
    const res = await fetch(url, { headers, signal: AbortSignal.timeout(6000) });
    if (!res.ok) return null;
    const data = await res.json();
    const meta = data?.chart?.result?.[0]?.meta;
    if (!meta) return null;

    const curPrice = meta.regularMarketPrice ?? meta.chartPreviousClose ?? 0;
    const prevClose = meta.chartPreviousClose ?? meta.previousClose ?? curPrice;
    const change = curPrice - prevClose;
    const changePercent = prevClose ? (change / prevClose) * 100 : 0;

    let price = curPrice;
    let dp = changePercent;

    if (meta.preMarketPrice) {
      price = meta.preMarketPrice;
      if (meta.preMarketChangePercent != null) {
        dp = meta.preMarketChangePercent * 100;
      } else if (prevClose) {
        dp = ((price - prevClose) / prevClose) * 100;
      }
    }

    return {
      symbol: meta.symbol || symbol,
      price: price || curPrice,
      dp: dp || 0,
      regularPrice: curPrice,
      prevClose
    };
  } catch (err) {
    return null;
  }
}

async function batchFetch(symbols, chunkSize = 5) {
  const results = {};
  for (let i = 0; i < symbols.length; i += chunkSize) {
    const chunk = symbols.slice(i, i + chunkSize);
    const settled = await Promise.allSettled(chunk.map(async sym => {
      const q = await fetchQuoteYahoo(sym);
      return { sym, q };
    }));
    for (const r of settled) {
      if (r.status === 'fulfilled' && r.value.q) {
        results[r.value.sym] = r.value.q;
      }
    }
  }
  return results;
}

export async function generatePreMarketReportData() {
  console.log('[StockPulse] Fetching ETF quotes for 10 sectors...');
  const etfSymbols = SECTORS.map(s => s.etf);
  const etfQuotes = await batchFetch(etfSymbols, 5);

  const validSectors = SECTORS.map(s => {
    const q = etfQuotes[s.etf];
    return {
      ...s,
      price: q?.price || 0,
      dp: q?.dp || 0
    };
  }).sort((a, b) => b.dp - a.dp);

  if (!validSectors.length || validSectors.every(s => s.price === 0)) {
    throw new Error('Failed to retrieve sector quotes');
  }

  const leadingSector = validSectors[0];
  const laggingSector = validSectors[validSectors.length - 1];

  console.log(`[StockPulse] Leading Sector: ${leadingSector.name} (${leadingSector.dp >= 0 ? '+' : ''}${leadingSector.dp.toFixed(2)}%)`);

  // Collect all tickers to batch fetch
  const allTickers = [...new Set(validSectors.flatMap(s => s.tickers))];
  console.log(`[StockPulse] Fetching ${allTickers.length} constituent stock quotes...`);
  const tickerQuotes = await batchFetch(allTickers, 8);

  const detailedSectors = validSectors.map(sec => {
    const rankedTickers = sec.tickers
      .map(sym => tickerQuotes[sym])
      .filter(Boolean)
      .sort((a, b) => b.dp - a.dp);

    const topGainers = rankedTickers.filter(t => t.dp > 0).slice(0, 3);
    const topLosers = [...rankedTickers].reverse().filter(t => t.dp < 0).slice(0, 3);

    return {
      ...sec,
      topGainers,
      topLosers,
      allRanked: rankedTickers
    };
  });

  const now = new Date();
  const timeStr = now.toLocaleTimeString('th-TH', { timeZone: 'Asia/Bangkok', hour: '2-digit', minute: '2-digit', hour12: false }) + ' น. ICT';
  const dateStr = now.toLocaleDateString('th-TH', { timeZone: 'Asia/Bangkok', weekday: 'long', year: 'numeric', month: 'short', day: 'numeric' });

  // Text Summary
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
  const sectorTableRows = detailedSectors.map((s, idx) => {
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

  const topMoversHtml = detailedSectors.map(s => {
    const isUp = s.dp >= 0;
    const secColor = isUp ? '#10b981' : '#ef4444';

    const gainerBadges = s.topGainers.map(t => `
      <span style="display:inline-block; background:rgba(16,185,129,0.12); color:#10b981; border:1px solid rgba(16,185,129,0.3); border-radius:4px; padding:3px 8px; margin:2px; font-size:11px; font-family:monospace;">
        <strong>${t.symbol}</strong> +${t.dp.toFixed(2)}% <span style="color:#9898b0;">($${t.price.toFixed(2)})</span>
      </span>`).join('') || '<span style="color:#5a5a72; font-size:11px;">ไม่มีหุ้นบวก</span>';

    const loserBadges = s.topLosers.map(t => `
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

export async function sendEmailJSBriefing(report, targetEmail = ALERT_EMAIL) {
  const payload = {
    service_id: EMAILJS_SERVICE_ID,
    template_id: EMAILJS_PREMARKET_TEMPLATE_ID,
    user_id: EMAILJS_PUBLIC_KEY,
    template_params: {
      to_email: targetEmail,
      report_date: report.dateStr + ' • ' + report.timeStr,
      leading_sector: `${report.leadingSector.name} (${report.leadingSector.etf})`,
      leading_sector_chg: (report.leadingSector.dp >= 0 ? '+' : '') + report.leadingSector.dp.toFixed(2) + '%',
      lagging_sector: `${report.laggingSector.name} (${report.laggingSector.etf})`,
      lagging_sector_chg: (report.laggingSector.dp >= 0 ? '+' : '') + report.laggingSector.dp.toFixed(2) + '%',
      sector_table_rows: report.sectorTableRows,
      top_movers_html: report.topMoversHtml,
      full_report_text: report.textSummary,
      timestamp: report.timeStr
    }
  };

  console.log(`[StockPulse] Sending email via EmailJS REST API to ${targetEmail}...`);
  const res = await fetch('https://api.emailjs.com/api/v1.0/email/send', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Origin': 'https://stockpulse.personal'
    },
    body: JSON.stringify(payload)
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`EmailJS API failed (${res.status}): ${errText}`);
  }

  console.log(`[StockPulse] ✅ Pre-Market Briefing email successfully delivered to ${targetEmail}!`);
  
  // Sync to Supabase so website and all devices know it has already been sent today
  try {
    const dateKey = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok' }).format(new Date());
    await syncPremarketSentToSupabase(dateKey, report.timeStr);
  } catch (e) { }

  return true;
}

// Direct execution CLI runner with DST scheduling guard
if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('send_premarket_briefing.js')) {
  (async () => {
    try {
      const isManual = process.argv.includes('--force') || process.env.GITHUB_EVENT_NAME === 'workflow_dispatch';
      const now = new Date();
      const dst = isUSDST(now);
      const utcHour = now.getUTCHours();
      const targetUtcHour = dst ? 13 : 14; // 13:15 UTC (20:15 BKK) during DST / 14:15 UTC (21:15 BKK) during EST

      console.log(`=== StockPulse Pre-Market Briefing Runner ===`);
      console.log(`Time: ${now.toISOString()} | US DST: ${dst ? 'EDT' : 'EST'} | Target UTC Hour: ${targetUtcHour}:15`);

      if (!isManual && Math.abs(utcHour - targetUtcHour) > 0) {
        console.log(`[Cron Guard] Current UTC hour (${utcHour}) is not target UTC hour (${targetUtcHour}). Skipping execution.`);
        process.exit(0);
      }

      const dateKey = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok' }).format(now);
      if (!isManual && await checkPremarketSentInSupabase(dateKey)) {
        console.log(`[Cron Guard] Pre-Market Briefing already sent today (${dateKey}). Skipping duplicate send.`);
        process.exit(0);
      }

      const report = await generatePreMarketReportData();
      await sendEmailJSBriefing(report);
      console.log('Finished successfully.');
      process.exit(0);
    } catch (err) {
      console.error('Fatal error:', err);
      process.exit(1);
    }
  })();
}
