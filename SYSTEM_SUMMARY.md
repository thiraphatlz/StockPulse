# StockPulse System Documentation

**Project Name:** StockPulse  
**Version:** 1.0.0  
**Type:** Personal Stock Dashboard & Pre-Market Briefing System  
**Architecture:** Serverless API + React Frontend + Automated Cron Jobs  
**Date Generated:** 2026-08-29

---

## 1. Project Overview

StockPulse is a comprehensive stock market dashboard and automation system that provides:
- Real-time stock price tracking (US and Thai markets)
- Interactive stock charts with multiple timeframes
- Sector flow analysis and pre-market briefings
- Automated daily pre-market email alerts via GitHub Actions
- Support for Thai stocks (SET market) and US stocks

The system combines:
- **Frontend**: Single-page application (index.html) with responsive UI
- **Backend APIs**: Serverless functions for real-time data fetching
- **Automation**: Scheduled cron jobs for pre-market briefings
- **Data Integration**: Multiple data sources (Yahoo Finance, Finnhub, Supabase)

---

## 2. System Architecture

### Tech Stack
- **Frontend**: Vanilla JavaScript + HTML5 + CSS3
- **Backend APIs**: Node.js serverless functions (Vercel)
- **Data Sources**: 
  - Yahoo Finance API (primary)
  - Finnhub API (fallback)
  - Supabase (duplicate send prevention)
- **Email Service**: EmailJS
- **Charting**: Lightweight Charts library
- **CI/CD**: GitHub Actions

### Directory Structure
```
C:\Projects\Personal/
├── index.html                          # Main frontend application
├── package.json                         # Project metadata
├── README.md                            # Project description
├── .gitattributes                       # Git configuration
├── api/                                 # Serverless API endpoints
│   ├── quote.js                         # Stock quote endpoint
│   ├── search.js                        # Stock search endpoint
│   ├── chart.js                         # Chart data endpoint
│   ├── time.js                          # Server time endpoint
│   └── premarket-cron.js               # Pre-market briefing trigger
├── scripts/
│   └── send_premarket_briefing.js      # Pre-market briefing generator
└── .github/
    └── workflows/
        └── premarket_briefing.yml       # GitHub Actions workflow
```

---

## 3. Frontend Application (index.html)

### Purpose
Interactive stock dashboard for real-time tracking and analysis of US and Thai market stocks.

### Key Features
1. **Real-Time Stock Quotes**
   - Current price, change %, volume
   - Pre-market and post-market prices
   - Extended hours pricing

2. **Stock Search**
   - Autocomplete search with symbol matching
   - Support for both US (nasdaq, NYSE) and Thai (SET) stocks
   - Prioritizes exact matches and SET stocks

3. **Interactive Charts**
   - Multiple timeframes: 1D, 5D, 1M, 6M, YTD, 1Y, 5Y
   - Lightweight Charts library for performance
   - Candlestick charting
   - Volume visualization

4. **Watchlist Management**
   - Add/remove stocks to watchlist
   - Persistent storage (localStorage)
   - Sort by various metrics

5. **Sector Overview**
   - 10 major sectors (Tech, Finance, Healthcare, Energy, Consumer, Industrial, Materials, Real Estate, Utilities, Comm Services)
   - Sector ETF performance tracking
   - Flow analysis

