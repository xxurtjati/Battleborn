# Battleborn - Video Comparison Tool

A professional video splitting and comparison tool designed for HIIT workout submissions. Split long workout videos into manageable segments and compare user submissions against instructor videos using AI-powered analysis.

## Features

### Video Splitting
- Upload videos up to 500MB
- Interactive timeline with visual playback indicator
- Manual cut point selection for precise segment alignment
- Automatic validation (max 10 minutes per segment)
- Real-time segment preview
- Export segments as individual MP4 files

### Video Comparison (Coming Soon)
- AI-powered comparison using Google Gemini 3.0 Pro
- Compare user submission segments against instructor videos
- Percentage match calculation for each segment
- Overall performance score
- Visual comparison interface

## Tech Stack

- **Frontend**: React + Vite
- **Backend**: Node.js + Express
- **Video Processing**: FFmpeg
- **AI Analysis**: Google Gemini 3.0 Pro API
- **Styling**: Custom CSS with modern gradients

## Prerequisites

- Node.js 18+ and npm
- FFmpeg (automatically installed via npm packages)

## Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd Battleborn
```

2. Install dependencies:
```bash
npm run install:all
```

3. Set up environment variables:
```bash
cp .env.example .env
# Edit .env and add your Gemini API key
```

## Running the Application

Start both frontend and backend in development mode:

```bash
npm run dev
```

This will start:
- Backend API on http://localhost:3001
- Frontend UI on http://localhost:3000

Or run them separately:

```bash
# Backend only
npm run dev:backend

# Frontend only
npm run dev:frontend
```

## Usage Guide

### Splitting Videos

1. **Upload Video**: Click "Upload Video" and select your HIIT workout video
2. **Review Info**: Check video duration, resolution, and file size
3. **Set Cut Points**:
   - Play the video and pause where you want to create cuts
   - Click "Add Cut Point at Current Time"
   - Cut points appear as green markers on the timeline
   - Click the × on a marker to remove it
4. **Preview Segments**: Review the segment list to ensure all are under 10 minutes
5. **Split**: Click "Split Video" to create the segments
6. **Download**: Download individual segments or use them for comparison

### Tips for Cutting Videos

- Align cuts with natural transitions in the workout (between exercises)
- Ensure instructor video cuts match the timing of those exercises
- Keep segments under 10 minutes for optimal AI processing
- Use the timeline to jump to specific times by clicking

## Project Structure

```
Battleborn/
├── backend/
│   ├── server.js              # Express server
│   ├── routes/
│   │   └── video.js           # Video API routes
│   ├── controllers/
│   │   └── videoController.js # Video processing logic
│   └── package.json
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   ├── VideoPlayer.jsx    # Video playback component
│   │   │   ├── Timeline.jsx       # Interactive timeline
│   │   │   ├── VideoSplitter.jsx  # Main splitting interface
│   │   │   └── SegmentList.jsx    # Exported segments display
│   │   ├── App.jsx
│   │   └── main.jsx
│   ├── index.html
│   └── package.json
├── uploads/                   # Temporary video uploads (gitignored)
├── outputs/                   # Exported video segments (gitignored)
└── README.md
```

## API Endpoints

### Video Management
- `POST /api/video/upload` - Upload a video file
- `GET /api/video/info/:filename` - Get video metadata
- `POST /api/video/split` - Split video into segments
- `GET /api/video/outputs` - List all output segments
- `DELETE /api/video/:filename` - Delete a video file

### Comparison (Coming Soon)
- `POST /api/compare/analyze` - Compare two video segments
- `POST /api/compare/batch` - Compare multiple segment pairs
- `GET /api/compare/results/:id` - Get comparison results

## Development

### Backend Development

The backend uses FFmpeg for video processing:
- `fluent-ffmpeg` for video manipulation
- `ffmpeg-static` and `ffprobe-static` for bundled FFmpeg binaries
- Express for REST API
- Multer for file uploads

### Frontend Development

The frontend is a modern React application:
- Vite for fast development and building
- Custom video player with HTML5 video element
- Interactive timeline with draggable markers
- Responsive design with gradient aesthetics

## Troubleshooting

### Video Upload Fails
- Ensure video file is under 500MB
- Check that the file is a supported format (mp4, avi, mov, mkv, webm)
- Verify backend server is running on port 3001

### Segments Too Long
- Add more cut points to create shorter segments
- Each segment must be 10 minutes or less
- The validation will show which segments exceed the limit

### FFmpeg Not Working
- FFmpeg is included via npm packages (ffmpeg-static)
- If issues persist, try reinstalling: `cd backend && npm install`

## Future Enhancements

- [ ] Gemini AI integration for video comparison
- [ ] Batch processing for multiple videos
- [ ] Preset cut templates for common workout formats
- [ ] Video preview thumbnails on timeline
- [ ] Export all segments as ZIP file
- [ ] Cloud storage integration
- [ ] User authentication and saved projects

## License

MIT

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.
