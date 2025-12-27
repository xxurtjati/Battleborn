import ffmpeg from 'fluent-ffmpeg';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs/promises';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// fluent-ffmpeg will use system ffmpeg if available

const uploadsDir = path.join(__dirname, '..', '..', 'uploads');
const outputsDir = path.join(__dirname, '..', '..', 'outputs');

// Upload video handler
export const uploadVideo = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No video file uploaded' });
    }

    res.json({
      message: 'Video uploaded successfully',
      filename: req.file.filename,
      path: `/uploads/${req.file.filename}`,
      size: req.file.size
    });
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ error: 'Failed to upload video' });
  }
};

// Get video information
export const getVideoInfo = (req, res) => {
  const { filename } = req.params;
  const videoPath = path.join(uploadsDir, filename);

  ffmpeg.ffprobe(videoPath, (err, metadata) => {
    if (err) {
      console.error('FFprobe error:', err);
      return res.status(500).json({ error: 'Failed to get video info' });
    }

    const videoStream = metadata.streams.find(s => s.codec_type === 'video');

    res.json({
      duration: metadata.format.duration,
      size: metadata.format.size,
      bitRate: metadata.format.bit_rate,
      width: videoStream?.width,
      height: videoStream?.height,
      fps: eval(videoStream?.r_frame_rate),
      format: metadata.format.format_name
    });
  });
};

// Split video into segments
export const splitVideo = async (req, res) => {
  try {
    const { filename, cutPoints, outputPrefix } = req.body;

    if (!filename || !cutPoints || !Array.isArray(cutPoints)) {
      return res.status(400).json({ error: 'Invalid request data' });
    }

    const videoPath = path.join(uploadsDir, filename);
    const prefix = outputPrefix || `segment_${Date.now()}`;

    // Validate cut points and create segments
    const segments = [];
    const sortedCuts = [0, ...cutPoints.sort((a, b) => a - b)];

    // Get video duration
    const metadata = await new Promise((resolve, reject) => {
      ffmpeg.ffprobe(videoPath, (err, data) => {
        if (err) reject(err);
        else resolve(data);
      });
    });

    const totalDuration = metadata.format.duration;
    sortedCuts.push(totalDuration);

    // Create segments
    for (let i = 0; i < sortedCuts.length - 1; i++) {
      const start = sortedCuts[i];
      const end = sortedCuts[i + 1];
      const duration = end - start;

      // Validate segment is not longer than 10 minutes (600 seconds)
      if (duration > 600) {
        return res.status(400).json({
          error: `Segment ${i + 1} is ${(duration / 60).toFixed(2)} minutes long, exceeds 10 minute limit`
        });
      }

      const outputFilename = `${prefix}_part${String(i + 1).padStart(2, '0')}.mp4`;
      const outputPath = path.join(outputsDir, outputFilename);

      segments.push({
        index: i + 1,
        start,
        end,
        duration,
        filename: outputFilename,
        path: outputPath
      });
    }

    // Process all segments
    const results = [];

    for (const segment of segments) {
      await new Promise((resolve, reject) => {
        ffmpeg(videoPath)
          .setStartTime(segment.start)
          .setDuration(segment.duration)
          .output(segment.path)
          .videoCodec('libx264')
          .audioCodec('aac')
          .on('end', () => {
            console.log(`Segment ${segment.index} created successfully`);
            resolve();
          })
          .on('error', (err) => {
            console.error(`Error creating segment ${segment.index}:`, err);
            reject(err);
          })
          .run();
      });

      results.push({
        index: segment.index,
        filename: segment.filename,
        url: `/outputs/${segment.filename}`,
        start: segment.start,
        end: segment.end,
        duration: segment.duration
      });
    }

    res.json({
      message: 'Video split successfully',
      segments: results
    });

  } catch (error) {
    console.error('Split error:', error);
    res.status(500).json({ error: 'Failed to split video', details: error.message });
  }
};

// List all output segments
export const listOutputs = async (req, res) => {
  try {
    const files = await fs.readdir(outputsDir);
    const outputs = files.map(filename => ({
      filename,
      url: `/outputs/${filename}`
    }));

    res.json({ outputs });
  } catch (error) {
    console.error('List outputs error:', error);
    res.status(500).json({ error: 'Failed to list outputs' });
  }
};

// Delete video file
export const deleteVideo = async (req, res) => {
  try {
    const { filename } = req.params;
    const videoPath = path.join(uploadsDir, filename);

    await fs.unlink(videoPath);

    res.json({ message: 'Video deleted successfully' });
  } catch (error) {
    console.error('Delete error:', error);
    res.status(500).json({ error: 'Failed to delete video' });
  }
};
