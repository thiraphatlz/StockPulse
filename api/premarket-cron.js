import { generatePreMarketReportData, sendEmailJSBriefing } from '../scripts/send_premarket_briefing.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const report = await generatePreMarketReportData();
    const targetEmail = req.query.email || process.env.ALERT_EMAIL || 'thiraphatlaohiao1@gmail.com';
    await sendEmailJSBriefing(report, targetEmail);

    return res.status(200).json({
      success: true,
      message: 'Pre-Market Briefing sent successfully',
      email: targetEmail,
      reportDate: report.dateStr + ' • ' + report.timeStr,
      leadingSector: `${report.leadingSector.name} (${(report.leadingSector.dp >= 0 ? '+' : '')}${report.leadingSector.dp.toFixed(2)}%)`,
      laggingSector: `${report.laggingSector.name} (${(report.laggingSector.dp >= 0 ? '+' : '')}${report.laggingSector.dp.toFixed(2)}%)`
    });
  } catch (error) {
    console.error('[API Premarket Cron Error]:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Internal Server Error'
    });
  }
}
