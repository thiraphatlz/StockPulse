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

  const { q } = req.query;
  if (!q || !q.trim()) {
    return res.status(200).json({ result: [] });
  }

  const query = q.trim();

  try {
    const url = `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(query)}&quotesCount=10&newsCount=0`;
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json'
      }
    });

    if (!response.ok) {
      return res.status(500).json({ error: 'Search upstream error', result: [] });
    }

    const data = await response.json();
    const rawQuotes = data.quotes || [];

    // Filter and map to friendly format
    const results = rawQuotes
      .filter(item => {
        // Exclude unwanted instrument types like option, future if needed, or keep equity/etf/index/mutualfund
        return ['EQUITY', 'ETF', 'INDEX', 'MUTUALFUND', 'CURRENCY'].includes(item.quoteType);
      })
      .map(item => {
        const isThai = item.exchange === 'SET' || item.symbol?.endsWith('.BK');
        const type = isThai ? 'Thai Stock (SET)' : (item.typeDisp || item.quoteType || 'Stock');
        return {
          symbol: item.symbol,
          description: item.longname || item.shortname || item.symbol,
          type: type,
          exchange: item.exchDisp || item.exchange || '',
          isThai: isThai
        };
      });

    // Cache on Vercel CDN for 60 seconds
    res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=120');
    return res.status(200).json({ result: results });
  } catch (error) {
    console.error('API Search error:', error);
    return res.status(500).json({ error: 'Failed to search stocks', result: [] });
  }
}
