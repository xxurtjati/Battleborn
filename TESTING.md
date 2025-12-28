# Testing Guide for Battleborn

This guide will help you test all features of the Battleborn video comparison tool.

## Prerequisites

1. **Node.js 18+** and npm installed
2. **FFmpeg** - Should be automatically available via npm packages
3. **yt-dlp** - Required for YouTube downloads (install via Homebrew: `brew install yt-dlp`)
4. **Google Gemini API Key** - Required for AI comparison features

## Setup

### 1. Install Dependencies

```bash
# From the project root
npm run install:all
```

This installs dependencies for root, backend, and frontend.

### 2. Configure Environment Variables

Create a `.env` file in the `backend/` directory:

```bash
cd backend
echo "GEMINI_API_KEY=your_api_key_here" > .env
```

Replace `your_api_key_here` with your actual Google Gemini API key.

### 3. Test Gemini API Connection (Optional)

```bash
cd backend
node test-gemini3.js
```

This should output: `Success with Gemini 3 Pro! Response: ...`

## Running the Application

### Start Both Frontend and Backend

From the project root:

```bash
npm run dev
```

This starts:
- **Backend API** on `http://localhost:3001`
- **Frontend UI** on `http://localhost:3000`

### Or Run Separately

```bash
# Backend only
npm run dev:backend

# Frontend only (in another terminal)
npm run dev:frontend
```

## Testing Features

### 1. Health Check

First, verify the backend is running:

```bash
curl http://localhost:3001/health
```

Expected response:
```json
{"status":"ok","message":"Battleborn Video Splitter API"}
```

### 2. Video Splitting Feature

**Via UI:**
1. Open `http://localhost:3000` in your browser
2. Click on "Video Splitter" tab
3. Click "Upload Video" and select a video file (MP4, AVI, MOV, MKV, or WEBM)
4. Wait for upload to complete
5. Use the video player to navigate and click "Add Cut Point at Current Time"
6. Add multiple cut points (green markers on timeline)
7. Click "Split Video" to create segments
8. Download individual segments from the segment list

**Via API:**
```bash
# Upload a video
curl -X POST http://localhost:3001/api/video/upload \
  -F "video=@/path/to/your/video.mp4"

# Get video info
curl http://localhost:3001/api/video/info/FILENAME

# Split video (replace FILENAME and cutPoints)
curl -X POST http://localhost:3001/api/video/split \
  -H "Content-Type: application/json" \
  -d '{
    "filename": "FILENAME",
    "cutPoints": [60, 120, 180],
    "outputPrefix": "test_segment"
  }'

# List all outputs
curl http://localhost:3001/api/video/outputs
```

### 3. YouTube Download Feature

**Via UI:**
1. Click on "AI Comparison" tab
2. Scroll to "YouTube Instructor Video" section
3. Enter a YouTube URL (e.g., `https://www.youtube.com/watch?v=VIDEO_ID`)
4. Enter start time (e.g., `5:30` or `330` seconds)
5. Enter end time (e.g., `15:30` or `930` seconds)
6. Set interval for auto-segmentation (e.g., 2 minutes 30 seconds)
7. Select quality (Fast/Balanced/Best)
8. Click "Download & Create Segments"
9. Watch progress indicator and segment creation

**Via API:**
```bash
curl -X POST http://localhost:3001/api/video/download-youtube \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://www.youtube.com/watch?v=VIDEO_ID",
    "startTime": 330,
    "endTime": 930,
    "quality": "balanced",
    "intervalMinutes": 2,
    "intervalSeconds": 30
  }'

# Poll for progress (replace JOB_ID)
curl http://localhost:3001/api/video/progress/JOB_ID
```

### 4. Segment Upload Feature

