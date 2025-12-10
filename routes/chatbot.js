// routes/chatbot.js
import express from 'express';
import { executeQuery } from '../server/db.js';

const router = express.Router();

// Predefined responses (same as before)
const responses = {
  greeting: [ /* ... */ ],
  skills: [ /* ... */ ],
  projects: [ /* ... */ ],
  experience: [ /* ... */ ],
  contact: [ /* ... */ ],
  education: [ /* ... */ ],
  technologies: [ /* ... */ ],
  default: [ /* ... */ ]
};

// keep categorizeMessage and getRandomResponse functions as they were
function categorizeMessage(message) {
  const msg = message.toLowerCase();
  if (msg.includes('hello') || msg.includes('hi') || msg.includes('hey') || msg.includes('greet')) return 'greeting';
  if (msg.includes('skill') || msg.includes('technology') || msg.includes('tech') || msg.includes('programming')) return 'skills';
  if (msg.includes('project') || msg.includes('work') || msg.includes('portfolio') || msg.includes('built')) return 'projects';
  if (msg.includes('experience') || msg.includes('job') || msg.includes('career') || msg.includes('professional')) return 'experience';
  if (msg.includes('contact') || msg.includes('email') || msg.includes('reach') || msg.includes('hire')) return 'contact';
  if (msg.includes('education') || msg.includes('study') || msg.includes('college') || msg.includes('degree')) return 'education';
  if (msg.includes('react') || msg.includes('java') || msg.includes('node') || msg.includes('mysql') || msg.includes('javascript')) return 'technologies';
  return 'default';
}

function getRandomResponse(category) {
  const categoryResponses = responses[category] || responses.default;
  return categoryResponses[Math.floor(Math.random() * categoryResponses.length)];
}

router.post('/chat', async (req, res) => {
  try {
    const { message, sessionId } = req.body;
    if (!message || message.trim().length === 0) return res.status(400).json({ error: 'Message is required' });

    const userMessage = message.trim();
    const session = sessionId || `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const category = categorizeMessage(userMessage);
    const botResponse = getRandomResponse(category);

    // Store chat history
    await executeQuery(`
      INSERT INTO chat_conversations (session_id, user_message, bot_response, category, created_at)
      VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)
    `, [session, userMessage, botResponse, category]);

    // Update chat_stats (upsert)
    // chat_stats.date is unique (as per db schema). We increment total_messages.
    // unique_sessions increment if this is the first message for this session today.
    const upsertSql = `
      INSERT INTO chat_stats (date, total_messages, unique_sessions, created_at)
      VALUES (CURRENT_DATE, 1, 1, CURRENT_TIMESTAMP)
      ON CONFLICT (date) DO UPDATE
      SET total_messages = chat_stats.total_messages + 1,
          unique_sessions = chat_stats.unique_sessions +
            (CASE
              WHEN (
                SELECT COUNT(*) FROM chat_conversations
                WHERE session_id = $1 AND DATE(created_at) = CURRENT_DATE
              ) = 1 THEN 1 ELSE 0 END)
    `;
    await executeQuery(upsertSql, [session]);

    // Emit real-time update
    const io = req.app.get('io');
    if (io) {
      io.emit('new_chat_message', {
        sessionId: session,
        message: userMessage,
        response: botResponse,
        category,
        timestamp: new Date()
      });
    }

    res.json({
      response: botResponse,
      sessionId: session,
      category,
      timestamp: new Date()
    });
  } catch (error) {
    console.error('Chatbot error:', error);
    res.status(500).json({ error: 'Failed to process chat message', detail: error.message });
  }
});

// Get chat statistics
router.get('/stats', async (req, res) => {
  try {
    const [
      totalChatsRows,
      todayChatsRows,
      uniqueSessionsRows,
      popularCategoriesRows,
      recentChatsRows,
      chatTrendRows
    ] = await Promise.all([
      executeQuery('SELECT COUNT(*)::int as count FROM chat_conversations'),
      executeQuery('SELECT COUNT(*)::int as count FROM chat_conversations WHERE DATE(created_at) = CURRENT_DATE'),
      executeQuery('SELECT COUNT(DISTINCT session_id)::int as count FROM chat_conversations'),
      executeQuery(`
        SELECT category, COUNT(*)::int as count
        FROM chat_conversations
        GROUP BY category
        ORDER BY count DESC
        LIMIT 5
      `),
      executeQuery(`
        SELECT user_message, bot_response, category, created_at
        FROM chat_conversations
        ORDER BY created_at DESC
        LIMIT 10
      `),
      executeQuery(`
        SELECT DATE(created_at) as date, COUNT(*)::int as count
        FROM chat_conversations
        WHERE created_at >= (CURRENT_DATE - INTERVAL '7 days')
        GROUP BY DATE(created_at)
        ORDER BY date DESC
      `)
    ]);

    res.json({
      totalChats: totalChatsRows[0]?.count || 0,
      todayChats: todayChatsRows[0]?.count || 0,
      uniqueSessions: uniqueSessionsRows[0]?.count || 0,
      popularCategories: popularCategoriesRows,
      recentChats: recentChatsRows,
      chatTrend: chatTrendRows
    });
  } catch (error) {
    console.error('Chat stats error:', error);
    res.status(500).json({ error: 'Failed to fetch chat statistics', detail: error.message });
  }
});

export default router;
