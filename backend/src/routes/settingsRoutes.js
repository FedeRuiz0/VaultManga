import express from 'express';
import { query, queryOne, queryAll } from '../db/database.js';
import { authenticateToken } from './authRoutes.js';

const router = express.Router();

function isValidNumber(value, min, max) {
  return typeof value === 'number' && value >= min && value <= max;
}

// Get user preferences
router.get('/', authenticateToken, async (req, res, next) => {
  try {
    const preferences = await queryOne(
      'SELECT * FROM user_preferences WHERE user_id = $1',
      [req.user.id]
    );

    res.json(preferences || {});
  } catch (error) {
    next(error);
  }
});

// Update preferences
router.put('/', authenticateToken, async (req, res, next) => {
  try {
    const {
      theme,
      reader_mode,
      reader_direction,
      prefetch_chapters,
      show_page_number,
      auto_advance,
      reading_goal
    } = req.body;

    const preferences = await queryOne(`
      UPDATE user_preferences SET
        theme = COALESCE($2, theme),
        reader_mode = COALESCE($3, reader_mode),
        reader_direction = COALESCE($4, reader_direction),
        prefetch_chapters = COALESCE($5, prefetch_chapters),
        show_page_number = COALESCE($6, show_page_number),
        auto_advance = COALESCE($7, auto_advance),
        reading_goal = COALESCE($8, reading_goal),
        updated_at = CURRENT_TIMESTAMP
      WHERE user_id = $1
      RETURNING *
    `, [
      req.user.id,
      theme,
      reader_mode,
      reader_direction,
      prefetch_chapters,
      show_page_number,
      auto_advance,
      reading_goal
    ]) 
    if (
  (reader_mode && !['vertical', 'horizontal'].includes(reader_mode)) ||
  (page_fit && !['width', 'height'].includes(page_fit)) ||
  (auto_scroll !== undefined && typeof auto_scroll !== 'boolean') ||
  (scroll_speed && !isValidNumber(scroll_speed, 1, 100))
) {
  return res.status(400).json({ error: 'Invalid settings values' });
};

    res.json(preferences);
  } catch (error) {
    next(error);
  }
});

// Reset preferences to default
router.delete('/', authenticateToken, async (req, res, next) => {
  try {
    await query(`
      UPDATE user_preferences SET
        theme = 'dark',
        reader_mode = 'vertical',
        reader_direction = 'rtl',
        prefetch_chapters = 2,
        show_page_number = true,
        auto_advance = true,
        reading_goal = 0,
        updated_at = CURRENT_TIMESTAMP
      WHERE user_id = $1
    `, [req.user.id]);

    const preferences = await queryOne(
      'SELECT * FROM user_preferences WHERE user_id = $1',
      [req.user.id]
    );

    res.json(preferences);
  } catch (error) {
    next(error);
  }
});

export default router;

