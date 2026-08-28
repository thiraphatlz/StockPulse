    // ===== EMAILJS =====
    const EMAILJS_PUBLIC_KEY = '8EBack4zwyOa1x49O';   // ← Public Key จาก EmailJS
    const EMAILJS_SERVICE_ID = 'service_u55ha9b';   // ← Service ID
    const EMAILJS_TEMPLATE_ID = 'template_k98tnwo';  // ← Price Alert Template ID
    const EMAILJS_PREMARKET_TEMPLATE_ID = 'template_2mgjigz'; // ← Pre-Market Briefing Template ID

    function initEmailJS() {
      if (typeof emailjs !== 'undefined' && EMAILJS_PUBLIC_KEY && EMAILJS_PUBLIC_KEY !== 'YOUR_PUBLIC_KEY') {
        emailjs.init({ publicKey: EMAILJS_PUBLIC_KEY });
      }
    }

    async function sendAlertEmail(symbol, name, direction, targetPrice, currentPrice) {
      const email = S.alertEmail;
      if (!email) { showToast('⚠ No alert email set (Go to Settings)', 'error'); return; }
      const dirLabel = direction === 'above' ? 'risen above' : 'fallen below';
      const cs = getCurSym(symbol, null);
      const params = {
        to_email: email,
        stock_symbol: symbol,
        stock_name: name || symbol,
        direction: dirLabel,
        target_price: cs + Number(targetPrice).toFixed(2),
        current_price: cs + Number(currentPrice).toFixed(2),
        timestamp: getRealNow().toLocaleString(S.lang === 'th' ? 'th-TH' : 'en-US', { timeZone: 'Asia/Bangkok', dateStyle: 'medium', timeStyle: 'short', hour12: false }) + ' ICT'
      };
      if (typeof emailjs !== 'undefined' && EMAILJS_PUBLIC_KEY && EMAILJS_PUBLIC_KEY !== 'YOUR_PUBLIC_KEY') {
        try {
          showToast(`Sending email to ${email}...`, 'success');
          await emailjs.send(EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_ID, params);
          showToast(`📧 Alert email sent for ${symbol}!`, 'success');
        } catch (e) {
          console.error('EmailJS error:', e);
          showToast(`EmailJS error: ${e.text || e.message || 'Failed to send'}`, 'error');
        }
      } else {
        console.log('[Alert] Would send email:', params);
        showToast(`🔔 ${symbol} hit ${cs}${Number(currentPrice).toFixed(2)} (EmailJS not configured)`, 'success');
      }
    }

    async function testAlertEmail() {
      const emailInp = document.getElementById('settingsEmail');
      const email = emailInp.value.trim() || S.alertEmail;
      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        emailInp.classList.add('error');
        document.getElementById('settingsError').classList.add('visible');
        showToast('Please enter a valid email first', 'error');
        return;
      }
      S.alertEmail = email;
      localStorage.setItem('stockpulse_alert_email', email);
      renderAlertEmailNote();
      await sendAlertEmail('TEST', 'Test Stock (Apple Inc.)', 'risen above', 100.00, 105.50);
    }

