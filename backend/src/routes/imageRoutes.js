import express from 'express';
import {
  getCoverByMangaId,
  getPageByPageId,
} from '../controllers/imageController.js';

const router = express.Router();

router.get('/cover/:mangaId', getCoverByMangaId);
router.get('/page/:pageId', getPageByPageId);

export default router;