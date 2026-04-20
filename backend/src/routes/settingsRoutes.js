import express from 'express';
import { query, queryOne } from '../db/database.js';
import { authenticateToken } from './authRoutes.js';

const router = express.Router();

function isValidNumber(value, min, max) {
  return typeof value === 'number' && value >= min && value <= max;
}

function validateSettingsPayload(payload = {}) {
  const {
    theme,
    reader_mode,
    reader_direction,
    prefetch_chapters,
    show_page_number,
    auto_advance,
    reading_goal,
  } = payload;

  if (theme && !['dark', 'light', 'system'].includes(theme)) {
    return 'Invalid theme';
  }

  if (reader_mode && !['vertical', 'horizontal', 'paged', 'webtoon'].includes(reader_mode)) {
    return 'Invalid reader_mode';
  }

  if (reader_direction && !['rtl', 'ltr'].includes(reader_direction)) {
    return 'Invalid reader_direction';
  }

  if (prefetch_chapters !== undefined && !isValidNumber(prefetch_chapters, 0, 10)) {
    return 'Invalid prefetch_chapters';
  }

  if (show_page_number !== undefined && typeof show_page_number !== 'boolean') {
    return 'Invalid show_page_number';
  }

  if (auto_advance !== undefined && typeof auto_advance !== 'boolean') {
    return 'Invalid auto_advance';
  }

  if (reading_goal !== undefined && !isValidNumber(reading_goal, 0, 10000)) {
    return 'Invalid reading_goal';
  }

  return null;
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
    const validationError = validateSettingsPayload(req.body);
    if (validationError) {
      return res.status(400).json({ error: validationError });
    }

    const {
      theme,
      reader_mode,
      reader_direction,
      prefetch_chapters,
      show_page_number,
      auto_advance,
      reading_goal,
    } = req.body;

    const preferences = await queryOne(
      `
      INSERT INTO user_preferences (
        user_id, theme, reader_mode, reader_direction, prefetch_chapters, show_page_number, auto_advance, reading_goal
      )
      VALUES ($1, COALESCE($2, 'dark'), COALESCE($3, 'vertical'), COALESCE($4, 'rtl'), COALESCE($5, 2), COALESCE($6, true), COALESCE($7, true), COALESCE($8, 0))
      ON CONFLICT (user_id)
      DO UPDATE SET
        theme = COALESCE(EXCLUDED.theme, user_preferences.theme),
        reader_mode = COALESCE(EXCLUDED.reader_mode, user_preferences.reader_mode),
        reader_direction = COALESCE(EXCLUDED.reader_direction, user_preferences.reader_direction),
        prefetch_chapters = COALESCE(EXCLUDED.prefetch_chapters, user_preferences.prefetch_chapters),
        show_page_number = COALESCE(EXCLUDED.show_page_number, user_preferences.show_page_number),
        auto_advance = COALESCE(EXCLUDED.auto_advance, user_preferences.auto_advance),
        reading_goal = COALESCE(EXCLUDED.reading_goal, user_preferences.reading_goal),
        updated_at = CURRENT_TIMESTAMP
      RETURNING *
      `,
      [
        req.user.id,
        theme,
        reader_mode,
        reader_direction,
        prefetch_chapters,
        show_page_number,
        auto_advance,
        reading_goal,
      ]
    );

    res.json(preferences);
  } catch (error) {
    next(error);
  }
});

// Reset preferences to default
router.delete('/', authenticateToken, async (req, res, next) => {
  try {
    await query(
      `
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
      `,
      [req.user.id]
    );

    const preferences = await queryOne(
      'SELECT * FROM user_preferences WHERE user_id = $1',
      [req.user.id]
    );

    res.json(preferences || {});
  } catch (error) {
    next(error);
  }
});

export default router;