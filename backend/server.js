import express from 'express';
import cors from 'cors';
import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs/promises';
import dotenv from 'dotenv';
import videoRoutes from './routes/video.js';
import compareRoutes from './routes/compare.js';

// Load .env from the backend directory
// Try multiple possible locations for the .env file
const possibleEnvPaths = [
  new URL('.env', import.meta.url).pathname,
  path.join(path.dirname(fileURLToPath(import.meta.url)), '.env'),
  path.resolve('.env'),
  path.resolve('backend/.env')
];

let envLoaded = false;
for (const envPath of possibleEnvPaths) {
  const result = dotenv.config({ path: envPath });
  if (!result.error && process.env.GEMINI_API_KEY) {
    console.log('Loaded .env from:', envPath);
    envLoaded = true;
    break;
  }
}

console.log('Gemini API Key loaded:', process.env.GEMINI_API_KEY ? 'YES' : 'NO');

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
    // Preserve original filename - just add timestamp suffix if file already exists
    const ext = path.extname(file.originalname);
    const baseName = path.basename(file.originalname, ext);
    const timestamp = Date.now();
    // Add a short timestamp to ensure uniqueness while keeping original name recognizable
    cb(null, `${baseName}_${timestamp}${ext}`);
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
