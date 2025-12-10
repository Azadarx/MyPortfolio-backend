// routes/analytics.js
import express from 'express';
import { executeQuery } from '../server/db.js';

const router = express.Router();

// Track visitor
router.post('/visitor', async (req, res) => {
  try {
    const {
      ip,
      userAgent,
      page,
      referrer,
      country,
      city,
      device,
      browser,
      sessionId
    } = req.body;

    const clientIP = req.headers['x-forwarded-for'] ||
                     req.headers['x-real-ip'] ||
                     req.connection?.remoteAddress ||
                     req.socket?.remoteAddress ||
                     ip ||
                     null;

    const sess = sessionId || `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // Insert into visitor_analytics (use column names from server/db.js)
    const insertSql = `
      INSERT INTO visitor_analytics
      (ip_address, user_agent, page_url, referrer, country, city, device_type, browser, session_id, created_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,CURRENT_TIMESTAMP)
      RETURNING id
    `;
    await executeQuery(insertSql, [
      clientIP,
      userAgent || req.headers['user-agent'],
      page || '/',
      referrer || req.headers.referer,
      country || 'Unknown',
      city || 'Unknown',
      device || 'Unknown',
      browser || 'Unknown',
      sess
    ]);

    // Emit real-time update
    const io = req.app.get('io');
    if (io) {
      io.emit('new_visitor', {
        page,
        country,
        city,
        timestamp: new Date()
      });
    }

    res.json({ success: true, sessionId: sess });
  } catch (error) {
    console.error('Visitor tracking error:', error);
    res.status(500).json({ message: 'Failed to track visitor', error: error.message });
  }
});

// Get analytics dashboard data
router.get('/dashboard', async (req, res) => {
  try {
    const [
      totalVisitorsRows,
      todayVisitorsRows,
      uniqueVisitorsRows,
      pageViewsRows,
      topPagesRows,
      topCountriesRows,
      deviceStatsRows,
      browserStatsRows,
      recentVisitorsRows,
      visitorTrendRows
    ] = await Promise.all([
      executeQuery('SELECT COUNT(*)::int AS count FROM visitor_analytics'),
      executeQuery(`SELECT COUNT(*)::int AS count FROM visitor_analytics WHERE DATE(created_at) = CURRENT_DATE`),
      executeQuery('SELECT COUNT(DISTINCT ip_address)::int AS count FROM visitor_analytics'),
      executeQuery(`
        SELECT page_url, COUNT(*)::int AS views
        FROM visitor_analytics
        GROUP BY page_url
        ORDER BY views DESC
        LIMIT 10
      `),
      executeQuery(`
        SELECT page_url as page, COUNT(*)::int as visits
        FROM visitor_analytics
        WHERE page_url IS NOT NULL
        GROUP BY page_url
        ORDER BY visits DESC
        LIMIT 5
      `),
      executeQuery(`
        SELECT country, COUNT(*)::int as visits
        FROM visitor_analytics
        WHERE country IS NOT NULL AND country <> 'Unknown'
        GROUP BY country
        ORDER BY visits DESC
        LIMIT 10
      `),
      executeQuery(`
        SELECT device_type, COUNT(*)::int as count
        FROM visitor_analytics
        WHERE device_type IS NOT NULL AND device_type <> 'Unknown'
        GROUP BY device_type
        ORDER BY count DESC
      `),
      executeQuery(`
        SELECT browser, COUNT(*)::int as count
        FROM visitor_analytics
        WHERE browser IS NOT NULL AND browser <> 'Unknown'
        GROUP BY browser
        ORDER BY count DESC
        LIMIT 5
      `),
      executeQuery(`
        SELECT ip_address, country, city, page_url, created_at
        FROM visitor_analytics
        ORDER BY created_at DESC
        LIMIT 10
      `),
      executeQuery(`
        SELECT DATE(created_at) as date, COUNT(*)::int as visits
        FROM visitor_analytics
        WHERE created_at >= (CURRENT_DATE - INTERVAL '7 days')
        GROUP BY DATE(created_at)
        ORDER BY date ASC
      `)
    ]);

    const totalVisitors = totalVisitorsRows[0]?.count || 0;
    const todayVisitors = todayVisitorsRows[0]?.count || 0;
    const uniqueVisitors = uniqueVisitorsRows[0]?.count || 0;
    const totalPageViews = pageViewsRows.reduce((s, p) => s + (p.views || 0), 0);

    const analytics = {
      overview: {
        totalVisitors,
        todayVisitors,
        uniqueVisitors,
        totalPageViews
      },
      topPages: topPagesRows,
      topCountries: topCountriesRows,
      deviceStats: deviceStatsRows,
      browserStats: browserStatsRows,
      recentVisitors: recentVisitorsRows,
      visitorTrend: visitorTrendRows,
      realTimeStats: {
        activeUsers: 0,
        lastUpdate: new Date()
      }
    };

    res.json(analytics);
  } catch (error) {
    console.error('Analytics dashboard error:', error);
    res.status(500).json({ message: 'Failed to fetch analytics data', error: error.message });
  }
});

// Get real-time statistics
router.get('/realtime', async (req, res) => {
  try {
    const [activeVisitorsRows, recentActivityRows] = await Promise.all([
      executeQuery(`
        SELECT COUNT(DISTINCT session_id)::int AS count
        FROM visitor_analytics
        WHERE created_at >= (NOW() - INTERVAL '5 minutes')
      `),
      executeQuery(`
        SELECT page_url, country, created_at
        FROM visitor_analytics
        ORDER BY created_at DESC
        LIMIT 10
      `)
    ]);

    const io = req.app.get('io');
    const connectedClients = io?.engine?.clientsCount || 0;

    res.json({
      activeVisitors: Math.max(activeVisitorsRows[0]?.count || 0, connectedClients),
      connectedClients,
      recentActivity: recentActivityRows,
      timestamp: new Date()
    });
  } catch (error) {
    console.error('Real-time analytics error:', error);
    res.status(500).json({ message: 'Failed to fetch real-time analytics', error: error.message });
  }
});

export default router;
