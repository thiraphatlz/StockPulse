import crypto from 'crypto';
import { fetchQuoteYahoo, generatePreMarketReportData, splitForDiscord } from '../scripts/send_premarket_briefing.js';

// Vercel auto-parses JSON bodies by default, but Discord signature verification needs the exact raw bytes
export const config = { api: { bodyParser: false } };

const DISCORD_PUBLIC_KEY = process.env.DISCORD_PUBLIC_KEY || '';
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://pxxtyzphnbbxrogikotc.supabase.co';
const SUPABASE_ANON = process.env.SUPABASE_ANON || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB4eHR5enBobmJieHJvZ2lrb3RjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY3Njg0NTQsImV4cCI6MjEwMjM0NDQ1NH0.w0tui-y9KFY-6qqZfM8ol2b3EuR3LP0sXZRjIYM6xVc';

// Fixed 12-byte ASN.1 SPKI header for any Ed25519 key — lets Node's crypto import Discord's raw 32-byte public key with no extra dependency
const ED25519_SPKI_PREFIX = Buffer.from('302a300506032b6570032100', 'hex');

function verifyDiscordRequest(rawBody, signature, timestamp) {
  if (!DISCORD_PUBLIC_KEY || !signature || !timestamp) return false;
  try {
    const publicKey = crypto.createPublicKey({
      key: Buffer.concat([ED25519_SPKI_PREFIX, Buffer.from(DISCORD_PUBLIC_KEY, 'hex')]),
      format: 'der',
      type: 'spki'
    });
    const message = Buffer.concat([Buffer.from(timestamp, 'utf8'), rawBody]);
    return crypto.verify(null, message, publicKey, Buffer.from(signature, 'hex'));
  } catch (e) {
    return false;
  }
}

function readRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', c => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

const reply = content => ({ type: 4, data: { content } });

async function handlePrice(opts) {
  const symbol = String(opts.symbol || '').toUpperCase().trim();
  const q = await fetchQuoteYahoo(symbol);
  if (!q || !q.price) return reply(`❌ No quote found for **${symbol}**`);
  const sign = q.dp >= 0 ? '+' : '';
  return reply(`**${symbol}**: $${q.price.toFixed(2)} (${sign}${q.dp.toFixed(2)}%)`);
}

async function handleAlert(opts) {
  const symbol = String(opts.symbol || '').toUpperCase().trim();
  const direction = opts.direction;
  const price = Number(opts.price);
  if (!symbol || !['above', 'below'].includes(direction) || !(price > 0)) {
    return reply('⚠️ Usage: /alert symbol:AAPL direction:above price:250');
  }
  const res = await fetch(`${SUPABASE_URL}/rest/v1/alerts`, {
    method: 'POST',
    headers: { apikey: SUPABASE_ANON, Authorization: `Bearer ${SUPABASE_ANON}`, 'Content-Type': 'application/json', 'Prefer': 'resolution=merge-duplicates' },
    body: JSON.stringify({ symbol, direction, price, name: symbol })
  });
  if (!res.ok) return reply(`❌ Failed to save alert: ${await res.text()}`);
  return reply(`🔔 Alert set: **${symbol}** ${direction} $${price.toFixed(2)}`);
}

async function handleAlerts() {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/alerts?select=*&symbol=not.like.__*`, {
    headers: { apikey: SUPABASE_ANON, Authorization: `Bearer ${SUPABASE_ANON}` }
  });
  const rows = res.ok ? await res.json() : [];
  if (!rows.length) return reply('No active alerts.');
  return reply(rows.map(r => `• **${r.symbol}** ${r.direction} $${Number(r.price).toFixed(2)}`).join('\n'));
}

async function sendPremarketFollowup(interaction) {
  const base = `https://discord.com/api/v10/webhooks/${interaction.application_id}/${interaction.token}`;
  try {
    const report = await generatePreMarketReportData();
    const [first, ...rest] = splitForDiscord(report.textSummary);
    await fetch(`${base}/messages/@original`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: first })
    });
    for (const chunk of rest) {
      await fetch(base, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ content: chunk }) });
    }
  } catch (e) {
    await fetch(`${base}/messages/@original`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: `❌ Failed to generate briefing: ${e.message}` })
    });
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const rawBody = await readRawBody(req);
  if (!verifyDiscordRequest(rawBody, req.headers['x-signature-ed25519'], req.headers['x-signature-timestamp'])) {
    return res.status(401).json({ error: 'invalid request signature' });
  }

  const interaction = JSON.parse(rawBody.toString('utf8'));

  if (interaction.type === 1) return res.status(200).json({ type: 1 }); // Discord's endpoint verification PING

  if (interaction.type === 2) {
    const opts = {};
    (interaction.data.options || []).forEach(o => { opts[o.name] = o.value; });

    switch (interaction.data.name) {
      case 'price':
        return res.status(200).json(await handlePrice(opts));
      case 'alert':
        return res.status(200).json(await handleAlert(opts));
      case 'alerts':
        return res.status(200).json(await handleAlerts());
      case 'premarket':
        res.status(200).json({ type: 5 }); // deferred — report takes longer than Discord's 3s ack window
        await sendPremarketFollowup(interaction);
        return;
      default:
        return res.status(200).json(reply('Unknown command.'));
    }
  }

  return res.status(400).json({ error: 'unhandled interaction type' });
}
