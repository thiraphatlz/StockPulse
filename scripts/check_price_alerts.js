/**
 * StockPulse - Automated Price Alert Checker
 * Runs standalone via Node.js / GitHub Actions cron, independent of the website being open.
 * Reads active alerts from Supabase, checks current price, and notifies (Discord + Email) on trigger.
 */

import { fetchQuoteYahoo, fetchNotificationSettings } from './send_premarket_briefing.js';

const EMAILJS_PUBLIC_KEY = process.env.EMAILJS_PUBLIC_KEY || '8EBack4zwyOa1x49O';
const EMAILJS_SERVICE_ID = process.env.EMAILJS_SERVICE_ID || 'service_u55ha9b';
const EMAILJS_ALERT_TEMPLATE_ID = process.env.EMAILJS_ALERT_TEMPLATE_ID || 'template_k98tnwo';
const ALERT_EMAIL = process.env.ALERT_EMAIL || 'thiraphatlaohiao1@gmail.com';
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://pxxtyzphnbbxrogikotc.supabase.co';
const SUPABASE_ANON = process.env.SUPABASE_ANON || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB4eHR5enBobmJieHJvZ2lrb3RjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY3Njg0NTQsImV4cCI6MjEwMjM0NDQ1NH0.w0tui-y9KFY-6qqZfM8ol2b3EuR3LP0sXZRjIYM6xVc';
const DISCORD_BOT_TOKEN = process.env.DISCORD_BOT_TOKEN || '';
const DISCORD_CHANNEL_ID = process.env.DISCORD_CHANNEL_ID || '';

async function fetchActiveAlerts() {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/alerts?select=*&symbol=neq.__SYS_PREMARKET__`, {
    headers: { apikey: SUPABASE_ANON, Authorization: `Bearer ${SUPABASE_ANON}` }
  });
  if (!res.ok) throw new Error(`Failed to load alerts: ${res.status}`);
  return res.json();
}

async function deleteAlert(symbol, direction) {
  await fetch(`${SUPABASE_URL}/rest/v1/alerts?symbol=eq.${encodeURIComponent(symbol)}&direction=eq.${direction}`, {
    method: 'DELETE',
    headers: { apikey: SUPABASE_ANON, Authorization: `Bearer ${SUPABASE_ANON}` }
  });
}

async function sendDiscordAlert(content) {
  if (!DISCORD_BOT_TOKEN || !DISCORD_CHANNEL_ID) return;
  try {
    const res = await fetch(`https://discord.com/api/v10/channels/${DISCORD_CHANNEL_ID}/messages`, {
      method: 'POST',
      headers: { 'Authorization': `Bot ${DISCORD_BOT_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: content.slice(0, 1900) })
    });
    if (!res.ok) console.warn('[PriceAlerts] Discord bot send failed:', res.status, await res.text());
  } catch (e) {
    console.warn('[PriceAlerts] Discord bot send error:', e.message);
  }
}

async function sendEmailAlert(symbol, name, direction, targetPrice, currentPrice, targetEmail) {
  const cs = symbol.endsWith('.BK') ? '฿' : '$';
  const dirLabel = direction === 'above' ? 'risen above' : 'fallen below';
  const timestamp = new Date().toLocaleString('en-US', { timeZone: 'Asia/Bangkok', dateStyle: 'medium', timeStyle: 'short', hour12: false }) + ' ICT';
  const payload = {
    service_id: EMAILJS_SERVICE_ID,
    template_id: EMAILJS_ALERT_TEMPLATE_ID,
    user_id: EMAILJS_PUBLIC_KEY,
    template_params: {
      to_email: targetEmail,
      stock_symbol: symbol,
      stock_name: name || symbol,
      direction: dirLabel,
      target_price: cs + Number(targetPrice).toFixed(2),
      current_price: cs + Number(currentPrice).toFixed(2),
      timestamp
    }
  };
  const res = await fetch('https://api.emailjs.com/api/v1.0/email/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Origin': 'http://localhost' },
    body: JSON.stringify(payload)
  });
  if (!res.ok) throw new Error(`EmailJS API failed (${res.status}): ${await res.text()}`);
}

async function main() {
  console.log('=== StockPulse Price Alert Checker ===');
  const settings = await fetchNotificationSettings();
  const rows = await fetchActiveAlerts();
  if (!rows.length) { console.log('[PriceAlerts] No active alerts.'); return; }

  const bySymbol = {};
  for (const r of rows) {
    (bySymbol[r.symbol] ??= {})[r.direction] = r;
  }

  for (const symbol of Object.keys(bySymbol)) {
    const q = await fetchQuoteYahoo(symbol);
    if (!q || !q.regularPrice) { console.warn(`[PriceAlerts] No quote for ${symbol}, skipping.`); continue; }
    const price = q.regularPrice;

    for (const direction of ['above', 'below']) {
      const alert = bySymbol[symbol][direction];
      if (!alert) continue;
      const triggered = direction === 'above' ? price >= alert.price : price <= alert.price;
      if (!triggered) continue;

      console.log(`[PriceAlerts] ${symbol} ${direction} ${alert.price} triggered @ ${price}`);
      const name = alert.name || symbol;

      if (settings.notifyDiscord) {
        await sendDiscordAlert(`🔔 **${symbol}** ราคา${direction === 'above' ? 'ขึ้นเหนือ' : 'ลงต่ำกว่า'} ${alert.price}\nราคาปัจจุบัน: ${price.toFixed(2)}\n🕐 ${new Date().toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' })} ICT`);
      }

      if (settings.notifyEmail) {
        try {
          await sendEmailAlert(symbol, name, direction, alert.price, price, ALERT_EMAIL);
          console.log(`[PriceAlerts] Email sent for ${symbol} ${direction}`);
        } catch (e) {
          console.warn(`[PriceAlerts] Email failed for ${symbol} ${direction}:`, e.message);
        }
      }

      await deleteAlert(symbol, direction);
    }
    await new Promise(r => setTimeout(r, 150));
  }

  console.log('[PriceAlerts] Done.');
}

main().catch(err => {
  console.error('[PriceAlerts] Fatal error:', err.message);
  process.exit(1);
});
