import express from 'express';
import { query, queryAll } from '../db/database.js';
import { generateRecommendations } from '../recommendation/recommendationEngine.js';
import { emitRecommendationsUpdated } from '../realtime/socket.js';
import { authenticateToken } from './authRoutes.js';

const router = express.Router();
router.use(authenticateToken);

router.get('/', async (req, res, next) => {
  try {
    const limit = Number(req.query.limit || 12);
    const result = await generateRecommendations(limit, req.user.id);
    res.json(result);
  } catch (error) {
    console.error('[recommendations] GET / failed', {
      userId: req.user?.id || null,
      message: error?.message,
      code: error?.code || null,
    });
    next(error);
  }
});

router.get('/profile', async (req, res, next) => {
  try {
    const result = await generateRecommendations(8, req.user.id);
    res.json(result.profile);
  } catch (error) {
    next(error);
  }
});

router.get('/feedback', async (req, res, next) => {
  try {
    const rows = await queryAll(
      `
      SELECT *
      FROM recommendation_feedback
      WHERE user_id = $1
      ORDER BY created_at DESC
    `,
      [req.user.id]
    );
    res.json(rows);
  } catch (error) {
    next(error);
  }
});

router.post('/feedback', async (req, res, next) => {
  try {
    const { feedback_type, value } = req.body;

    if (!feedback_type || !value) {
      return res.status(400).json({ error: 'feedback_type and value are required' });
    }

    const allowedTypes = ['block_manga', 'dislike_genre', 'like_genre'];
    if (!allowedTypes.includes(feedback_type)) {
      return res.status(400).json({ error: 'Invalid feedback_type' });
    }

    const row = await query(
      `
      INSERT INTO recommendation_feedback (user_id, feedback_type, value)
      VALUES ($1, $2, $3)
      RETURNING *
      `,
      [req.user.id, feedback_type, value]
    );

    emitRecommendationsUpdated({
      type: 'feedback',
      userId: req.user.id,
      feedback_type,
      value,
    });

    res.status(201).json(row.rows[0]);
  } catch (error) {
    next(error);
  }
});

export default router;