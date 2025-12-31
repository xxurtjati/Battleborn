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
  deleteOutputs,
  deleteVideo
} from '../controllers/videoController.js';

export default (upload, segmentUpload) => {
  const router = express.Router();

  router.post('/upload', (req, res, next) => {
    upload.single('video')(req, res, (err) => {
      if (err) {
        console.error('Upload multer error:', err);
        if (err.code === 'LIMIT_FILE_SIZE') {
          return res.status(400).json({ 
            error: 'File too large', 
            details: 'Maximum file size is 5GB',
            code: err.code 
          });
        }
        return res.status(400).json({ 
          error: 'Upload error', 
          details: err.message,
          code: err.code 
        });
      }
      next();
    });
  }, uploadVideo);
  router.post('/upload-segments', segmentUpload.array('segments', 50), uploadSegments);
  router.get('/info/:filename', getVideoInfo);
  router.post('/split', splitVideo);
  router.post('/trim', trimVideo);
  router.post('/download-youtube', downloadYouTubeVideo);
  router.post('/cleanup-youtube', cleanupYouTubeVideos);
  router.get('/progress/:jobId', getProgress);
  router.get('/outputs', listOutputs);
  router.post('/outputs/delete', deleteOutputs);
  router.delete('/:filename', deleteVideo);

  return router;
};
