import React, { useState, useRef } from 'react';
import axios from 'axios';
import VideoPlayer from './VideoPlayer';
import Timeline from './Timeline';
import SegmentList from './SegmentList';
import './VideoSplitter.css';

function VideoSplitter() {
  const [videoFile, setVideoFile] = useState(null);
  const [videoUrl, setVideoUrl] = useState('');
  const [videoInfo, setVideoInfo] = useState(null);
  const [cutPoints, setCutPoints] = useState([]);
  const [currentTime, setCurrentTime] = useState(0);
  const [isProcessing, setIsProcessing] = useState(false);
  const [segments, setSegments] = useState([]);
  const [uploadProgress, setUploadProgress] = useState(0);
  const videoRef = useRef(null);

  const handleFileSelect = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setVideoFile(file);
    setVideoUrl('');
    setVideoInfo(null);
    setCutPoints([]);
    setSegments([]);

    const formData = new FormData();
    formData.append('video', file);

    try {
      setIsProcessing(true);
      const response = await axios.post('/api/video/upload', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
        onUploadProgress: (progressEvent) => {
          const percentCompleted = Math.round(
            (progressEvent.loaded * 100) / progressEvent.total
          );
          setUploadProgress(percentCompleted);
        },
      });

      setVideoUrl(response.data.path);

      const infoResponse = await axios.get(
        `/api/video/info/${response.data.filename}`
      );
      setVideoInfo(infoResponse.data);
    } catch (error) {
      console.error('Error uploading video:', error);
      alert('Failed to upload video. Please try again.');
    } finally {
      setIsProcessing(false);
      setUploadProgress(0);
    }
  };

  const handleAddCutPoint = () => {
    if (!cutPoints.includes(currentTime) && currentTime > 0 && currentTime < videoInfo?.duration) {
      setCutPoints([...cutPoints, currentTime].sort((a, b) => a - b));
    }
  };

  const handleRemoveCutPoint = (time) => {
    setCutPoints(cutPoints.filter((t) => t !== time));
  };

  const handleTimelineClick = (time) => {
    if (videoRef.current) {
      videoRef.current.currentTime = time;
      setCurrentTime(time);
    }
  };

  const validateSegments = () => {
    const sortedCuts = [0, ...cutPoints.sort((a, b) => a - b), videoInfo.duration];
    const errors = [];

    for (let i = 0; i < sortedCuts.length - 1; i++) {
      const duration = sortedCuts[i + 1] - sortedCuts[i];
      if (duration > 600) {
        errors.push(
          `Segment ${i + 1}: ${(duration / 60).toFixed(2)} minutes (exceeds 10 min limit)`
        );
      }
    }

    return errors;
  };

  const handleSplitVideo = async () => {
    const errors = validateSegments();
    if (errors.length > 0) {
      alert('Cannot split video:\n' + errors.join('\n'));
      return;
    }

    try {
      setIsProcessing(true);
      const filename = videoUrl.split('/').pop();

      const response = await axios.post('/api/video/split', {
        filename,
        cutPoints,
        outputPrefix: `workout_${Date.now()}`,
      });

      setSegments(response.data.segments);
      alert('Video split successfully!');
    } catch (error) {
      console.error('Error splitting video:', error);
      alert('Failed to split video: ' + (error.response?.data?.error || error.message));
    } finally {
      setIsProcessing(false);
    }
  };

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="video-splitter">
      <div className="upload-section">
        <label className="upload-button">
          <input
            type="file"
            accept="video/*"
            onChange={handleFileSelect}
            disabled={isProcessing}
          />
          {videoFile ? 'Change Video' : 'Upload Video'}
        </label>

        {uploadProgress > 0 && uploadProgress < 100 && (
          <div className="progress-bar">
            <div className="progress-fill" style={{ width: `${uploadProgress}%` }} />
            <span className="progress-text">{uploadProgress}%</span>
          </div>
        )}

        {videoInfo && (
          <div className="video-info">
            <p>Duration: {formatTime(videoInfo.duration)}</p>
            <p>Resolution: {videoInfo.width}x{videoInfo.height}</p>
            <p>Size: {(videoInfo.size / 1024 / 1024).toFixed(2)} MB</p>
          </div>
        )}
      </div>

      {videoUrl && (
        <>
          <VideoPlayer
            videoUrl={videoUrl}
            videoRef={videoRef}
            onTimeUpdate={setCurrentTime}
          />

          <Timeline
            duration={videoInfo?.duration || 0}
            currentTime={currentTime}
            cutPoints={cutPoints}
            onTimelineClick={handleTimelineClick}
            onRemoveCutPoint={handleRemoveCutPoint}
          />

          <div className="controls-section">
            <div className="current-time">
              Current Time: {formatTime(currentTime)}
            </div>

            <button
              className="add-cut-button"
              onClick={handleAddCutPoint}
              disabled={isProcessing || currentTime === 0}
            >
              Add Cut Point at Current Time
            </button>

            <button
              className="split-button"
              onClick={handleSplitVideo}
              disabled={isProcessing || cutPoints.length === 0}
            >
              {isProcessing ? 'Processing...' : `Split Video (${cutPoints.length + 1} segments)`}
            </button>
          </div>

          {cutPoints.length > 0 && (
            <div className="segment-preview">
              <h3>Segment Preview</h3>
              {validateSegments().length > 0 && (
                <div className="validation-errors">
                  {validateSegments().map((error, i) => (
                    <div key={i} className="error">{error}</div>
                  ))}
                </div>
              )}
              <div className="segments-list">
                {[0, ...cutPoints, videoInfo.duration].map((time, i, arr) => {
                  if (i === arr.length - 1) return null;
                  const duration = arr[i + 1] - time;
                  const isValid = duration <= 600;
                  return (
                    <div key={i} className={`segment-item ${!isValid ? 'invalid' : ''}`}>
                      <span className="segment-number">Segment {i + 1}</span>
                      <span className="segment-time">
                        {formatTime(time)} → {formatTime(arr[i + 1])}
                      </span>
                      <span className="segment-duration">
                        ({formatTime(duration)}) {!isValid && '⚠️'}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {segments.length > 0 && (
            <SegmentList segments={segments} formatTime={formatTime} />
          )}
        </>
      )}
    </div>
  );
}

export default VideoSplitter;
