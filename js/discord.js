    // ===== DISCORD WEBHOOK (ส่งเพิ่มเติมจาก Email — ไม่ได้ทดแทน) =====
    // วิธีขอ Webhook URL: Discord > Server Settings > Integrations > Webhooks > New Webhook > Copy Webhook URL
    const DISCORD_WEBHOOK_URL = 'https://discord.com/api/webhooks/1549770173094035558/ggXdEgKGVxXSNexvChRyx4Jk2EC8tXTyHKzhjtbeE0lytK5eA8i0kbLIxPMjhxjeda6A'; // ← วาง Webhook URL ที่นี่ ถ้าเว้นว่างจะไม่ส่ง Discord

    // Discord limits a message to 2000 chars — split long reports into multiple messages instead of truncating
    function splitForDiscord(text, maxLen = 1900) {
      if (text.length <= maxLen) return [text];
      const chunks = [];
      let remaining = text;
      while (remaining.length > maxLen) {
        let cut = remaining.lastIndexOf('\n', maxLen);
        if (cut <= 0) cut = maxLen;
        chunks.push(remaining.slice(0, cut));
        remaining = remaining.slice(cut).replace(/^\n+/, '');
      }
      if (remaining) chunks.push(remaining);
      return chunks;
    }

    async function sendDiscordMessage(content) {
      if (!DISCORD_WEBHOOK_URL) return;
      for (const chunk of splitForDiscord(String(content))) {
        try {
          await fetch(DISCORD_WEBHOOK_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ content: chunk })
          });
        } catch (e) { console.warn('Discord webhook error:', e); }
      }
    }
