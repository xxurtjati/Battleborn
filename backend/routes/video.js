import express from 'express';
import {
  uploadVideo,
  getVideoInfo,
  splitVideo,
  trimVideo,
  listOutputs,
  deleteVideo
} from '../controllers/videoController.js';

export default (upload) => {
  const router = express.Router();

  router.post('/upload', upload.single('video'), uploadVideo);
  router.get('/info/:filename', getVideoInfo);
  router.post('/split', splitVideo);
  router.post('/trim', trimVideo);
  router.get('/outputs', listOutputs);
  router.delete('/:filename', deleteVideo);

  return router;
};
