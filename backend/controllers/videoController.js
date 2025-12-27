import ffmpeg from 'fluent-ffmpeg';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs/promises';
import youtubedl from 'youtube-dl-exec';
import progressTracker from '../utils/progressTracker.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configure youtube-dl-exec to use system yt-dlp
youtubedl.ytDlpPath = '/usr/local/bin/yt-dlp';

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
    const { filename, cutPoints, trimStart, trimEnd, outputPrefix } = req.body;

    if (!filename || !cutPoints || !Array.isArray(cutPoints)) {
      return res.status(400).json({ error: 'Invalid request data' });
    }

    const videoPath = path.join(uploadsDir, filename);
    const prefix = outputPrefix || `segment_${Date.now()}`;

    // Validate cut points and create segments
    const segments = [];

    // Get video duration
    const metadata = await new Promise((resolve, reject) => {
      ffmpeg.ffprobe(videoPath, (err, data) => {
        if (err) reject(err);
        else resolve(data);
      });
    });

    const totalDuration = metadata.format.duration;
    const effectiveTrimStart = trimStart || 0;
    const effectiveTrimEnd = trimEnd || totalDuration;

    const sortedCuts = [effectiveTrimStart, ...cutPoints.sort((a, b) => a - b)];
    sortedCuts.push(effectiveTrimEnd);

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

// Trim video to create a new trimmed file
export const trimVideo = async (req, res) => {
  try {
    const { filename, trimStart, trimEnd, outputFilename } = req.body;

    if (!filename || trimStart === undefined || trimEnd === undefined) {
      return res.status(400).json({ error: 'Invalid request data' });
    }

    const videoPath = path.join(uploadsDir, filename);
    const outputName = outputFilename || `trimmed_${Date.now()}.mp4`;
    const outputPath = path.join(uploadsDir, outputName);

    const duration = trimEnd - trimStart;

    if (duration <= 0) {
      return res.status(400).json({ error: 'Invalid trim range' });
    }

    // Create trimmed video
    await new Promise((resolve, reject) => {
      ffmpeg(videoPath)
        .setStartTime(trimStart)
        .setDuration(duration)
        .output(outputPath)
        .videoCodec('libx264')
        .audioCodec('aac')
        .on('end', () => {
          console.log('Video trimmed successfully');
          resolve();
        })
        .on('error', (err) => {
          console.error('Error trimming video:', err);
          reject(err);
        })
        .run();
    });

    res.json({
      message: 'Video trimmed successfully',
      filename: outputName,
      url: `/uploads/${outputName}`,
      trimStart,
      trimEnd,
      duration
    });

  } catch (error) {
    console.error('Trim error:', error);
    res.status(500).json({ error: 'Failed to trim video', details: error.message });
  }
};

// Get progress for a job
export const getProgress = async (req, res) => {
  try {
    const { jobId } = req.params;
    const job = progressTracker.getJob(jobId);

    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }

    res.json(job);
  } catch (error) {
    console.error('Get progress error:', error);
    res.status(500).json({ error: 'Failed to get progress' });
  }
};

// Download YouTube video with optional time range and quality
export const downloadYouTubeVideo = async (req, res) => {
  try {
    const { url, startTime, endTime, quality = 'balanced' } = req.body;

    if (!url) {
      return res.status(400).json({ error: 'YouTube URL is required' });
    }

    // Validate YouTube URL
    const youtubeRegex = /^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.be)\/.+/;
    if (!youtubeRegex.test(url)) {
      return res.status(400).json({ error: 'Invalid YouTube URL' });
    }

    const jobId = `youtube_${Date.now()}`;
    progressTracker.createJob(jobId, 100);

    // Return job ID immediately so client can poll for progress
    res.json({ jobId, message: 'Download started' });

    // Process asynchronously
    processYouTubeDownload(jobId, url, startTime, endTime, quality);

  } catch (error) {
    console.error('YouTube download error:', error);
    res.status(500).json({
      error: 'Failed to start YouTube download',
      details: error.message
    });
  }
};

