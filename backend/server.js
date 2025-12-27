import express from 'express';
import cors from 'cors';
import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs/promises';
import dotenv from 'dotenv';
import videoRoutes from './routes/video.js';
import compareRoutes from './routes/compare.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3001;

app.use(cors());
app.use(express.json());

// Ensure required directories exist
const uploadsDir = path.join(__dirname, '..', 'uploads');
const outputsDir = path.join(__dirname, '..', 'outputs');

await fs.mkdir(uploadsDir, { recursive: true });
await fs.mkdir(outputsDir, { recursive: true });

// Serve static files
app.use('/uploads', express.static(uploadsDir));
app.use('/outputs', express.static(outputsDir));

// Configure multer for file uploads (to uploads directory)
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + '-' + file.originalname);
  }
});

// Configure multer for segment uploads (directly to outputs directory)
const segmentStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, outputsDir);
  },
  filename: (req, file, cb) => {
    // Use original filename with a timestamp prefix to avoid conflicts
    const timestamp = Date.now();
    const prefix = req.body.prefix || 'uploaded_seg';
    const index = file.originalname.match(/(\d+)/)?.[1] || '01';
    cb(null, `${prefix}_${String(index).padStart(2, '0')}_${timestamp}.mp4`);
  }
});

const videoFilter = (req, file, cb) => {
  const allowedTypes = /mp4|avi|mov|mkv|webm/;
  const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
  const mimetype = allowedTypes.test(file.mimetype);

  if (mimetype && extname) {
    return cb(null, true);
  }
  cb(new Error('Only video files are allowed'));
};

const upload = multer({
  storage,
  limits: {
    fileSize: 1024 * 1024 * 1024 // 1GB limit
  },
  fileFilter: videoFilter
});

const segmentUpload = multer({
  storage: segmentStorage,
  limits: {
    fileSize: 1024 * 1024 * 1024 // 1GB limit
  },
  fileFilter: videoFilter
});

app.use('/api/video', videoRoutes(upload, segmentUpload));
app.use('/api/compare', compareRoutes);

app.get('/health', (req, res) => {
  res.json({ status: 'ok', message: 'Battleborn Video Splitter API' });
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
