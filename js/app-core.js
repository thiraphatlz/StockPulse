    const SECTORS = [
      { id: 'tech', name: 'Technology', css: 'tech', etf: 'XLK', tickers: ['AAPL', 'MSFT', 'NVDA', 'META', 'GOOGL', 'AVGO', 'AMD', 'INTC', 'ORCL', 'CRM'] },
      { id: 'finance', name: 'Financials', css: 'finance', etf: 'XLF', tickers: ['JPM', 'BAC', 'WFC', 'GS', 'MS', 'V', 'MA', 'AXP', 'BLK'] },
      { id: 'health', name: 'Healthcare', css: 'health', etf: 'XLV', tickers: ['JNJ', 'UNH', 'PFE', 'ABBV', 'MRK', 'LLY', 'TMO', 'AMGN'] },
      { id: 'energy', name: 'Energy', css: 'energy', etf: 'XLE', tickers: ['XOM', 'CVX', 'COP', 'EOG', 'SLB', 'MPC', 'OXY'] },
      { id: 'consumer', name: 'Consumer', css: 'consumer', etf: 'XLY', tickers: ['AMZN', 'HD', 'NKE', 'MCD', 'SBUX', 'TGT', 'LOW'] },
      { id: 'industrial', name: 'Industrials', css: 'industrial', etf: 'XLI', tickers: ['CAT', 'HON', 'GE', 'UPS', 'RTX', 'BA', 'DE'] },
      { id: 'materials', name: 'Materials', css: 'materials', etf: 'XLB', tickers: ['LIN', 'APD', 'ECL', 'NEM', 'FCX', 'NUE'] },
      { id: 'realestate', name: 'Real Estate', css: 'realestate', etf: 'XLRE', tickers: ['PLD', 'AMT', 'EQIX', 'PSA', 'O', 'SPG'] },
      { id: 'utilities', name: 'Utilities', css: 'utilities', etf: 'XLU', tickers: ['NEE', 'DUK', 'SO', 'D', 'SRE', 'AEP'] },
      { id: 'comm', name: 'Comm Services', css: 'comm', etf: 'XLC', tickers: ['META', 'GOOGL', 'NFLX', 'DIS', 'VZ', 'T'] },
    ];

    const SET_SECTORS = [
      { id: 'set_energy', name: 'Energy & Utilities', thName: 'พลังงานและสาธารณูปโภค', tickers: ['PTT.BK', 'PTTEP.BK', 'GULF.BK', 'GPSC.BK', 'BGRIM.BK', 'TOP.BK', 'BANPU.BK', 'EA.BK'] },
      { id: 'set_bank', name: 'Banking & Finance', thName: 'ธนาคารและการเงิน', tickers: ['SCB.BK', 'KBANK.BK', 'BBL.BK', 'KTB.BK', 'TTB.BK', 'TIDLOR.BK', 'MTC.BK', 'SAWAD.BK'] },
      { id: 'set_commerce', name: 'Commerce & Retail', thName: 'พาณิชย์และค้าปลีก', tickers: ['CPALL.BK', 'CPAXT.BK', 'CRC.BK', 'BJC.BK', 'HMPRO.BK', 'GLOBAL.BK'] },
      { id: 'set_ict', name: 'ICT & Telecom', thName: 'เทคโนโลยีและการสื่อสาร', tickers: ['ADVANC.BK', 'TRUE.BK', 'INTUCH.BK', 'DIF.BK', 'JAS.BK'] },
      { id: 'set_trans', name: 'Transportation', thName: 'ขนส่งและโลจิสติกส์', tickers: ['AOT.BK', 'BEM.BK', 'BTS.BK', 'PSL.BK', 'RCL.BK'] },
      { id: 'set_health', name: 'Healthcare', thName: 'การแพทย์และโรงพยาบาล', tickers: ['BDMS.BK', 'BH.BK', 'BCH.BK', 'CHG.BK', 'PR9.BK'] },
      { id: 'set_electronics', name: 'Electronics', thName: 'ชิ้นส่วนอิเล็กทรอนิกส์', tickers: ['DELTA.BK', 'HANA.BK', 'KCE.BK', 'CCET.BK'] },
      { id: 'set_property', name: 'Property & Construction', thName: 'อสังหาฯ และก่อสร้าง', tickers: ['CPN.BK', 'LH.BK', 'AP.BK', 'SPALI.BK', 'SIRI.BK', 'SCC.BK', 'CK.BK'] },
      { id: 'set_food', name: 'Food & Beverage', thName: 'อาหารและเครื่องดื่ม', tickers: ['CPF.BK', 'CBG.BK', 'OSP.BK', 'MINT.BK', 'TU.BK', 'ICHI.BK'] }
    ];

    const HM = {
      market: 'us', // 'us' | 'set'
      filterQuery: '',
      filterSector: 'all',
      cache: { us: null, set: null },
      loading: false
    };

    const HARDCODED_API_KEY = 'd9vjs4pr01qgk75onskgd9vjs4pr01qgk75onsl0';
    localStorage.setItem('stockpulse_api_key', HARDCODED_API_KEY);

    const S = {
      apiKey: HARDCODED_API_KEY, sym: '', profile: null, quote: null,
      wl: JSON.parse(localStorage.getItem('stockpulse_wishlist') || '[]'),
      searchTO: null, refreshTimer: null, cdTimer: null, cd: 30,
      page: 'dashboard', sectors: {},
      lang: localStorage.getItem('stockpulse_lang') || 'en',
      alertEmail: localStorage.getItem('stockpulse_alert_email') || 'thiraphatlaohiao1@gmail.com',
      premarketAlert: localStorage.getItem('stockpulse_premarket_alert') !== 'false'
    };

    const I18N = {
      en: {
        dashboard: 'Dashboard', stock: 'Stock', heatmap: 'Heatmap', watchlist: 'Watchlist', settings: 'Settings', searchPlaceholder: 'Search stocks...',
        marketClosed: 'Closed', marketOpen: 'Open', marketPre: 'Pre-Market', marketAfter: 'After Hours', marketIntermission: 'Lunch Break',
        marketRealtime: 'Real-time', marketAtClose: 'At Close', atClose: 'At close:',
        refresh: 'Refresh', gainers: 'Gainers', losers: 'Losers', best: 'Best', sectors: 'Sectors',
        trackStocks: 'Track Your Stocks', trackStocksDesc: 'Search for a stock symbol to view real-time prices.',
        add: 'Add', addCurrent: 'Add Current',
        statOpen: 'Open', statHigh: 'High', statLow: 'Low', statPrev: 'Prev Close',
        statVolume: 'Volume', statAvgVolume: 'Avg Volume', stat52High: '52W High', stat52Low: '52W Low',
        // Heatmap
        heatmapTitle: 'Market Heatmap 🔥', heatmapSubtitle: 'Visual overview of sector rotation & capital flows',
        // Technicals
        techTitle: 'Technical Indicators', techDailyClassic: 'Daily / Classic',
        techTabPivot: 'Pivot S/R', techTabFibo: 'Fibonacci', techTabMa: 'Moving Averages', techTabRsi: 'RSI (14)',
        // Key Valuation
        valTitle: 'Key Valuation', valPE: 'P/E (TTM)', valFwdPE: 'Forward P/E', valEPS: 'EPS (TTM)',
        valBeta: 'Beta', valDivYield: 'Dividend Yield', valPB: 'P/B Ratio',
        valSubTrailing: 'Trailing', valSubEst: 'Estimated', valSubPerShare: 'Per Share',
        valSubVol: 'Volatility', valSubAnnual: 'Annual', valSubBook: 'Book Value',
        // Company
        companyTitle: 'Company Profile', infoIndustry: 'Industry', infoCountry: 'Country', infoMarketCap: 'Market Cap',
        infoWebsite: 'Website', infoIpoDate: 'IPO Date',
        emptyWatchlist: 'Empty watchlist — search to add stocks', emptyWatchlistSidebar: 'Empty watchlist',
        settingsTitle: 'Settings', settingsDesc: 'Set your alert email to receive price notifications.', settingsEmailLabel: 'Alert Email',
        settingsPremarketTitle: 'Pre-Market Briefing Alert (20:15)', settingsPremarketDesc: 'Daily email summary of Sector Flow & Top 3 Movers at 20:15 BKK',
        cancel: 'Cancel', save: 'Save',
        tblSymbol: 'Symbol', tblPrice: 'Price', tblChange: 'Change', tblVolume: 'Volume', tblAction: 'Action',
        gMorning: 'Good Morning ☀️', gAfternoon: 'Good Afternoon 🌤', gEvening: 'Good Evening 🌙',
        alertTitle: 'Price Alerts', alertSet: 'Set', alertSetEmail: 'Alerts will be sent to',
        alertNoEmail: 'Set email in Settings',
        activeAlerts: 'Active Alerts', noActiveAlerts: 'No active price alerts — search a stock to set alerts',
        portfolio: 'Portfolio', pfTitle: 'My Portfolio', pfAddPos: 'Add Position',
        pfNew: 'New Portfolio', pfNoPortfolio: 'No portfolio yet.<br>Create your first portfolio to get started.',
        pfNoPositions: 'No positions yet.<br>Click "Add Position" to get started.',
        pfTotalCost: 'Total Cost', pfMktVal: 'Market Value', pfPL: 'Unrealized P&L', pfReturn: 'Return',
        pfSymbol: 'Symbol', pfShares: 'Shares', pfAvgCost: 'Avg Cost', pfPrice: 'Price',
        pfCostBasis: 'Cost Basis', pfMktValue: 'Mkt Value',
        pfModalTitle: 'Add Position', pfLblSymbol: 'Stock Symbol', pfLblPrice: 'Price When Purchased (USD / Share)',
        pfLblAmount: 'Amount Invested', pfLblDate: 'Purchase Date',
        pfCancel: 'Cancel', pfSubmit: 'Add Position',
        pfCalcShares: (shares) => `≈ ${shares} shares will be purchased`,
        pfCurFetch: 'Fetching current price...',
        pfCurLoaded: (p) => `Current price: $${p}`,
        pfLoading: 'Loading...', pfLoadingPos: 'Loading positions...',
        pfPositions: (n) => `${n} position${n !== 1 ? 's' : ''}`,
        pfNoPortfolioCreate: 'Create',
        pfNewLabel: 'New Portfolio',
        pinTitle: 'Portfolio Access',
        pinSubtitle: 'Enter PIN to view your portfolio',
        pinUnlock: 'Unlock Portfolio',
        pinCancel: 'Back',
        pinIncorrect: 'Incorrect PIN. Please try again.',
      },
      th: {
        dashboard: 'แดชบอร์ด', stock: 'หุ้น', heatmap: 'แผนที่ตลาด', watchlist: 'รายการเฝ้าดู', settings: 'ตั้งค่า', searchPlaceholder: 'ค้นหาหุ้น...',
        marketClosed: 'ปิดทำการ', marketOpen: 'เปิดทำการ', marketPre: 'ก่อนตลาดเปิด', marketAfter: 'หลังตลาดปิด', marketIntermission: 'พักเที่ยง',
        marketRealtime: 'เรียลไทม์', marketAtClose: 'ราคาปิด', atClose: 'ราคาปิด:',
        refresh: 'รีเฟรช', gainers: 'บวก', losers: 'ลบ', best: 'ดีที่สุด', sectors: 'อุตสาหกรรม',
        trackStocks: 'ติดตามหุ้นของคุณ', trackStocksDesc: 'ค้นหาสัญลักษณ์หุ้นเพื่อดูราคาแบบเรียลไทม์',
        add: 'เพิ่ม', addCurrent: 'เพิ่มปัจจุบัน',
        statOpen: 'ราคาเปิด', statHigh: 'ราคาสูงสุด', statLow: 'ราคาต่ำสุด', statPrev: 'ปิดวันก่อน',
        statVolume: 'ปริมาณซื้อขาย', statAvgVolume: 'ปริมาณเฉลี่ย', stat52High: 'สูงสุด 52 สัปดาห์', stat52Low: 'ต่ำสุด 52 สัปดาห์',
        // Heatmap
        heatmapTitle: 'แผนที่ตลาดหุ้น (Heatmap) 🔥', heatmapSubtitle: 'ภาพรวมทิศทางเม็ดเงินและผลตอบแทนรายกลุ่มอุตสาหกรรม',
        // Technicals
        techTitle: 'เครื่องมือวิเคราะห์ทางเทคนิค', techDailyClassic: 'รายวัน / คลาสสิก',
        techTabPivot: 'แนวรับ-แนวต้าน', techTabFibo: 'ฟีโบนัชชี (Fibo)', techTabMa: 'เส้นค่าเฉลี่ย (MA)', techTabRsi: 'ดัชนี RSI (14)',
        // Key Valuation
        valTitle: 'การประเมินมูลค่าหุ้น', valPE: 'P/E (ย้อนหลัง)', valFwdPE: 'Forward P/E', valEPS: 'กำไรต่อหุ้น (EPS)',
        valBeta: 'ความผันผวน (Beta)', valDivYield: 'อัตราปันผลตอบแทน', valPB: 'อัตราส่วน P/B',
        valSubTrailing: '12 เดือนย้อนหลัง', valSubEst: 'ประมาณการกำไร', valSubPerShare: 'ต่อหุ้น',
        valSubVol: 'เทียบตลาด', valSubAnnual: 'รายปี', valSubBook: 'มูลค่าทางบัญชี',
        // Company
        companyTitle: 'ข้อมูลบริษัท', infoIndustry: 'กลุ่มอุตสาหกรรม', infoCountry: 'ประเทศ', infoMarketCap: 'มูลค่าตลาด',
        infoWebsite: 'เว็บไซต์', infoIpoDate: 'วันที่เข้าตลาด (IPO)',
        emptyWatchlist: 'ไม่มีรายการ — ค้นหาเพื่อเพิ่มหุ้น', emptyWatchlistSidebar: 'ไม่มีรายการเฝ้าดู',
        settingsTitle: 'การตั้งค่า', settingsDesc: 'ตั้งค่าอีเมลสำหรับรับการแจ้งเตือนราคาหุ้น', settingsEmailLabel: 'อีเมลแจ้งเตือน',
        settingsPremarketTitle: 'แจ้งเตือน Pre-Market (20:15 น.)', settingsPremarketDesc: 'ส่งอีเมลสรุป Sector Flow & Top 3 หุ้นเด่นก่อนเปิดตลาด',
        cancel: 'ยกเลิก', save: 'บันทึก',
        tblSymbol: 'สัญลักษณ์', tblPrice: 'ราคา', tblChange: 'เปลี่ยนแปลง', tblVolume: 'ปริมาณ', tblAction: 'จัดการ',
        gMorning: 'สวัสดีตอนเช้า ☀️', gAfternoon: 'สวัสดีตอนบ่าย 🌤', gEvening: 'สวัสดีตอนเย็น 🌙',
        alertTitle: 'แจ้งเตือนราคา', alertSet: 'ตั้งค่า', alertSetEmail: 'แจ้งเตือนจะส่งไปที่',
        alertNoEmail: 'ตั้งค่าอีเมลในการตั้งค่า',
        activeAlerts: 'การแจ้งเตือนที่ตั้งไว้', noActiveAlerts: 'ไม่มีรายการแจ้งเตือน — ค้นหาหุ้นเพื่อตั้งค่าแจ้งเตือน',
        // Portfolio
        portfolio: 'พอร์ต', pfTitle: 'พอร์ตโฟลิโอของฉัน', pfAddPos: 'เพิ่ม Position',
        pfNew: 'พอร์ตใหม่', pfNoPortfolio: 'ยังไม่มีพอร์ต<br>สร้างพอร์ตแรกเพื่อเริ่มต้น',
        pfNoPositions: 'ยังไม่มี Position<br>กด "เพิ่ม Position" เพื่อเริ่มต้น',
        pfTotalCost: 'ต้นทุนรวม', pfMktVal: 'มูลค่าตลาด', pfPL: 'กำไร/ขาดทุน', pfReturn: 'ผลตอบแทน',
        pfSymbol: 'หุ้น', pfShares: 'จำนวนหุ้น', pfAvgCost: 'ต้นทุนเฉลี่ย', pfPrice: 'ราคาปัจจุบัน',
        pfCostBasis: 'ต้นทุนทั้งหมด', pfMktValue: 'มูลค่า',
        pfModalTitle: 'เพิ่ม Position', pfLblSymbol: 'สัญลักษณ์หุ้น',
        pfLblPrice: 'ราคาหุ้นตอนซื้อ (USD / หุ้น)', pfLblAmount: 'จำนวนเงินที่ลงทุน',
        pfLblDate: 'วันที่ซื้อ', pfCancel: 'ยกเลิก', pfSubmit: 'เพิ่ม Position',
        pfCalcShares: (shares) => `≈ ${shares} หุ้น`,
        pfCurFetch: 'กำลังดึงราคา...',
        pfCurLoaded: (p) => `ราคาปัจจุบัน: $${p}`,
        pfLoading: 'กำลังโหลด...', pfLoadingPos: 'กำลังโหลดรายการ...',
        pfPositions: (n) => `${n} รายการ`,
        pfNoPortfolioCreate: 'สร้าง',
        pfNewLabel: 'พอร์ตใหม่',
        pinTitle: 'เข้าสู่พอร์ตโฟลิโอ',
        pinSubtitle: 'กรอกรหัส PIN เพื่อดูพอร์ตของคุณ',
        pinUnlock: 'ปลดล็อกพอร์ต',
        pinCancel: 'ย้อนกลับ',
        pinIncorrect: 'รหัส PIN ไม่ถูกต้อง กรุณาลองใหม่อีกครั้ง',
      }
    };

    function toggleLanguage() {
      S.lang = S.lang === 'en' ? 'th' : 'en';
      localStorage.setItem('stockpulse_lang', S.lang);
      applyLanguage();
    }

    function applyLanguage() {
      const t = I18N[S.lang];
      document.getElementById('langToggleBtn').textContent = S.lang === 'en' ? 'EN' : 'TH';
      const setLbl = (sel, txt) => { const el = document.querySelector(sel); if (el) el.textContent = txt; };
      setLbl('#tab-dashboard .i18n-lbl', t.dashboard);
      setLbl('#mnav-dashboard .i18n-lbl', t.dashboard);
      setLbl('#tab-heatmap .i18n-lbl', t.heatmap);
      setLbl('#mnav-heatmap .i18n-lbl', t.heatmap);
      setLbl('#mnav-stock .i18n-lbl', t.stock);
      setLbl('#mnav-watchlist .i18n-lbl', t.watchlist);
      setLbl('#mnav-settings .i18n-lbl', t.settings);
      setLbl('#tab-portfolio .i18n-lbl', t.portfolio);
      setLbl('#mnav-portfolio .i18n-lbl', t.portfolio);
      setLbl('#heatmapTitle', t.heatmapTitle);
      setLbl('#heatmapSubtitle', t.heatmapSubtitle);
      document.getElementById('searchInput').placeholder = t.searchPlaceholder;
      if (document.querySelector('.summary-card:nth-child(1) .summary-lbl')) document.querySelector('.summary-card:nth-child(1) .summary-lbl').textContent = t.watchlist;
      if (document.querySelector('.summary-card:nth-child(2) .summary-lbl')) document.querySelector('.summary-card:nth-child(2) .summary-lbl').textContent = t.gainers;
      if (document.querySelector('.summary-card:nth-child(3) .summary-lbl')) document.querySelector('.summary-card:nth-child(3) .summary-lbl').textContent = t.losers;
      if (document.querySelector('.summary-card:nth-child(4) .summary-lbl')) document.querySelector('.summary-card:nth-child(4) .summary-lbl').textContent = t.best;
      const titles = document.querySelectorAll('.section-title');
      if (titles.length > 0) titles[0].lastChild.nodeValue = t.watchlist;
      if (document.getElementById('titleActiveAlerts')) document.getElementById('titleActiveAlerts').textContent = t.activeAlerts;
      if (titles.length > 2) titles[2].lastChild.nodeValue = t.sectors;
      document.querySelector('#welcomeState h2').textContent = t.trackStocks;
      document.querySelector('#welcomeState p').textContent = t.trackStocksDesc;

      // 8 Stats
      setLbl('#lblStatOpen', t.statOpen);
      setLbl('#lblStatHigh', t.statHigh);
      setLbl('#lblStatLow', t.statLow);
      setLbl('#lblStatPrev', t.statPrev);
      setLbl('#lblStatVol', t.statVolume);
      setLbl('#lblStatAvgVol', t.statAvgVolume);
      setLbl('#lblStat52H', t.stat52High);
      setLbl('#lblStat52L', t.stat52Low);

      // Technicals Panel
      setLbl('#techTitleTxt', t.techTitle);
      setLbl('#techTimeframeTag', t.techDailyClassic);
      setLbl('#techTabPivotBtn', t.techTabPivot);
      setLbl('#techTabFiboBtn', t.techTabFibo);
      setLbl('#techTabMaBtn', t.techTabMa);
      setLbl('#techTabRsiBtn', t.techTabRsi);

      // Key Valuation
      setLbl('#valCardTitleTxt', t.valTitle);
      setLbl('#lblValPE', t.valPE); setLbl('#subValPE', t.valSubTrailing);
      setLbl('#lblValFwdPE', t.valFwdPE); setLbl('#subValFwdPE', t.valSubEst);
      setLbl('#lblValEPS', t.valEPS); setLbl('#subValEPS', t.valSubPerShare);
      setLbl('#lblValBeta', t.valBeta); setLbl('#subValBeta', t.valSubVol);
      setLbl('#lblValDivYield', t.valDivYield); setLbl('#subValDivYield', t.valSubAnnual);
      setLbl('#lblValPB', t.valPB); setLbl('#subValPB', t.valSubBook);

      // Company Info
      setLbl('#companyCardTitleTxt', t.companyTitle);
      setLbl('#lblCompIndustry', t.infoIndustry);
      setLbl('#lblCompCountry', t.infoCountry);
      setLbl('#lblCompMktCap', t.infoMarketCap);
      setLbl('#lblCompWeb', t.infoWebsite);
      setLbl('#lblCompIpo', t.infoIpoDate);

      document.querySelector('.wishlist-title').lastChild.nodeValue = t.watchlist;
      setLbl('.btn-add-wishlist .i18n-lbl', t.addCurrent);
      document.getElementById('settingsTitle').textContent = t.settingsTitle;
      document.getElementById('settingsDesc').textContent = t.settingsDesc;
      document.getElementById('settingsEmailLabel').textContent = t.settingsEmailLabel;
      setLbl('#settingsPremarketTitle', t.settingsPremarketTitle);
      setLbl('#settingsPremarketDesc', t.settingsPremarketDesc);
      setLbl('.btn-secondary .i18n-lbl', t.cancel);
      setLbl('.btn-primary .i18n-lbl', t.save);
      setLbl('#dashRefreshBtn .i18n-lbl', t.refresh);
      if (document.querySelector('.mobile-wl-header .wishlist-title')) document.querySelector('.mobile-wl-header .wishlist-title').lastChild.nodeValue = t.watchlist;

      // Alert card
      setLbl('#alertCardTitle', t.alertTitle);
      setLbl('#alertAboveBtnTxt', t.alertSet);
      setLbl('#alertBelowBtnTxt', t.alertSet);
      renderAlertEmailNote();
      renderDashboardAlerts();

      // Portfolio modal labels
      const posModalTitleEl = document.getElementById('posModalTitleText'); if (posModalTitleEl) posModalTitleEl.textContent = t.pfModalTitle;
      const posLblSym = document.getElementById('posLabelSymbol'); if (posLblSym) posLblSym.textContent = t.pfLblSymbol;
      const posLblPrc = document.getElementById('posLabelPrice'); if (posLblPrc) posLblPrc.textContent = t.pfLblPrice;
      const posLblAmt = document.getElementById('posLabelAmount'); if (posLblAmt) posLblAmt.textContent = t.pfLblAmount;
      const posLblDt = document.getElementById('posLabelDate'); if (posLblDt) posLblDt.textContent = t.pfLblDate;
      const posCancelEl = document.getElementById('posCancelBtn'); if (posCancelEl) posCancelEl.textContent = t.pfCancel;
      const posSubmitEl = document.getElementById('posSubmitText'); if (posSubmitEl) posSubmitEl.textContent = t.pfSubmit;
      // Portfolio page title
      const pfTitle = document.getElementById('pfPageTitle'); if (pfTitle) pfTitle.textContent = t.pfTitle;
      const pfAddBtn = document.querySelector('#pfAddPositionBtn span'); if (pfAddBtn) pfAddBtn.textContent = t.pfAddPos;

      // PIN Overlay labels
      setLbl('#pinTitleTxt', t.pinTitle);
      setLbl('#pinSubTxt', t.pinSubtitle);
      setLbl('#pinSubmitTxt', t.pinUnlock);
      setLbl('#pinCancelTxt', t.pinCancel);

      updateGreeting();
      updateMarketStatus();
      updateMarketClock();
      updateWishlistButton();
      updateDashboard();
      renderWishlist();
      if (S.quote) {
        renderQuote(S.quote);
        calcAndRenderTechnicals(S.quote);
      }
    }

    document.addEventListener('DOMContentLoaded', () => { initEmailJS(); initSupabase(); initApp(); setupEvents(); applyLanguage(); });

    function initApp() {
      syncThailandTime();
      setInterval(syncThailandTime, 300000); // Re-sync network time every 5 minutes
      updateMarketStatus(); setInterval(updateMarketStatus, 30000);
      updateMarketClock(); setInterval(updateMarketClock, 1000); // 1-second live clock tick
      renderWishlist(); renderSectors(); updateDashboard();

      // Load wishlist prices and sectors concurrently
      Promise.allSettled([
        updateWishlistPrices().then(updateDashboard),
        loadSectorData()
      ]);

      startAutoRefresh(); updateLastRefresh();

      // Load alerts from Supabase then subscribe for real-time cross-device sync
      loadAlerts().then(() => {
        renderDashboardAlerts();
        updateAlertStats();
        checkAndSendDailyPreMarketBriefing();
      });
      subscribeAlerts();

      // Listen for tab focus/visibility to trigger pre-market briefing if currently within active 20:15 window
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
          checkAndSendDailyPreMarketBriefing();
        }
      });
      window.addEventListener('focus', () => {
        checkAndSendDailyPreMarketBriefing();
      });

      // Initialize desktop sidebar collapse state
      const savedCollapse = localStorage.getItem('stockpulse_sidebar_collapsed');
      if (savedCollapse === '1' || (savedCollapse === null && window.innerWidth <= 1024)) {
        toggleDesktopSidebar(true);
      }
    }

    function startAutoRefresh() {
      clearInterval(S.refreshTimer); clearInterval(S.cdTimer);
      S.cd = 30; document.getElementById('countdownNum').textContent = S.cd;
      S.cdTimer = setInterval(() => { S.cd = Math.max(0, S.cd - 1); document.getElementById('countdownNum').textContent = S.cd; }, 1000);
      S.refreshTimer = setInterval(async () => {
        S.cd = 30;
        try {
          await updateWishlistPrices();
          await checkAlerts();
          checkAndSendDailyPreMarketBriefing();
          if (S.sym && S.page === 'stock') await refreshCurrentQuote();
          await loadSectorData(); updateDashboard(); updateLastRefresh();
        } catch (e) { console.error(e); }
      }, 30000);
    }