// Process YouTube download asynchronously with progress tracking
async function processYouTubeDownload(jobId, url, startTime, endTime, quality) {
  try {
    progressTracker.updateProgress(jobId, {
      status: 'downloading',
      progress: 5,
      message: 'Starting download'
    });

    const timestamp = Date.now();
    const outputFilename = `youtube_${timestamp}.mp4`;
    const outputPath = path.join(uploadsDir, outputFilename);

    // Quality format selection
    const qualityFormats = {
      fast: 'bestvideo[height<=480][ext=mp4]+bestaudio[ext=m4a]/best[height<=480][ext=mp4]/best',
      balanced: 'bestvideo[height<=720][ext=mp4]+bestaudio[ext=m4a]/best[height<=720][ext=mp4]/best',
      best: 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best'
    };

    // Build yt-dlp options
    const options = {
      format: qualityFormats[quality] || qualityFormats.balanced,
      output: outputPath,
      mergeOutputFormat: 'mp4',
      noPlaylist: true,
    };

    // Add download sections if time range specified
    if (startTime !== undefined && endTime !== undefined) {
      const formatTime = (seconds) => {
        const hrs = Math.floor(seconds / 3600);
        const mins = Math.floor((seconds % 3600) / 60);
        const secs = Math.floor(seconds % 60);
        return `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
      };

      const start = formatTime(startTime);
      const end = formatTime(endTime);
      options.downloadSections = `*${start}-${end}`;
    }

    progressTracker.updateProgress(jobId, {
      progress: 10,
      message: 'Downloading video'
    });

    console.log('Downloading YouTube video:', url);
    console.log('Options:', options);

    // Download with progress updates (simulate since yt-dlp doesn't provide real-time progress easily)
    const progressInterval = setInterval(() => {
      const job = progressTracker.getJob(jobId);
      if (job && job.progress < 70) {
        progressTracker.updateProgress(jobId, {
          progress: Math.min(job.progress + 5, 70),
          message: 'Downloading video'
        });
      }
    }, 2000);

    await youtubedl(url, options);

    clearInterval(progressInterval);

    progressTracker.updateProgress(jobId, {
      progress: 75,
      message: 'Processing metadata'
    });

    // Get video info
    const metadata = await new Promise((resolve, reject) => {
      ffmpeg.ffprobe(outputPath, (err, data) => {
        if (err) reject(err);
        else resolve(data);
      });
    });

    const videoStream = metadata.streams.find(s => s.codec_type === 'video');

    const result = {
      message: 'YouTube video downloaded successfully',
      filename: outputFilename,
      url: `/uploads/${outputFilename}`,
      duration: metadata.format.duration,
      size: metadata.format.size,
      width: videoStream?.width,
      height: videoStream?.height,
      quality,
      trimmed: startTime !== undefined && endTime !== undefined,
      trimStart: startTime,
      trimEnd: endTime
    };

    progressTracker.completeJob(jobId, result);

  } catch (error) {
    console.error('YouTube download error:', error);
    progressTracker.failJob(jobId, error.message);
  }
}

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

// Cleanup YouTube downloads
export const cleanupYouTubeVideos = async (req, res) => {
  try {
    const files = await fs.readdir(uploadsDir);
    const youtubeFiles = files.filter(f => f.startsWith('youtube_'));

    let deletedCount = 0;
    for (const file of youtubeFiles) {
      try {
        await fs.unlink(path.join(uploadsDir, file));
        deletedCount++;
      } catch (err) {
        console.error(`Failed to delete ${file}:`, err);
      }
    }

    res.json({
      message: 'YouTube videos cleaned up',
      deletedCount,
      totalFound: youtubeFiles.length
    });
  } catch (error) {
    console.error('Cleanup error:', error);
    res.status(500).json({ error: 'Failed to cleanup YouTube videos' });
  }
};
