export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

  if (req.method === 'OPTIONS') return res.status(200).end();

  let { symbol, interval = '1d', range = '1mo' } = req.query;
  if (!symbol) return res.status(400).json({ error: 'Symbol parameter is required' });
  symbol = symbol.trim().toUpperCase();

  const FINNHUB_KEY = 'd9vjs4pr01qgk75onskgd9vjs4pr01qgk75onsl0';
  const isThai = symbol.includes('.BK') || symbol.includes('.TH');

  // Map frontend interval/range to Finnhub resolution + unix time window
  function getFinnhubParams() {
    const now = Math.floor(Date.now() / 1000);
    switch (range) {
      case '1d':  return { resolution: '5',  from: now - 2   * 86400, to: now };
      case '5d':  return { resolution: '60', from: now - 8   * 86400, to: now };
      case '1mo': return { resolution: 'D',  from: now - 40  * 86400, to: now };
      case '6mo': return { resolution: 'D',  from: now - 185 * 86400, to: now };
      case 'ytd': {
        const startOfYear = Math.floor(new Date(new Date().getFullYear(), 0, 1).getTime() / 1000);
        return { resolution: 'D', from: startOfYear, to: now };
      }
      case '1y':  return { resolution: 'D',  from: now - 370 * 86400, to: now };
      case '5y':  return { resolution: 'W',  from: now - 5 * 365 * 86400, to: now };
      default:    return { resolution: 'D',  from: now - 40  * 86400, to: now };
    }
  }

  async function fetchFinnhub(sym) {
    const { resolution, from, to } = getFinnhubParams();
    const url = `https://finnhub.io/api/v1/stock/candle?symbol=${encodeURIComponent(sym)}&resolution=${resolution}&from=${from}&to=${to}&token=${FINNHUB_KEY}`;
    try {
      const r = await fetch(url, { headers: { Accept: 'application/json' } });
      if (!r.ok) return null;
      const d = await r.json();
      if (!d || d.s === 'no_data' || !Array.isArray(d.t) || !d.t.length) return null;
      return d.t
        .map((t, i) => ({
          time:   t,
          open:   d.o?.[i] ?? d.c[i],
          high:   d.h?.[i] ?? d.c[i],
          low:    d.l?.[i] ?? d.c[i],
          close:  d.c[i],
          volume: d.v?.[i] ?? 0,
        }))
        .filter(x => x.close != null);
    } catch (e) {
      console.error('Finnhub fetch error:', e.message);
      return null;
    }
  }

  async function fetchYahoo(sym) {
    // includePrePost=false ensures chart only displays regular market session (e.g. 20:30-03:00 Thai time for US)
    const prePost = '&includePrePost=false';
    const url = `https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?interval=${interval}&range=${range}${prePost}`;

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
        const r = await fetch(url, { headers });
        if (!r.ok) continue;
        const d = await r.json();
        const result = d?.chart?.result?.[0];
        if (!result?.timestamp?.length) continue;
        const q = result.indicators?.quote?.[0];
        if (!q) continue;
        const parsed = result.timestamp
          .map((t, i) => {
            const close = q.close?.[i];
            if (close == null) return null;
            return {
              time:   t,
              open:   q.open?.[i]  ?? close,
              high:   q.high?.[i]  ?? close,
              low:    q.low?.[i]   ?? close,
              close,
              volume: q.volume?.[i] ?? 0,
            };
          })
          .filter(Boolean);
        if (parsed.length > 0) return parsed;
      } catch (e) {
        console.error('Yahoo fetch attempt error:', e.message);
      }
    }
    return null;
  }

  try {
    let data = null;

    // Primary: Yahoo Finance (accurate interval candles for US & Thai stocks)
    data = await fetchYahoo(symbol);
    if (data?.length) console.log(`Yahoo: ${symbol} → ${data.length} candles`);

    // Fallback 1: Try .BK suffix for Thai stocks typed without it
    if (!data?.length && !symbol.includes('.')) {
      data = await fetchYahoo(`${symbol}.BK`);
      if (data?.length) {
        symbol = `${symbol}.BK`;
        console.log(`Yahoo (.BK): ${symbol} → ${data.length} candles`);
      }
    }

    // Fallback 2: Finnhub for US stocks if Yahoo fails
    if (!data?.length && !isThai) {
      data = await fetchFinnhub(symbol);
      if (data?.length) console.log(`Finnhub fallback: ${symbol} → ${data.length} candles`);
    }

    if (!data?.length) {
      console.error(`No chart data found for ${symbol}`);
      return res.status(404).json({ error: `Chart data not found for ${symbol}` });
    }

    res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=120');
    return res.status(200).json({ symbol, data });
  } catch (error) {
    console.error('Chart API error:', error);
    return res.status(500).json({ error: 'Failed to fetch chart data', details: error.message });
  }
}
