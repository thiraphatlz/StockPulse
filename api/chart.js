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

  let { symbol, interval = '1d', range = '1mo' } = req.query;
  if (!symbol) {
    return res.status(400).json({ error: 'Symbol parameter is required' });
  }

  symbol = symbol.trim().toUpperCase();

  async function fetchYahooChart(sym, intv, rng) {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?interval=${intv}&range=${rng}`;
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json'
      }
    });
    if (!response.ok) return null;
    const data = await response.json();
    return data?.chart?.result?.[0] || null;
  }

  try {
    let result = await fetchYahooChart(symbol, interval, range);
    
    // Fallback to SET market if direct symbol fails and no dot is present
    if (!result && !symbol.includes('.')) {
      result = await fetchYahooChart(`${symbol}.BK`, interval, range);
      if (result) {
        symbol = `${symbol}.BK`;
      }
    }

    if (!result || !result.timestamp || !result.indicators.quote[0]) {
      return res.status(404).json({ error: `Chart data not found for ${symbol}` });
    }

    const { timestamp } = result;
    const quote = result.indicators.quote[0];
    const open = quote.open;
    const high = quote.high;
    const low = quote.low;
    const close = quote.close;

    // Filter out null values
    const data = timestamp.map((t, index) => {
      if (open[index] === null || high[index] === null || low[index] === null || close[index] === null) return null;
      return {
        time: t,
        open: open[index],
        high: high[index],
        low: low[index],
        close: close[index],
      };
    }).filter(item => item !== null);

    res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=120');
    return res.status(200).json({ symbol, data });
  } catch (error) {
    console.error('API Chart error:', error);
    return res.status(500).json({ error: 'Failed to fetch chart data', details: error.message });
  }
}
