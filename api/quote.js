export default async function handler(req, res) {
  // CORS Headers
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  let { symbol } = req.query;
  if (!symbol) {
    return res.status(400).json({ error: 'Symbol parameter is required' });
  }

  symbol = symbol.trim().toUpperCase();

  // Helper to fetch from Yahoo Finance Chart API
  async function fetchYahoo(sym) {
    // includePrePost=true fetches pre-market and after-hours data in meta
    const url = `https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?interval=1m&range=1d&includePrePost=true`;
    const headerSets = [
      {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept': 'application/json, text/plain, */*',
        'Accept-Language': 'en-US,en;q=0.9',
        'Referer': 'https://finance.yahoo.com',
        'Origin': 'https://finance.yahoo.com',
      },
      {
        'User-Agent': 'python-requests/2.31.0',
        'Accept': '*/*',
      }
    ];
    for (const headers of headerSets) {
      try {
        const response = await fetch(url, { headers });
        if (!response.ok) continue;
        const data = await response.json();
        const result = data?.chart?.result?.[0];
        if (result?.meta) return result;
      } catch {}
    }
    return null;
  }

  try {
    // 1. Try symbol directly
    let yResult = await fetchYahoo(symbol);

    // 2. If not found and doesn't contain a dot, try with .BK (Thai SET market)
    if (!yResult && !symbol.includes('.')) {
      yResult = await fetchYahoo(`${symbol}.BK`);
      if (yResult) {
        symbol = `${symbol}.BK`;
      }
    }

    if (!yResult) {
      return res.status(404).json({ error: `Stock not found: ${symbol}` });
    }

    const meta = yResult.meta;
    const curPrice = meta.regularMarketPrice ?? meta.chartPreviousClose ?? 0;
    const prevClose = meta.chartPreviousClose ?? meta.previousClose ?? curPrice;
    const change = curPrice - prevClose;
    const changePercent = prevClose ? (change / prevClose) * 100 : 0;
    const isThai = meta.currency === 'THB' || symbol.endsWith('.BK') || meta.exchangeName === 'SET';

    // Extended-hours prices (pre-market / after-hours)
    let preMarketPrice         = meta.preMarketPrice         ?? null;
    let preMarketChange        = meta.preMarketChange        ?? null;
    let preMarketChangePercent = meta.preMarketChangePercent != null
      ? meta.preMarketChangePercent * 100 : null;

    let postMarketPrice         = meta.postMarketPrice         ?? null;
    let postMarketChange        = meta.postMarketChange        ?? null;
    let postMarketChangePercent = meta.postMarketChangePercent != null
      ? meta.postMarketChangePercent * 100 : null;

    // Fallback: extract extended hours from 1m chart candles if missing from meta
    if (!preMarketPrice && !postMarketPrice && yResult.timestamp && yResult.indicators?.quote?.[0]?.close) {
      const timestamps = yResult.timestamp;
      const closes = yResult.indicators.quote[0].close;
      const periods = meta.currentTradingPeriod;
      for (let i = timestamps.length - 1; i >= 0; i--) {
        const t = timestamps[i];
        const c = closes[i];
        if (c == null) continue;
        if (periods?.pre && t >= periods.pre.start && t < periods.pre.end) {
          if (preMarketPrice === null) preMarketPrice = c;
        } else if (periods?.post && t >= periods.post.start && t < periods.post.end) {
          if (postMarketPrice === null) postMarketPrice = c;
        }
      }
      
      if (preMarketPrice !== null && preMarketChange === null) {
        preMarketChange = preMarketPrice - curPrice;
        preMarketChangePercent = curPrice ? (preMarketChange / curPrice) * 100 : 0;
      }
      if (postMarketPrice !== null && postMarketChange === null) {
        postMarketChange = postMarketPrice - curPrice;
        postMarketChangePercent = curPrice ? (postMarketChange / curPrice) * 100 : 0;
      }
    }

    // Determine actual Market State based on current time
    let computedMarketState = 'CLOSED';
    const nowSec = Math.floor(Date.now() / 1000);
    const periods = meta.currentTradingPeriod;
    if (periods) {
      if (periods.pre && nowSec >= periods.pre.start && nowSec < periods.pre.end) {
        computedMarketState = 'PRE';
      } else if (periods.regular && nowSec >= periods.regular.start && nowSec < periods.regular.end) {
        computedMarketState = 'REGULAR';
      } else if (periods.post && nowSec >= periods.post.start && nowSec < periods.post.end) {
        computedMarketState = 'POST';
      }
    }

    const responsePayload = {
      symbol: meta.symbol || symbol,
      name: meta.longName || meta.shortName || symbol,
      shortName: meta.shortName || symbol,
      currency: meta.currency || (isThai ? 'THB' : 'USD'),
      exchange: meta.exchangeName || (isThai ? 'SET' : 'US'),
      // Regular market
      c:  curPrice,
      d:  change,
      dp: changePercent,
      h:  meta.regularMarketDayHigh ?? curPrice,
      l:  meta.regularMarketDayLow  ?? curPrice,
      o:  meta.regularMarketOpen    ?? curPrice,
      pc: prevClose,
      t:  meta.regularMarketTime    || Math.floor(Date.now() / 1000),
      marketCap: meta.marketCap     || 0,
      marketState: computedMarketState, // computed from timestamps
      isThai,
      // Extended Metrics & Fundamentals from Yahoo meta
      v: meta.regularMarketVolume ?? null,
      avgVolume: meta.averageDailyVolume3Month ?? meta.averageDailyVolume10Day ?? null,
      fiftyTwoWeekHigh: meta.fiftyTwoWeekHigh ?? null,
      fiftyTwoWeekLow: meta.fiftyTwoWeekLow ?? null,
      trailingPE: meta.trailingPE ?? null,
      epsTrailingTwelveMonths: meta.epsTrailingTwelveMonths ?? null,
      beta: meta.beta ?? null,
      dividendYield: meta.dividendYield ?? null,
      priceToBook: meta.priceToBook ?? null,
      forwardPE: meta.forwardPE ?? null,
      // Pre-market
      preMarketPrice,
      preMarketChange,
      preMarketChangePercent,
      // After-hours / post-market
      postMarketPrice,
      postMarketChange,
      postMarketChangePercent,
    };

    // Cache on Vercel Edge/Serverless CDN for 10 seconds
    res.setHeader('Cache-Control', 's-maxage=10, stale-while-revalidate=30');
    return res.status(200).json(responsePayload);
  } catch (error) {
    console.error('API Quote error:', error);
    return res.status(500).json({ error: 'Failed to fetch stock data', details: error.message });
  }
}
