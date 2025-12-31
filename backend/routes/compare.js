import express from 'express';
import {
  compareVideos,
  batchCompare,
  getComparisonResult,
  getComparisonProgress,
  retryFailedSegments
} from '../controllers/compareController.js';

const router = express.Router();

router.post('/analyze', compareVideos);
router.post('/batch', batchCompare);
router.post('/retry/:jobId', retryFailedSegments);
router.get('/results/:id', getComparisonResult);
router.get('/progress/:jobId', getComparisonProgress);

export default router;