6. **UI/UX**
   - Dark theme with purple accent (#7c3aed)
   - Responsive design for mobile and desktop
   - Real-time price color coding (green for up, red for down)
   - Smooth animations and transitions
   - Custom scrollbars

### Design System
- **Colors**: Dark theme with accent purple
  - Primary Background: #08080c
  - Card Background: #13131b
  - Accent: #7c3aed (Purple)
  - Success: #10b981 (Green)
  - Error: #ef4444 (Red)

- **Typography**: 
  - Primary Font: Inter (sans-serif)
  - Code Font: JetBrains Mono (monospace)

- **Spacing & Radius**:
  - Default border-radius: 12px
  - Shadow effects for depth
  - Consistent padding/margins

### External Dependencies
- EmailJS (email service integration)
- Supabase JS (database for alerts)
- Lightweight Charts (charting library)
- Google Fonts (Inter, JetBrains Mono)

---

## 4. API Endpoints

### 4.1 `/api/quote.js` - Stock Quote Endpoint

**Purpose**: Fetch real-time stock prices and fundamental metrics  
**Method**: GET  
**Parameters**:
- `symbol` (required): Stock ticker symbol (e.g., 'AAPL', 'MSFT', 'CPALL.BK')

**Response Structure**:
```javascript
{
  symbol: string,
  name: string,
  shortName: string,
  currency: string,
  exchange: string,
  
  // Regular market data
  c: number,              // Current price
  d: number,              // Change amount
  dp: number,             // Change percent
  h: number,              // Day high
  l: number,              // Day low
  o: number,              // Open price
  pc: number,             // Previous close
  t: number,              // Timestamp
  
  // Extended hours
  preMarketPrice: number,
  preMarketChange: number,
  preMarketChangePercent: number,
  postMarketPrice: number,
  postMarketChange: number,
  postMarketChangePercent: number,
  
  // Fundamentals
  v: number,              // Volume
  avgVolume: number,      // Average volume
  fiftyTwoWeekHigh: number,
  fiftyTwoWeekLow: number,
  trailingPE: number,
  epsTrailingTwelveMonths: number,
  beta: number,
  dividendYield: number,
  priceToBook: number,
  forwardPE: number,
  
  marketCap: number,
  marketState: string,    // 'PRE', 'REGULAR', 'POST', 'CLOSED'
  isThai: boolean
}
```

**Data Sources**:
1. Yahoo Finance (primary) - real-time quotes, extended hours
2. Finnhub API (fallback) - fundamental metrics, PE ratios
3. Supports automatic `.BK` suffix addition for Thai stocks

**Caching**: 10 seconds (Vercel Edge CDN)

**Special Features**:
- Automatic Thai market detection (THB currency, SET exchange, .BK suffix)
- Extended hours price extraction from 1-minute candle data
- Multiple User-Agent rotation for reliability
- Fallback chain: Direct symbol → symbol.BK → Finnhub metrics

---

### 4.2 `/api/search.js` - Stock Search Endpoint

**Purpose**: Search for stocks by symbol or company name  
**Method**: GET  
**Parameters**:
- `q` (required): Search query (symbol or company name)

**Response Structure**:
```javascript
{
  result: [
    {
      symbol: string,
      description: string,
      type: string,           // 'Stock', 'ETF', 'Thai Stock (SET)', etc.
      exchange: string,
      isThai: boolean
    }
  ]
}
```

**Features**:
- Multi-source search (Yahoo Finance endpoints)
- Automatic `.BK` suffix detection for Thai stocks
- Deduplication of results
- Prioritization: exact matches → Thai stocks → others
- Filters by quote type (EQUITY, ETF, INDEX, MUTUALFUND, CURRENCY)

**Caching**: 60 seconds (Vercel CDN)

**Supported Quote Types**:
- EQUITY (stocks)
- ETF (exchange-traded funds)
- INDEX (market indices)
- MUTUALFUND (mutual funds)
- CURRENCY (forex pairs)

---

### 4.3 `/api/chart.js` - Chart Data Endpoint

**Purpose**: Fetch OHLCV (Open, High, Low, Close, Volume) candle data  
**Method**: GET  
**Parameters**:
- `symbol` (required): Stock ticker symbol
- `interval` (optional, default: '1d'): Candle interval
- `range` (optional, default: '1mo'): Time range

**Supported Ranges**:
- `1d`: 1 day (5-minute candles)
- `5d`: 5 days (1-hour candles)
- `1mo`: 1 month (daily candles)
- `6mo`: 6 months (daily candles)
- `ytd`: Year-to-date (daily candles)
- `1y`: 1 year (daily candles)
- `5y`: 5 years (weekly candles)

**Response Structure**:
```javascript
{
  symbol: string,
  data: [
    {
      time: number,       // Unix timestamp
      open: number,
      high: number,
      low: number,
      close: number,
      volume: number
    }
  ]
}
```

**Data Retrieval Strategy**:
1. **Primary**: Yahoo Finance (accurate intervals, reliable)
2. **Fallback 1**: Try `.BK` suffix for Thai stocks
3. **Fallback 2**: Finnhub for US stocks if Yahoo fails
4. **Special handling**: excludes pre/post-market data for clean charts

**Caching**: 60 seconds (Vercel CDN)

---

### 4.4 `/api/time.js` - Server Time Endpoint

**Purpose**: Get synchronized server time across timezones  
**Method**: GET  
**Parameters**: None

**Response Structure**:
```javascript
{
  unixtime: number,           // Unix timestamp (milliseconds)
  utc: string,                // ISO 8601 UTC datetime
  bkk: string,                // ISO 8601 Bangkok time (UTC+7)
  timezone: string            // 'Asia/Bangkok'
}
```

**Purpose**: Ensures client-server time synchronization, especially important for pre-market detection

---

### 4.5 `/api/premarket-cron.js` - Pre-Market Briefing Trigger

**Purpose**: Trigger pre-market briefing generation and email sending  
**Method**: GET, POST  
**Parameters**:
- `force` (optional): Set to 'true' or '1' to force send (bypass duplicate check)
- `email` (optional): Override recipient email

**Response Structure**:
```javascript
{
  success: boolean,
  message: string,
  email: string,
  reportDate: string,
  leadingSector: string,      // "Technology (XLK) +2.45%"
  laggingSector: string
}
```

**Features**:
- Checks Supabase for duplicate sends (prevents duplicate emails)
- Can force resend with `?force=true`
- Customizable recipient email
- Returns summary of sector performance

**Error Handling**:
```javascript
{
  success: false,
  error: string
}
```

---

## 5. Pre-Market Briefing System

### 5.1 Purpose
Automated daily email briefing with:
- 10 sector performance overview
- Top 3 gainers and losers per sector
- Sector ETF prices and changes
- Pre-market trading insights

### 5.2 Data Flow

1. **Schedule Trigger**
   - GitHub Actions runs at 13:15 UTC (EDT) or 14:15 UTC (EST)
   - Weekdays only (Monday-Friday)
   - Can also be manually triggered via workflow_dispatch

2. **Briefing Generation** (`send_premarket_briefing.js`)
   - Fetches 10 sector ETF quotes (XLK, XLF, XLV, XLE, XLY, XLI, XLB, XLRE, XLU, XLC)
   - Ranks sectors by performance change %
   - For each sector, fetches constituent stocks
   - Extracts top 3 gainers and top 3 losers per sector
   - Generates HTML email with formatted tables and badges

3. **Duplicate Prevention**
   - Checks Supabase table `alerts` with symbol `__SYS_PREMARKET__`
   - Uses date key (YYYY-MM-DD) to prevent duplicate daily sends
   - Can be overridden with `force=true`

4. **Email Delivery**
   - Uses EmailJS service
   - Sends formatted HTML email with:
     - Sector performance table
     - Top movers by sector with color coding
     - Full text summary in Thai
   - Recipient: configurable via `ALERT_EMAIL` environment variable

### 5.3 Sector Configuration

10 monitored sectors with ETF tickers and constituent stocks:

```javascript
SECTORS = [
  {
    id: 'tech',
    name: 'Technology',
    etf: 'XLK',
    tickers: ['AAPL', 'MSFT', 'NVDA', 'META', 'GOOGL', 'AVGO', 'AMD', 'INTC', 'ORCL', 'CRM']
  },
  {
    id: 'finance',
    name: 'Financials',
    etf: 'XLF',
    tickers: ['JPM', 'BAC', 'WFC', 'GS', 'MS', 'V', 'MA', 'AXP', 'BLK']
  },
  {
    id: 'health',
    name: 'Healthcare',
    etf: 'XLV',
    tickers: ['JNJ', 'UNH', 'PFE', 'ABBV', 'MRK', 'LLY', 'TMO', 'AMGN']
  },
  {
    id: 'energy',
    name: 'Energy',
    etf: 'XLE',
    tickers: ['XOM', 'CVX', 'COP', 'EOG', 'SLB', 'MPC', 'OXY']
  },
  {
    id: 'consumer',
    name: 'Consumer',
    etf: 'XLY',
    tickers: ['AMZN', 'HD', 'NKE', 'MCD', 'SBUX', 'TGT', 'LOW']
  },
  {
    id: 'industrial',
    name: 'Industrials',
    etf: 'XLI',
    tickers: ['CAT', 'HON', 'GE', 'UPS', 'RTX', 'BA', 'DE']
  },
  {
    id: 'materials',
    name: 'Materials',
    etf: 'XLB',
    tickers: ['LIN', 'APD', 'ECL', 'NEM', 'FCX', 'NUE']
  },
  {
    id: 'realestate',
    name: 'Real Estate',
    etf: 'XLRE',
    tickers: ['PLD', 'AMT', 'EQIX', 'PSA', 'O', 'SPG']
  },
  {
    id: 'utilities',
    name: 'Utilities',
    etf: 'XLU',
    tickers: ['NEE', 'DUK', 'SO', 'D', 'SRE', 'AEP']
  },
  {
    id: 'comm',
    name: 'Comm Services',
    etf: 'XLC',
    tickers: ['META', 'GOOGL', 'NFLX', 'DIS', 'VZ', 'T']
  }
]
```

### 5.4 Key Functions

#### `generatePreMarketReportData()`
- Fetches ETF quotes for all 10 sectors
- Sorts sectors by performance
- Fetches individual stock quotes for all constituent stocks
- Generates HTML and text summaries
- Returns structured report data

#### `sendEmailJSBriefing(report, targetEmail)`
- Sends email via EmailJS REST API
- Uses pre-configured template (template_2mgjigz)
- Syncs sent status to Supabase
- Logs delivery status

#### `checkPremarketSentInSupabase(dateKey)`
- Checks if briefing was already sent today
- Returns boolean
- Supports force override

#### `syncPremarketSentToSupabase(dateKey, timeStr)`
- Records briefing send to Supabase
- Prevents duplicate sends
- Logs sync status

#### `batchFetch(symbols, chunkSize)`
- Fetches quotes for multiple symbols
- Chunks requests (default 5 symbols per batch)
- Handles failed requests gracefully
- Returns object map of symbol → quote data

### 5.5 DST and Timezone Handling

- **DST Detection**: Checks if US Eastern Time is in EDT (Daylight) or EST (Standard)
- **Schedule Times**:
  - EDT (summer): 13:15 UTC = 20:15 Bangkok time
  - EST (winter): 14:15 UTC = 21:15 Bangkok time
- **Timezone Support**:
  - UTC/ISO 8601 timestamps
  - Bangkok (Asia/Bangkok) local time formatting
  - Thai locale formatting for date/time

---

## 6. GitHub Actions Workflow

**File**: `.github/workflows/premarket_briefing.yml`

### Trigger Schedule
```yaml
on:
  schedule:
    - cron: '15 13 * * 1-5'  # 13:15 UTC (EDT time)
    - cron: '15 14 * * 1-5'  # 14:15 UTC (EST time)
  workflow_dispatch:         # Manual trigger from GitHub UI
```

### Execution Steps
1. Checkout repository (v4)
2. Setup Node.js 20
3. Run `node scripts/send_premarket_briefing.js`
   - Includes DST safety guards
   - Prevents execution outside pre-market hours (±90 min tolerance)
   - Checks for duplicate sends

### Environment Variables
```yaml
EMAILJS_PUBLIC_KEY           # EmailJS public key
EMAILJS_SERVICE_ID           # EmailJS service identifier
EMAILJS_PREMARKET_TEMPLATE_ID # Email template ID
ALERT_EMAIL                   # Recipient email address
```

All stored as GitHub Secrets with fallback defaults in code.

---

## 7. Data Integration

### Data Sources Hierarchy

#### Stock Quotes (Quote API)
1. Yahoo Finance Chart API (primary)
2. Finnhub API (fallback for fundamentals)
3. Automatic `.BK` suffix handling for Thai stocks

#### Chart Data (Chart API)
1. Yahoo Finance (accurate intervals)
2. Yahoo Finance with `.BK` suffix (Thai stocks)
3. Finnhub API (US stocks fallback)

#### Search (Search API)
1. Yahoo Finance search endpoint
2. Dual queries (standard + .BK for Thai discovery)
3. Deduplication and prioritization

### External APIs Used

**Yahoo Finance**
- Endpoints:
  - `/v8/finance/chart/` - OHLCV data, quotes, extended hours
  - `/v1/finance/search` - stock search
- Rate limits: Handled via User-Agent rotation
- Headers: Browser-like headers to avoid blocking

**Finnhub**
- Endpoints:
  - `/api/v1/stock/candle` - OHLCV data
  - `/api/v1/stock/metric` - fundamental metrics
- API Key: `d9vjs4pr01qgk75onskgd9vjs4pr01qgk75onsl0`
- Rate limits: 60 requests/minute

**EmailJS**
- Service ID: `service_u55ha9b`
- Template ID: `template_2mgjigz`
- Public Key: `8EBack4zwyOa1x49O`
- Endpoint: `https://api.emailjs.com/api/v1.0/email/send`

**Supabase**
- URL: `https://pxxtyzphnbbxrogikotc.supabase.co`
- Project: StockPulse
- Table: `alerts` (for duplicate send tracking)
- Authentication: Anonymous key (restricted to alerts table)

---

## 8. Key Features & Functions

### Frontend Features

1. **Stock Search & Selection**
   - Real-time autocomplete
   - Debounced search (300ms)
   - Priority ranking (exact matches, Thai stocks first)
   - Max 10 results per search

2. **Real-Time Price Display**
   - Current price with symbol
   - Change amount and percent
   - Color-coded (green/red)
   - Market state indicator (PRE/REGULAR/POST/CLOSED)

3. **Extended Hours Tracking**
   - Pre-market prices and changes
   - Post-market (after-hours) prices and changes
   - Percent changes calculated relative to regular close

4. **Interactive Charts**
   - Lightweight Charts integration
   - Candlestick rendering
   - Volume bars
   - Responsive sizing
   - Touch/mouse interactions

5. **Watchlist Management**
   - Add/remove stocks
   - Persistent storage via localStorage
   - Quick access to favorite stocks
   - Summary view of all watchlist stocks

6. **Sector Analysis**
   - 10-sector overview dashboard
   - Sector ETF performance tracking
   - Flow analysis (leading/lagging sectors)
   - Per-sector stock rankings

### Backend Features

1. **Data Aggregation**
   - Multiple data source fallbacks
   - Intelligent caching strategy
   - CORS-enabled for cross-origin access

2. **Reliability**
   - User-Agent rotation
   - Fallback mechanisms
   - Error handling and logging
   - Timeout management

3. **Performance**
   - Edge CDN caching (Vercel)
   - Stale-while-revalidate caching
   - Chunked batch fetching
   - Efficient JSON responses

4. **Automation**
   - Scheduled cron jobs
   - Duplicate send prevention
   - Manual override capability
   - Comprehensive logging

---

## 9. Configuration & Environment

### Package.json
```json
{
  "name": "stockpulse",
  "version": "1.0.0",
  "private": true,
  "type": "module"
}
```

### Environment Variables
```
EMAILJS_PUBLIC_KEY           # EmailJS authentication
EMAILJS_SERVICE_ID           # EmailJS service ID
EMAILJS_PREMARKET_TEMPLATE_ID # Email template
ALERT_EMAIL                   # Recipient email (default: thiraphatlaohiao1@gmail.com)
SUPABASE_URL                  # Database URL
SUPABASE_ANON                 # Supabase anonymous key
```

### Hardcoded Credentials (In Code)
- Finnhub API Key: `d9vjs4pr01qgk75onskgd9vjs4pr01qgk75onsl0`
- EmailJS Public Key: `8EBack4zwyOa1x49O`
- EmailJS Service ID: `service_u55ha9b`
- Supabase URL and keys (public, anonymous-only access)

---

## 10. Security Considerations

### Current Implementation
- CORS enabled for all origins (`Access-Control-Allow-Origin: *`)
- Public API keys in code (EmailJS, Finnhub, Supabase)
- Anonymous Supabase access (restricted to alerts table)
- Environment variable support for credentials

### Recommendations
1. Move hardcoded API keys to environment variables
2. Implement rate limiting on API endpoints
3. Consider IP whitelisting for sensitive operations
4. Use CORS middleware selectively
5. Add request validation and sanitization

---

## 11. Error Handling

### API Error Responses
```javascript
{
  error: string,           // Error message
  details: string          // Additional error details
}
```

### Fallback Strategies
1. **Quote Errors**: Return last known price or null
2. **Chart Errors**: Try alternative data source
3. **Search Errors**: Return empty results
4. **Email Errors**: Log and notify via console

### Timeout Handling
- Yahoo Finance requests: 6-second timeout
- Batch fetch: Multiple attempts with Promise.allSettled
- Failed requests: Skip and continue with partial results

---

## 12. Deployment & Hosting

### Deployment Platform
- **Vercel** (serverless functions)
- Node.js 20 runtime
- Edge CDN caching enabled

### GitHub Integration
- GitHub Actions for automated briefings
- Workflow triggers on schedule (cron)
- Manual workflow dispatch available
- Checkout and setup automation

### Database
- **Supabase** for duplicate send tracking
- Table: `alerts` with structure:
  - symbol: string (unique key)
  - direction: string
  - price: number
  - name: string (stores date|time)

---

## 13. Future Enhancement Opportunities

1. **Real-Time WebSocket Updates**
   - WebSocket connection for live price updates
   - Reduce polling frequency

2. **Advanced Analytics**
   - Technical indicators (RSI, MACD, Bollinger Bands)
   - Volume analysis
   - Pattern recognition

3. **Portfolio Tracking**
   - Position management
   - P&L calculations
   - Asset allocation

4. **Notifications**
   - Price alerts
   - Volume spikes
   - Technical levels

5. **Thai Market Integration**
   - SET-specific features
   - Thai stock filtering
   - Baht currency support

6. **Mobile App**
   - React Native version
   - Native notifications
   - Offline support

---

## Conclusion

StockPulse is a well-architected stock market dashboard combining:
- **Real-time data** from multiple reliable sources
- **Automated intelligence** via pre-market briefings
- **User-friendly interface** with dark theme design
- **Robust backend** with fallback mechanisms and caching
- **Scalable infrastructure** using serverless architecture

The system successfully bridges US and Thai equity markets, providing comprehensive market insights and automated analysis.
