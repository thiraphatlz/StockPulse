    // ===== DISCORD WEBHOOK (ส่งเพิ่มเติมจาก Email — ไม่ได้ทดแทน) =====
    // วิธีขอ Webhook URL: Discord > Server Settings > Integrations > Webhooks > New Webhook > Copy Webhook URL
    const DISCORD_WEBHOOK_URL = 'https://discord.com/api/webhooks/1549770173094035558/ggXdEgKGVxXSNexvChRyx4Jk2EC8tXTyHKzhjtbeE0lytK5eA8i0kbLIxPMjhxjeda6A'; // ← วาง Webhook URL ที่นี่ ถ้าเว้นว่างจะไม่ส่ง Discord

    async function sendDiscordMessage(content) {
      if (!DISCORD_WEBHOOK_URL) return;
      try {
        await fetch(DISCORD_WEBHOOK_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content: String(content).slice(0, 1900) })
        });
      } catch (e) { console.warn('Discord webhook error:', e); }
    }
