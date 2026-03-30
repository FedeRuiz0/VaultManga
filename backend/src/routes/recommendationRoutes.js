import express from 'express';
import { query, queryAll } from '../db/database.js';
import { generateRecommendations } from '../recommendation/recommendationEngine.js';
import { emitRecommendationsUpdated } from '../realtime/socket.js';

const router = express.Router();

router.get('/', async (req, res, next) => {
  try {
    const limit = Number(req.query.limit || 12);
    const result = await generateRecommendations(limit);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

router.get('/profile', async (req, res, next) => {
  try {
    const result = await generateRecommendations(8);
    res.json(result.profile);
  } catch (error) {
    next(error);
  }
});

router.get('/feedback', async (req, res, next) => {
  try {
    const rows = await queryAll(`
      SELECT *
      FROM recommendation_feedback
      ORDER BY created_at DESC
    `);
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
      INSERT INTO recommendation_feedback (feedback_type, value)
      VALUES ($1, $2)
      RETURNING *
      `,
      [feedback_type, value]
    );

    emitRecommendationsUpdated({
      type: 'feedback',
      feedback_type,
      value,
    });

    res.status(201).json(row.rows[0]);
  } catch (error) {
    next(error);
  }
});

export default router;