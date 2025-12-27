import express from 'express';
import {
  compareVideos,
  batchCompare,
  getComparisonResult
} from '../controllers/compareController.js';

const router = express.Router();

router.post('/analyze', compareVideos);
router.post('/batch', batchCompare);
router.get('/results/:id', getComparisonResult);

export default router;
