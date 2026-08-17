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
    const url = `https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?interval=1d&range=1d&includePrePost=true`;
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
    // Yahoo returns preMarketChangePercent as a decimal (e.g. -0.012 = -1.2%), multiply by 100
    const preMarketPrice         = meta.preMarketPrice         ?? null;
    const preMarketChange        = meta.preMarketChange        ?? null;
    const preMarketChangePercent = meta.preMarketChangePercent != null
      ? meta.preMarketChangePercent * 100 : null;

    const postMarketPrice         = meta.postMarketPrice         ?? null;
    const postMarketChange        = meta.postMarketChange        ?? null;
    const postMarketChangePercent = meta.postMarketChangePercent != null
      ? meta.postMarketChangePercent * 100 : null;

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
      marketState: meta.marketState || 'CLOSED', // REGULAR | PRE | POST | CLOSED
      isThai,
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
