import express from 'express';
import {
  uploadVideo,
  uploadSegments,
  getVideoInfo,
  splitVideo,
  trimVideo,
  downloadYouTubeVideo,
  cleanupYouTubeVideos,
  getProgress,
  listOutputs,
  deleteVideo
} from '../controllers/videoController.js';

export default (upload, segmentUpload) => {
  const router = express.Router();

  router.post('/upload', upload.single('video'), uploadVideo);
  router.post('/upload-segments', segmentUpload.array('segments', 50), uploadSegments);
  router.get('/info/:filename', getVideoInfo);
  router.post('/split', splitVideo);
  router.post('/trim', trimVideo);
  router.post('/download-youtube', downloadYouTubeVideo);
  router.post('/cleanup-youtube', cleanupYouTubeVideos);
  router.get('/progress/:jobId', getProgress);
  router.get('/outputs', listOutputs);
  router.delete('/:filename', deleteVideo);

  return router;
};
