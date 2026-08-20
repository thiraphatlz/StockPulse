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
    const urls = [
      `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(query)}&quotesCount=8&newsCount=0`
    ];

    // If query does not contain dot, also query with .BK to discover Thai stocks reliably
    if (!query.includes('.') && query.length <= 8) {
      urls.push(`https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(query + '.BK')}&quotesCount=5&newsCount=0`);
    }

    const responses = await Promise.allSettled(
      urls.map(url =>
        fetch(url, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'application/json'
          }
        }).then(r => (r.ok ? r.json() : { quotes: [] }))
      )
    );

    const rawQuotes = [];
    const seen = new Set();

    for (const res of responses) {
      if (res.status === 'fulfilled' && Array.isArray(res.value?.quotes)) {
        for (const q of res.value.quotes) {
          if (!seen.has(q.symbol)) {
            seen.add(q.symbol);
            rawQuotes.push(q);
          }
        }
      }
    }

    // Filter and map to friendly format
    const results = rawQuotes
      .filter(item => {
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

    // Prioritize exact or SET matches when searching
    results.sort((a, b) => {
      const qUpper = query.toUpperCase();
      const aExact = a.symbol.toUpperCase() === qUpper || a.symbol.toUpperCase() === qUpper + '.BK';
      const bExact = b.symbol.toUpperCase() === qUpper || b.symbol.toUpperCase() === qUpper + '.BK';
      if (aExact && !bExact) return -1;
      if (!aExact && bExact) return 1;

      const aThai = a.isThai;
      const bThai = b.isThai;
      if (aThai && !bThai) return -1;
      if (!aThai && bThai) return 1;
      return 0;
    });

    // Cache on Vercel CDN for 60 seconds
    res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=120');
    return res.status(200).json({ result: results.slice(0, 10) });
  } catch (error) {
    console.error('API Search error:', error);
    return res.status(500).json({ error: 'Failed to search stocks', result: [] });
  }
}
