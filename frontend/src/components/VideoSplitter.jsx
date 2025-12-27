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
  const [trimStart, setTrimStart] = useState(0);
  const [trimEnd, setTrimEnd] = useState(null);
  const [intervalMinutes, setIntervalMinutes] = useState(10);
  const [intervalSeconds, setIntervalSeconds] = useState(0);
  const [isTrimming, setIsTrimming] = useState(false);
  const [trimProgress, setTrimProgress] = useState(0);
  const [estimatedTimeRemaining, setEstimatedTimeRemaining] = useState(0);
  const videoRef = useRef(null);

  const handleFileSelect = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setVideoFile(file);
    setVideoUrl('');
    setVideoInfo(null);
    setCutPoints([]);
    setSegments([]);
    setTrimStart(0);
    setTrimEnd(null);

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
      setTrimEnd(infoResponse.data.duration);
    } catch (error) {
      console.error('Error uploading video:', error);
      alert('Failed to upload video. Please try again.');
    } finally {
      setIsProcessing(false);
      setUploadProgress(0);
    }
  };

  const handleAddCutPoint = () => {
    const effectiveTrimStart = trimStart || 0;
    const effectiveTrimEnd = trimEnd || videoInfo?.duration || 0;

    if (currentTime <= effectiveTrimStart || currentTime >= effectiveTrimEnd) {
      alert(`Cut point must be within trim range (${formatTime(effectiveTrimStart)} - ${formatTime(effectiveTrimEnd)})`);
      return;
    }

    if (!cutPoints.includes(currentTime)) {
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

  const handleSetTrimStart = () => {
    const effectiveTrimEnd = trimEnd || videoInfo?.duration || 0;
    if (currentTime >= effectiveTrimEnd) {
      alert('Trim start must be before trim end');
      return;
    }
    setTrimStart(currentTime);
    // Remove cut points that are now outside the trim range
    setCutPoints(cutPoints.filter(cp => cp > currentTime && cp < effectiveTrimEnd));
  };

  const handleSetTrimEnd = () => {
    if (currentTime <= trimStart) {
      alert('Trim end must be after trim start');
      return;
    }
    if (currentTime - trimStart < 1) {
      alert('Trim range must be at least 1 second');
      return;
    }
    setTrimEnd(currentTime);
    // Remove cut points that are now outside the trim range
    setCutPoints(cutPoints.filter(cp => cp > trimStart && cp < currentTime));
  };

  const handleResetTrim = () => {
    setTrimStart(0);
    setTrimEnd(videoInfo?.duration || null);
  };

  const handleTrimVideo = async () => {
    const effectiveTrimStart = trimStart || 0;
    const effectiveTrimEnd = trimEnd || videoInfo?.duration || 0;

    if (effectiveTrimEnd - effectiveTrimStart < 1) {
      alert('Trim range must be at least 1 second');
      return;
    }

    if (effectiveTrimStart === 0 && effectiveTrimEnd === videoInfo?.duration) {
      alert('No trimming needed - using full video range');
      return;
    }

    try {
      setIsTrimming(true);
      setTrimProgress(0);
      const filename = videoUrl.split('/').pop();

      // Calculate estimated processing time
      const trimDuration = effectiveTrimEnd - effectiveTrimStart;
      const originalDuration = videoInfo.duration;
      const fileSizeMB = videoInfo.size / (1024 * 1024);

      // Estimate output file size (proportional to trim duration)
      const estimatedOutputSizeMB = fileSizeMB * (trimDuration / originalDuration);

      // Processing speed: ~0.5-1.5 MB/s for transcoding (conservative estimate)
      // Use slower speed for larger files
      const processingSpeedMBps = fileSizeMB > 500 ? 0.5 : 1.0;
      const estimatedDurationSeconds = estimatedOutputSizeMB / processingSpeedMBps;

      // Add base overhead (2-5 seconds for setup/finalization)
      const totalEstimatedSeconds = Math.max(estimatedDurationSeconds + 3, 5);

      console.log(`Estimated trim time: ${totalEstimatedSeconds.toFixed(1)}s (${estimatedOutputSizeMB.toFixed(1)}MB @ ${processingSpeedMBps}MB/s)`);

      const startTime = Date.now();

      // Easing function - slows down as it approaches 95%
      const easeOutQuad = (t) => t * (2 - t);

      // Update progress based on estimated time
      const progressInterval = setInterval(() => {
        const elapsedSeconds = (Date.now() - startTime) / 1000;
        const progressRatio = Math.min(elapsedSeconds / totalEstimatedSeconds, 1);

        // Apply easing and cap at 95% until complete
        const easedProgress = easeOutQuad(progressRatio);
        const displayProgress = Math.min(easedProgress * 95, 95);

        // Calculate time remaining
        const remainingSeconds = Math.max(totalEstimatedSeconds - elapsedSeconds, 0);

        setTrimProgress(Math.round(displayProgress));
        setEstimatedTimeRemaining(Math.round(remainingSeconds));
      }, 200); // Update every 200ms for smoother animation

      const response = await axios.post('/api/video/trim', {
        filename,
        trimStart: effectiveTrimStart,
        trimEnd: effectiveTrimEnd,
        outputFilename: `trimmed_${Date.now()}.mp4`,
      });

      clearInterval(progressInterval);

      // Animate from current progress to 100%
      const finalProgress = trimProgress;
      for (let p = finalProgress; p <= 100; p += 2) {
        setTrimProgress(p);
        await new Promise(resolve => setTimeout(resolve, 30));
      }
      setTrimProgress(100);

      // Small delay to show 100%
      await new Promise(resolve => setTimeout(resolve, 500));

      alert('Video trimmed successfully!');

      // Update to use the new trimmed video
      setVideoUrl(response.data.url);
      setVideoFile(null); // Clear original file reference

      // Get info for the new trimmed video
      const infoResponse = await axios.get(
        `/api/video/info/${response.data.filename}`
      );
      setVideoInfo(infoResponse.data);

      // Reset trim boundaries to new video
      setTrimStart(0);
      setTrimEnd(infoResponse.data.duration);
      setCutPoints([]);

    } catch (error) {
      console.error('Error trimming video:', error);
      alert('Failed to trim video: ' + (error.response?.data?.error || error.message));
    } finally {
      setIsTrimming(false);
      setTrimProgress(0);
      setEstimatedTimeRemaining(0);
    }
  };

  const handleGenerateIntervalCuts = () => {
    const totalInterval = intervalMinutes * 60 + intervalSeconds;
    const effectiveTrimStart = trimStart || 0;
    const effectiveTrimEnd = trimEnd || videoInfo?.duration || 0;
    const trimRange = effectiveTrimEnd - effectiveTrimStart;

    // Validation
    if (totalInterval <= 0) {
      alert('Interval must be greater than 0');
      return;
    }
    if (totalInterval > 600) {
      alert('Interval must be 10 minutes or less to respect segment limit');
      return;
    }
    if (totalInterval >= trimRange) {
      const suggestedMinutes = Math.floor(trimRange / 120); // Suggest half the trim range
      const suggestedSeconds = Math.floor((trimRange / 2) % 60);
      alert(
        `Interval (${formatTime(totalInterval)}) is larger than or equal to the trim range (${formatTime(trimRange)}).\n\n` +
        `Try a smaller interval, such as ${suggestedMinutes}:${suggestedSeconds.toString().padStart(2, '0')}`
      );
      return;
    }

    const estimatedSegments = Math.ceil(trimRange / totalInterval);
    if (estimatedSegments > 50) {
      if (!window.confirm(`This will create ${estimatedSegments} segments. Continue?`)) {
        return;
      }
    }

    if (cutPoints.length > 0) {
      if (!window.confirm('This will replace all existing cut points. Continue?')) {
        return;
      }
    }

    // Generate cut points
    const cuts = [];
    let position = effectiveTrimStart + totalInterval;
    while (position < effectiveTrimEnd) {
      cuts.push(position);
      position += totalInterval;
    }

    setCutPoints(cuts);
  };

  const validateSegments = () => {
    const effectiveTrimStart = trimStart || 0;
    const effectiveTrimEnd = trimEnd || videoInfo.duration;
    const sortedCuts = [effectiveTrimStart, ...cutPoints.sort((a, b) => a - b), effectiveTrimEnd];
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
        trimStart: trimStart || 0,
        trimEnd: trimEnd || videoInfo.duration,
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

  const calculateIntervalSegments = () => {
    const totalInterval = intervalMinutes * 60 + intervalSeconds;
    if (totalInterval <= 0) return 0;
    const effectiveTrimStart = trimStart || 0;
    const effectiveTrimEnd = trimEnd || videoInfo?.duration || 0;
    const trimRange = effectiveTrimEnd - effectiveTrimStart;
    return Math.ceil(trimRange / totalInterval);
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
            trimStart={trimStart}
            trimEnd={trimEnd || videoInfo?.duration || 0}
            onTimelineClick={handleTimelineClick}
            onRemoveCutPoint={handleRemoveCutPoint}
          />

          <div className="current-time">
            Current Time: {formatTime(currentTime)}
          </div>

          <div className="trim-controls">
            <h3>1. Trim Video (Optional)</h3>
            <div className="trim-buttons">
              <button onClick={handleSetTrimStart} disabled={isProcessing || isTrimming}>
                Set Trim Start
              </button>
              <button onClick={handleSetTrimEnd} disabled={isProcessing || isTrimming}>
                Set Trim End
              </button>
              <button onClick={handleResetTrim} disabled={isProcessing || isTrimming}>
                Reset Trim
              </button>
            </div>
            {isTrimming && (
              <div className="trim-progress-container">
                <div className="trim-progress-header">
                  <span className="trim-progress-text">Trimming video...</span>
                  <span className="trim-progress-percentage">{trimProgress}%</span>
                </div>
                <div className="trim-progress-bar">
                  <div
                    className="trim-progress-fill"
                    style={{ width: `${trimProgress}%` }}
                  />
                </div>
                <p className="trim-progress-message">
                  {estimatedTimeRemaining > 0 ? (
                    <>Estimated time remaining: <strong>{estimatedTimeRemaining}s</strong></>
                  ) : (
                    'Almost done...'
                  )}
                </p>
              </div>
            )}
            {!isTrimming && (trimStart > 0 || (trimEnd && trimEnd < videoInfo.duration)) && (
              <div className="trim-info">
                Trimmed Range: {formatTime(trimStart)} → {formatTime(trimEnd || videoInfo.duration)}
                {' '}(Duration: {formatTime((trimEnd || videoInfo.duration) - trimStart)})
                <button
                  className="apply-trim-button"
                  onClick={handleTrimVideo}
                  disabled={isProcessing || isTrimming}
                >
                  Apply Trim
                </button>
              </div>
            )}
          </div>

          <div className="interval-controls">
            <h3>2. Add Cut Points</h3>

            <div className="interval-section">
              <h4>Auto-Generate by Interval</h4>
              <div className="interval-inputs">
                <label>
                  Minutes:{' '}
                  <input
                    type="number"
                    min="0"
                    max="60"
                    value={intervalMinutes}
                    onChange={(e) => setIntervalMinutes(Number(e.target.value))}
                    disabled={isProcessing}
                  />
                </label>
                <label>
                  Seconds:{' '}
                  <input
                    type="number"
                    min="0"
                    max="59"
                    value={intervalSeconds}
                    onChange={(e) => setIntervalSeconds(Number(e.target.value))}
                    disabled={isProcessing}
                  />
                </label>
              </div>
              <button onClick={handleGenerateIntervalCuts} disabled={isProcessing}>
                Generate Interval Cuts
              </button>
              <div className="interval-preview">
                Will create {calculateIntervalSegments()} segment{calculateIntervalSegments() !== 1 ? 's' : ''}
              </div>
            </div>

            <div className="manual-section">
              <h4>Or Add Manually</h4>
              <button
                className="add-cut-button"
                onClick={handleAddCutPoint}
                disabled={isProcessing || currentTime === 0}
              >
                Add Cut Point at Current Time
              </button>
            </div>
          </div>

          <div className="split-section">
            <h3>3. Split Video</h3>
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
                {[trimStart || 0, ...cutPoints, trimEnd || videoInfo.duration].map((time, i, arr) => {
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