**Via UI:**
1. Go to "AI Comparison" tab
2. Under "Instructor Segments" or "User Segments"
3. Click "Upload Pre-Split Files"
4. Select multiple video files (they'll be sorted by name)
5. Wait for upload progress
6. Segments will appear in the list

**Via API:**
```bash
curl -X POST http://localhost:3001/api/video/upload-segments \
  -F "segments=@/path/to/segment1.mp4" \
  -F "segments=@/path/to/segment2.mp4" \
  -F "type=instructor" \
  -F "prefix=instructor_seg"
```

### 5. AI Video Comparison Feature

**Prerequisites:** 
- Must have GEMINI_API_KEY configured
- Need both instructor and user segments loaded

**Via UI:**
1. Load instructor segments (via YouTube download or upload)
2. Load user segments (via upload or browse saved)
3. Ensure both have the same number of segments
4. Click "Compare All Segments" for batch comparison
   OR
   Click "Compare This Pair" for individual segment comparison
5. Wait for AI analysis (may take 30-60 seconds per segment)
6. Review results:
   - Overall match percentage
   - Per-minute breakdown
   - Rep count comparison
   - Speed analysis
   - Form issues with timestamps
   - Strengths and improvements

**Via API:**
```bash
# Single comparison
curl -X POST http://localhost:3001/api/compare/analyze \
  -H "Content-Type: application/json" \
  -d '{
    "instructorVideo": "instructor_seg_01_TIMESTAMP.mp4",
    "userVideo": "user_seg_01_TIMESTAMP.mp4",
    "segmentIndex": 1
  }'

# Batch comparison
curl -X POST http://localhost:3001/api/compare/batch \
  -H "Content-Type: application/json" \
  -d '{
    "comparisons": [
      {
        "instructorVideo": "instructor_seg_01_TIMESTAMP.mp4",
        "userVideo": "user_seg_01_TIMESTAMP.mp4"
      },
      {
        "instructorVideo": "instructor_seg_02_TIMESTAMP.mp4",
        "userVideo": "user_seg_02_TIMESTAMP.mp4"
      }
    ]
  }'
```

### 6. Browse Saved Segments

**Via UI:**
1. Click "Browse Saved Segments" button
2. Modal opens showing all segments grouped by batch
3. Select segments to load
4. Click "Load Selected Segments"

## Testing Checklist

### Video Splitting
- [ ] Upload video successfully
- [ ] Video metadata displays correctly
- [ ] Can add cut points on timeline
- [ ] Can remove cut points
- [ ] Can split video into segments
- [ ] Segments are under 10 minutes
- [ ] Can download individual segments
- [ ] Timeline scrubbing works

### YouTube Download
- [ ] YouTube URL validation works
- [ ] Time range parsing (MM:SS and seconds)
- [ ] Download starts successfully
- [ ] Progress tracking updates
- [ ] Segments created automatically
- [ ] Quality selection works
- [ ] Can download all segments

### Segment Management
- [ ] Upload multiple segments
- [ ] Segments sorted correctly
- [ ] Browse saved segments modal works
- [ ] Can select and load segments
- [ ] Segment count displays correctly

### AI Comparison
- [ ] Single segment comparison works
- [ ] Batch comparison works
- [ ] Results display correctly
- [ ] Match percentage calculated
- [ ] Per-minute analysis shows
- [ ] Rep count comparison works
- [ ] Form issues with timestamps
- [ ] Expandable details work
- [ ] Video previews load

## Troubleshooting

### Backend won't start
- Check if port 3001 is available: `lsof -i :3001`
- Verify Node.js version: `node --version` (should be 18+)
- Check backend logs for errors

### Frontend won't connect to backend
- Verify backend is running on port 3001
- Check browser console for CORS errors
- Verify proxy settings in `vite.config.js`

### YouTube download fails
- Verify `yt-dlp` is installed: `which yt-dlp`
- Check if YouTube URL is valid
- Verify network connection
- Check backend logs for yt-dlp errors

### AI comparison fails
- Verify GEMINI_API_KEY is set in `.env`
- Test API key: `cd backend && node test-gemini3.js`
- Check API quota/limits
- Verify video files exist in `outputs/` directory

### FFmpeg errors
- Verify FFmpeg is available: `ffmpeg -version`
- Check video file format is supported
- Verify file isn't corrupted

## Test Data

You can use the existing videos in the `uploads/` directory for testing:
- `PXL_20251226_092224561.mp4` - Sample workout video
- Various trimmed and processed videos

## API Endpoints Summary

### Video Management
- `POST /api/video/upload` - Upload video
- `GET /api/video/info/:filename` - Get video metadata
- `POST /api/video/split` - Split video into segments
- `POST /api/video/trim` - Trim video
- `POST /api/video/download-youtube` - Download YouTube video
- `GET /api/video/progress/:jobId` - Get job progress
- `GET /api/video/outputs` - List all output segments
- `POST /api/video/upload-segments` - Upload pre-split segments
- `DELETE /api/video/:filename` - Delete video

### Comparison
- `POST /api/compare/analyze` - Compare two video segments
- `POST /api/compare/batch` - Batch compare multiple pairs
- `GET /api/compare/results/:id` - Get comparison result

### Health
- `GET /health` - Health check

## Next Steps

After testing, you can:
1. Review the comparison results for accuracy
2. Test with different video lengths and qualities
3. Test edge cases (very short videos, long videos, etc.)
4. Verify error handling for invalid inputs
5. Test concurrent operations

