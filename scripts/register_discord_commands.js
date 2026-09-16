/**
 * One-time setup — run whenever the command list below changes:
 *   DISCORD_BOT_TOKEN=... DISCORD_APPLICATION_ID=... node scripts/register_discord_commands.js
 */
const DISCORD_BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;
const DISCORD_APPLICATION_ID = process.env.DISCORD_APPLICATION_ID;

if (!DISCORD_BOT_TOKEN || !DISCORD_APPLICATION_ID) {
  console.error('Set DISCORD_BOT_TOKEN and DISCORD_APPLICATION_ID env vars first.');
  process.exit(1);
}

const commands = [
  {
    name: 'price', description: 'Get the current price of a stock',
    options: [{ name: 'symbol', description: 'Ticker symbol, e.g. AAPL', type: 3, required: true }]
  },
  {
    name: 'alert', description: 'Set a price alert',
    options: [
      { name: 'symbol', description: 'Ticker symbol, e.g. AAPL', type: 3, required: true },
      {
        name: 'direction', description: 'Trigger when price goes above or below', type: 3, required: true,
        choices: [{ name: 'above', value: 'above' }, { name: 'below', value: 'below' }]
      },
      { name: 'price', description: 'Target price', type: 10, required: true }
    ]
  },
  { name: 'alerts', description: 'List active price alerts' },
  { name: 'premarket', description: 'Generate the Pre-Market Sector Flow briefing now' },
  {
    name: 'portfolio', description: 'Show your portfolio value and P/L (only you can use this)',
    options: [{ name: 'name', description: 'Show only this portfolio (default: all)', type: 3, required: false }]
  }
];

const res = await fetch(`https://discord.com/api/v10/applications/${DISCORD_APPLICATION_ID}/commands`, {
  method: 'PUT',
  headers: { Authorization: `Bot ${DISCORD_BOT_TOKEN}`, 'Content-Type': 'application/json' },
  body: JSON.stringify(commands)
});

if (!res.ok) {
  console.error('Failed to register commands:', res.status, await res.text());
  process.exit(1);
}
console.log(`Registered ${commands.length} commands:`, commands.map(c => c.name).join(', '));
