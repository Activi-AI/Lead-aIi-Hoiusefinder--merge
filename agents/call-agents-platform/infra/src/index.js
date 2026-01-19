const express = require('express');
const { Pool } = require('pg');

const app = express();
app.use(express.json());

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

const API_TOKEN = process.env.API_TOKEN;

// Auth middleware
const auth = (req, res, next) => {
  const token = req.headers['authorization']?.replace('Bearer ', '');
  if (API_TOKEN && token !== API_TOKEN) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
};

// Health check (no auth)
app.get('/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  } catch (err) {
    res.status(500).json({ status: 'error', error: err.message });
  }
});

// Append memory entry
app.post('/memory/append', auth, async (req, res) => {
  try {
    const { type, content, tags = [], refs = [] } = req.body;

    if (!type || !content) {
      return res.status(400).json({ error: 'type and content required' });
    }

    const result = await pool.query(
      `INSERT INTO memory (type, content, tags, refs)
       VALUES ($1, $2, $3, $4)
       RETURNING id, type, content, tags, refs, created_at`,
      [type, content, tags, refs]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get recent memory entries
app.get('/memory/recent', auth, async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 10, 100);
    const type = req.query.type;

    let query = 'SELECT * FROM memory';
    const params = [];

    if (type) {
      query += ' WHERE type = $1';
      params.push(type);
    }

    query += ' ORDER BY created_at DESC LIMIT $' + (params.length + 1);
    params.push(limit);

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Search memory by tags
app.get('/memory/search', auth, async (req, res) => {
  try {
    const { tag, q } = req.query;
    const limit = Math.min(parseInt(req.query.limit) || 20, 100);

    let query = 'SELECT * FROM memory WHERE 1=1';
    const params = [];

    if (tag) {
      params.push(tag);
      query += ` AND $${params.length} = ANY(tags)`;
    }

    if (q) {
      params.push(`%${q}%`);
      query += ` AND content ILIKE $${params.length}`;
    }

    params.push(limit);
    query += ` ORDER BY created_at DESC LIMIT $${params.length}`;

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Stats
app.get('/memory/stats', auth, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        type,
        COUNT(*) as count,
        MAX(created_at) as last_entry
      FROM memory
      GROUP BY type
      ORDER BY count DESC
    `);

    const total = await pool.query('SELECT COUNT(*) as total FROM memory');

    res.json({
      total: parseInt(total.rows[0].total),
      by_type: result.rows
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Brain API running on port ${PORT}`);
});
