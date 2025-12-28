import React, { useState, useRef, useEffect } from 'react';
import axios from 'axios';
import './VideoPreparationPanel.css';

function VideoPreparationPanel({ 
  type, // 'user' or 'instructor'
  onSegmentsReady, // callback when segments are processed
  onProcessingChange // callback for processing status
}) {
  // Mode state: 'process' for normal workflow, 'upload-segments' for pre-split files
  const [mode, setMode] = useState('process');
  
  // Video state
  const [videoFile, setVideoFile] = useState(null);
  const [videoUrl, setVideoUrl] = useState('');
  const [videoInfo, setVideoInfo] = useState(null);
  const [currentTime, setCurrentTime] = useState(0);
  
  // Trim state
  const [trimStart, setTrimStart] = useState(0);
  const [trimEnd, setTrimEnd] = useState(null);
  
  // Segment state
  const [segmentMinutes, setSegmentMinutes] = useState(2);
  const [segmentSeconds, setSegmentSeconds] = useState(30);
  const [segments, setSegments] = useState([]);
  
  // Pre-split segments upload state
  const [uploadedSegments, setUploadedSegments] = useState([]);
  const [isUploadingSegments, setIsUploadingSegments] = useState(false);
  const [segmentUploadProgress, setSegmentUploadProgress] = useState(0);
  
  // Processing state
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingProgress, setProcessingProgress] = useState(0);
  const [processingMessage, setProcessingMessage] = useState('');
  const [processingJobId, setProcessingJobId] = useState(null);
  
  // YouTube state (for instructor)
  const [youtubeUrl, setYoutubeUrl] = useState('');
  const [youtubeStartTime, setYoutubeStartTime] = useState('');
  const [youtubeEndTime, setYoutubeEndTime] = useState('');
  const [youtubeQuality, setYoutubeQuality] = useState('balanced');
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(null);
  const [downloadStartTime, setDownloadStartTime] = useState(null);
  const [processingStartTime, setProcessingStartTime] = useState(null);
  
  const videoRef = useRef(null);
  const progressPollRef = useRef(null);
  const fileInputRef = useRef(null);
  const segmentInputRef = useRef(null);

  // Quality options
  const qualityOptions = [
    { value: 'fast', label: '⚡ Fast', description: '480p - Quick download' },
    { value: 'balanced', label: '⚖️ Balanced', description: '720p - Good quality' },
    { value: 'high', label: '🎬 High Quality', description: '1080p - Best quality' }
  ];

  // Calculate ETA
  const calculateETA = (progress, startTime) => {
    if (!startTime || progress <= 0) return null;
    const elapsed = (Date.now() - startTime) / 1000;
    const estimated = (elapsed / progress) * 100;
    const remaining = estimated - elapsed;
    if (remaining <= 0 || !isFinite(remaining)) return null;
    
    const mins = Math.floor(remaining / 60);
    const secs = Math.floor(remaining % 60);
    if (mins > 0) return `~${mins}m ${secs}s remaining`;
    return `~${secs}s remaining`;
  };

  // Calculate download speed (mock based on progress)
  const calculateSpeed = (progress, startTime) => {
    if (!startTime || progress <= 0) return null;
    const elapsed = (Date.now() - startTime) / 1000;
    // Estimate based on typical video file sizes
    const estimatedMB = 50; // Rough estimate
    const downloadedMB = (progress / 100) * estimatedMB;
    const speedMBps = downloadedMB / elapsed;
    if (speedMBps < 1) return `${(speedMBps * 1024).toFixed(0)} KB/s`;
    return `${speedMBps.toFixed(1)} MB/s`;
  };

  const isInstructor = type === 'instructor';
  const panelTitle = isInstructor ? 'Instructor Video' : 'Your Video';
  const panelSubtitle = isInstructor ? 'Expert Reference' : 'Your Submission';

  // Notify parent of processing state changes
  useEffect(() => {
    if (onProcessingChange) {
      onProcessingChange(isProcessing || isDownloading || isUploading);
    }
  }, [isProcessing, isDownloading, isUploading, onProcessingChange]);

  // Parse MM:SS format to seconds
  const parseTimeToSeconds = (timeStr) => {
    if (!timeStr) return undefined;
    const parts = timeStr.split(':');
    if (parts.length === 2) {
      const mins = parseInt(parts[0]) || 0;
      const secs = parseInt(parts[1]) || 0;
      return mins * 60 + secs;
    }
    return parseInt(timeStr) || undefined;
  };

  // Format seconds to MM:SS
  const formatTime = (seconds) => {
    if (seconds === null || seconds === undefined) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Handle file upload
  const handleFileSelect = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setVideoFile(file);
    setVideoUrl('');
    setVideoInfo(null);
    setTrimStart(0);
    setTrimEnd(null);
    setSegments([]);

    const formData = new FormData();
    formData.append('video', file);

    try {
      setIsUploading(true);
      setProcessingStartTime(Date.now());
      const response = await axios.post('/api/video/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
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
      setIsUploading(false);
      setUploadProgress(0);
    }
  };

  // Handle YouTube download (instructor only)
  const handleYoutubeDownload = async () => {
    if (!youtubeUrl.trim()) {
      alert('Please enter a YouTube URL');
      return;
    }

    const startSecs = parseTimeToSeconds(youtubeStartTime);
    const endSecs = parseTimeToSeconds(youtubeEndTime);

    if (startSecs !== undefined && endSecs !== undefined && startSecs >= endSecs) {
      alert('End time must be after start time');
      return;
    }

    setIsDownloading(true);
    setDownloadStartTime(Date.now());
    setDownloadProgress({ progress: 0, message: 'Initializing...', phase: 'init' });

    try {
      const response = await axios.post('/api/video/download-youtube', {
        url: youtubeUrl,
        startTime: startSecs,
        endTime: endSecs,
        quality: youtubeQuality,
        intervalMinutes: 0,
        intervalSeconds: 0
      });

      const jobId = response.data.jobId;

      // Poll for progress
      progressPollRef.current = setInterval(async () => {
        try {
          const progressResponse = await axios.get(`/api/video/progress/${jobId}`);
          const job = progressResponse.data;
          setDownloadProgress(job);

          if (job.status === 'completed') {
            clearInterval(progressPollRef.current);
            setIsDownloading(false);
            
            if (job.result) {
              setVideoUrl(job.result.url);
              const infoResponse = await axios.get(
                `/api/video/info/${job.result.filename}`
              );
              setVideoInfo(infoResponse.data);
              setTrimEnd(infoResponse.data.duration);
            }
          } else if (job.status === 'failed') {
            clearInterval(progressPollRef.current);
            setIsDownloading(false);
            alert('Download failed: ' + job.error);
          }
        } catch (error) {
          console.error('Progress poll error:', error);
        }
      }, 1000);

    } catch (error) {
      console.error('YouTube download error:', error);
      alert('Failed to download: ' + (error.response?.data?.error || error.message));
      setIsDownloading(false);
    }
  };

  // Handle trim start
  const handleSetTrimStart = () => {
    const effectiveTrimEnd = trimEnd || videoInfo?.duration || 0;
    if (currentTime >= effectiveTrimEnd) {
      alert('Trim start must be before trim end');
      return;
    }
    setTrimStart(currentTime);
  };

  // Handle trim end
  const handleSetTrimEnd = () => {
    if (currentTime <= trimStart) {
      alert('Trim end must be after trim start');
      return;
    }
    setTrimEnd(currentTime);
  };

  // Reset trim
  const handleResetTrim = () => {
    setTrimStart(0);
    setTrimEnd(videoInfo?.duration || null);
  };

  // Calculate segments preview
  const calculateSegmentsPreview = () => {
    const interval = segmentMinutes * 60 + segmentSeconds;
    if (interval <= 0) return [];
    
    const effectiveTrimStart = trimStart || 0;
    const effectiveTrimEnd = trimEnd || videoInfo?.duration || 0;
    const duration = effectiveTrimEnd - effectiveTrimStart;
    
    if (duration <= 0) return [];
    
    const numSegments = Math.ceil(duration / interval);
    const preview = [];
    
    for (let i = 0; i < numSegments; i++) {
      const start = effectiveTrimStart + (i * interval);
      const end = Math.min(start + interval, effectiveTrimEnd);
      preview.push({
        index: i + 1,
        start,
        end,
        duration: end - start
      });
    }
    
    return preview;
  };

  // Process video (trim and split)
  const handleProcessVideo = async () => {
    const effectiveTrimStart = trimStart || 0;
    const effectiveTrimEnd = trimEnd || videoInfo?.duration || 0;
    const duration = effectiveTrimEnd - effectiveTrimStart;

    if (duration < 1) {
      alert('Please set a valid trim range');
      return;
    }

    const interval = segmentMinutes * 60 + segmentSeconds;
    if (interval <= 0) {
      alert('Please set a valid segment duration');
      return;
    }

    // Check for 20-minute limit
    if (interval > 1200) {
      alert('Segment duration cannot exceed 20 minutes');
      return;
    }

    setIsProcessing(true);
    setProcessingProgress(0);
    setProcessingMessage('Starting...');
    setProcessingStartTime(Date.now());

    try {
      const filename = videoUrl.split('/').pop();
      
      // Generate cut points
      const cutPoints = [];
      let position = effectiveTrimStart + interval;
      while (position < effectiveTrimEnd) {
        cutPoints.push(position);
        position += interval;
      }

      // Start the split job (returns immediately with jobId)
      const response = await axios.post('/api/video/split', {
        filename,
        cutPoints,
        trimStart: effectiveTrimStart,
        trimEnd: effectiveTrimEnd,
        outputPrefix: `${type}_${Date.now()}`
      });

      const jobId = response.data.jobId;
      
      // Poll for progress
      progressPollRef.current = setInterval(async () => {
        try {
          const progressResponse = await axios.get(`/api/video/progress/${jobId}`);
          const job = progressResponse.data;
          
          setProcessingProgress(job.progress || 0);
          setProcessingMessage(job.message || 'Processing...');

          if (job.status === 'completed') {
            clearInterval(progressPollRef.current);
            
            // Segments are ready
            const processedSegments = job.result.segments.map(seg => ({
              ...seg,
              type
            }));
            
            setSegments(processedSegments);
            setProcessingProgress(100);
            setProcessingMessage('Complete!');
            
            // Notify parent
            if (onSegmentsReady) {
              onSegmentsReady(processedSegments);
            }

            setTimeout(() => {
              setIsProcessing(false);
            }, 1000);
          } else if (job.status === 'failed') {
            clearInterval(progressPollRef.current);
            setIsProcessing(false);
            alert('Processing failed: ' + job.error);
          }
        } catch (error) {
          console.error('Progress poll error:', error);
        }
      }, 500);

    } catch (error) {
      console.error('Processing error:', error);
      alert('Failed to process video: ' + (error.response?.data?.error || error.message));
      setIsProcessing(false);
    }
  };

  // Handle pre-split segment file selection
  const handleSegmentFilesSelect = async (e) => {
    const files = Array.from(e.target.files);
    if (!files.length) return;

    // Sort files by name to maintain order
    files.sort((a, b) => a.name.localeCompare(b.name));

    setIsUploadingSegments(true);
    setSegmentUploadProgress(0);

    try {
      const formData = new FormData();
      files.forEach((file) => {
        formData.append('segments', file);
      });
      formData.append('type', type);
      formData.append('prefix', `${type}_uploaded`);

      const response = await axios.post('/api/video/upload-segments', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        onUploadProgress: (progressEvent) => {
          const percentCompleted = Math.round(
            (progressEvent.loaded * 100) / progressEvent.total
          );
          setSegmentUploadProgress(percentCompleted);
        },
      });

      const newSegments = response.data.segments.map((seg, idx) => ({
        ...seg,
        index: idx + 1,
        type
      }));

      setUploadedSegments(newSegments);
      setSegments(newSegments);

      // Notify parent
      if (onSegmentsReady) {
        onSegmentsReady(newSegments);
      }
    } catch (error) {
      console.error('Error uploading segments:', error);
      alert('Failed to upload segments. Please try again.');
    } finally {
      setIsUploadingSegments(false);
      setSegmentUploadProgress(0);
    }
  };

  // Remove a segment from the uploaded list
  const handleRemoveSegment = (indexToRemove) => {
    const updatedSegments = uploadedSegments
      .filter((_, idx) => idx !== indexToRemove)
      .map((seg, idx) => ({ ...seg, index: idx + 1 }));
    
    setUploadedSegments(updatedSegments);
    setSegments(updatedSegments);
    
    if (onSegmentsReady) {
      onSegmentsReady(updatedSegments);
    }
  };

  // Move segment up in the list
  const handleMoveSegmentUp = (index) => {
    if (index === 0) return;
    const newSegments = [...uploadedSegments];
    [newSegments[index - 1], newSegments[index]] = [newSegments[index], newSegments[index - 1]];
    const reindexed = newSegments.map((seg, idx) => ({ ...seg, index: idx + 1 }));
    setUploadedSegments(reindexed);
    setSegments(reindexed);
    if (onSegmentsReady) {
      onSegmentsReady(reindexed);
    }
  };

  // Move segment down in the list
  const handleMoveSegmentDown = (index) => {
    if (index === uploadedSegments.length - 1) return;
    const newSegments = [...uploadedSegments];
    [newSegments[index], newSegments[index + 1]] = [newSegments[index + 1], newSegments[index]];
    const reindexed = newSegments.map((seg, idx) => ({ ...seg, index: idx + 1 }));
    setUploadedSegments(reindexed);
    setSegments(reindexed);
    if (onSegmentsReady) {
      onSegmentsReady(reindexed);
    }
  };

  // Clear all uploaded segments
  const handleClearSegments = () => {
    setUploadedSegments([]);
    setSegments([]);
    if (onSegmentsReady) {
      onSegmentsReady([]);
    }
  };

  // Switch mode and reset state
  const handleModeSwitch = (newMode) => {
    if (newMode === mode) return;
    
    // Reset both modes' state
    setVideoFile(null);
    setVideoUrl('');
    setVideoInfo(null);
    setSegments([]);
    setUploadedSegments([]);
    setTrimStart(0);
    setTrimEnd(null);
    
    if (onSegmentsReady) {
      onSegmentsReady([]);
    }
    
    setMode(newMode);
  };

  // Timeline click handler
  const handleTimelineClick = (e) => {
    if (!videoRef.current || !videoInfo) return;
    
    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const percentage = clickX / rect.width;
    const newTime = percentage * videoInfo.duration;
    
    videoRef.current.currentTime = newTime;
    setCurrentTime(newTime);
  };

  // Video time update
  const handleTimeUpdate = () => {
    if (videoRef.current) {
      setCurrentTime(videoRef.current.currentTime);
    }
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (progressPollRef.current) {
        clearInterval(progressPollRef.current);
      }
    };
  }, []);

  const segmentsPreview = calculateSegmentsPreview();
  const trimDuration = (trimEnd || videoInfo?.duration || 0) - (trimStart || 0);
  const isWorking = isUploading || isDownloading || isProcessing || isUploadingSegments;

  return (
    <div className={`video-prep-panel ${type}-panel ${isWorking ? 'working' : ''}`}>
      {/* Processing Overlay */}
      {isWorking && (
        <div className="processing-overlay">
          <div className="overlay-content">
            <div className="overlay-spinner">
              <div className="spinner-ring"></div>
              <div className="spinner-ring"></div>
              <div className="spinner-ring"></div>
            </div>
            <div className="overlay-info">
              <h3 className="overlay-title">
                {isUploading ? 'Uploading Video' : 
                 isUploadingSegments ? 'Uploading Segments' :
                 isDownloading ? (
                   downloadProgress?.phase === 'download' ? 'Downloading Video' :
                   downloadProgress?.phase === 'processing' ? 'Processing Video' :
                   'Preparing Video'
                 ) : 
                 'Splitting Video'}
              </h3>
              <div className="overlay-progress-bar">
                <div 
                  className="overlay-progress-fill" 
                  style={{ 
                    width: `${isUploading ? uploadProgress : isUploadingSegments ? segmentUploadProgress : isDownloading ? (downloadProgress?.progress || 0) : processingProgress}%` 
                  }} 
                />
              </div>
              <div className="overlay-stats">
                <span className="overlay-percent">
                  {isUploading ? uploadProgress : isUploadingSegments ? segmentUploadProgress : isDownloading ? (downloadProgress?.progress || 0) : processingProgress}%
                </span>
                {isDownloading && downloadProgress?.message && (
                  <span className="overlay-message">{downloadProgress.message}</span>
                )}
                {isProcessing && processingMessage && (
                  <span className="overlay-message">{processingMessage}</span>
                )}
                {isUploadingSegments && (
                  <span className="overlay-message">Uploading segment files...</span>
                )}
              </div>
              
              {/* Download stats: speed, size, ETA */}
              {isDownloading && (downloadProgress?.downloadSpeed || downloadProgress?.downloadedSize) && (
                <div className="overlay-download-stats">
                  {downloadProgress?.downloadSpeed && (
                    <span className="stat-speed">🚀 {downloadProgress.downloadSpeed}</span>
                  )}
                  {downloadProgress?.downloadedSize && (
                    <span className="stat-size">📦 {downloadProgress.downloadedSize}</span>
                  )}
                </div>
              )}
              
              <div className="overlay-eta">
                {isDownloading && downloadProgress?.etaSeconds && (
                  <span>⏱️ {Math.floor(downloadProgress.etaSeconds / 60)}:{String(Math.floor(downloadProgress.etaSeconds % 60)).padStart(2, '0')} remaining</span>
                )}
                {isDownloading && !downloadProgress?.etaSeconds && calculateETA(downloadProgress?.progress, downloadStartTime) && (
                  <span>{calculateETA(downloadProgress?.progress, downloadStartTime)}</span>
                )}
                {isProcessing && calculateETA(processingProgress, processingStartTime) && (
                  <span>{calculateETA(processingProgress, processingStartTime)}</span>
                )}
                {isUploading && calculateETA(uploadProgress, processingStartTime) && (
                  <span>{calculateETA(uploadProgress, processingStartTime)}</span>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="panel-header">
        <h2>{panelTitle}</h2>
        <p className="panel-subtitle">{panelSubtitle}</p>
        {isProcessing && (
          <div className="processing-badge">
            <span className="processing-spinner">⏳</span>
            Processing...
          </div>
        )}
        {segments.length > 0 && !isProcessing && (
          <div className="ready-badge">
            ✅ {segments.length} segment{segments.length !== 1 ? 's' : ''} ready
          </div>
        )}
      </div>

      {/* Mode Toggle */}
      {!videoUrl && uploadedSegments.length === 0 && (
        <div className="mode-toggle">
          <button 
            className={`mode-btn ${mode === 'process' ? 'active' : ''}`}
            onClick={() => handleModeSwitch('process')}
          >
            <span className="mode-icon">🎬</span>
            <span className="mode-text">
              <span className="mode-title">Process Video</span>
              <span className="mode-desc">Upload, trim & split</span>
            </span>
          </button>
          <button 
            className={`mode-btn ${mode === 'upload-segments' ? 'active' : ''}`}
            onClick={() => handleModeSwitch('upload-segments')}
          >
            <span className="mode-icon">📂</span>
            <span className="mode-text">
              <span className="mode-title">Upload Segments</span>
              <span className="mode-desc">Pre-split files ready</span>
            </span>
          </button>
        </div>
      )}

      {/* Pre-split Segments Upload Mode */}
      {mode === 'upload-segments' && !videoUrl && (
        <div className="segment-upload-section">
          {uploadedSegments.length === 0 ? (
            <>
              <div className="segment-upload-info">
                <p>📁 Upload your pre-split video segments</p>
                <p className="segment-upload-hint">
                  Select multiple video files in the correct order. 
                  Files will be sorted alphabetically by name.
                </p>
              </div>
              
              <input
                ref={segmentInputRef}
                id={`segment-input-${type}`}
                type="file"
                accept="video/*"
                multiple
                onChange={handleSegmentFilesSelect}
                className="hidden-file-input"
              />
              <label 
                htmlFor={`segment-input-${type}`}
                className={`upload-btn segment-upload-btn ${isUploadingSegments ? 'uploading' : ''}`}
              >
                {isUploadingSegments ? `Uploading... ${segmentUploadProgress}%` : '📂 Select Segment Files'}
              </label>

              {isUploadingSegments && (
                <div className="progress-bar">
                  <div className="progress-fill" style={{ width: `${segmentUploadProgress}%` }} />
                </div>
              )}
            </>
          ) : (
            <div className="uploaded-segments-list">
              <div className="segments-list-header">
                <h4>📊 Uploaded Segments ({uploadedSegments.length})</h4>
                <button className="clear-segments-btn" onClick={handleClearSegments}>
                  Clear All
                </button>
              </div>
              
              <div className="segments-list">
                {uploadedSegments.map((seg, idx) => (
                  <div key={seg.filename} className="segment-item">
                    <span className="segment-index">{idx + 1}</span>
                    <div className="segment-info">
                      <span className="segment-name" title={seg.filename}>
                        {seg.filename.length > 25 ? seg.filename.slice(0, 22) + '...' : seg.filename}
                      </span>
                      {seg.duration && (
                        <span className="segment-duration">
                          {formatTime(seg.duration)}
                        </span>
                      )}
                    </div>
                    <div className="segment-actions">
                      <button 
                        className="segment-move-btn"
                        onClick={() => handleMoveSegmentUp(idx)}
                        disabled={idx === 0}
                        title="Move up"
                      >
                        ↑
                      </button>
                      <button 
                        className="segment-move-btn"
                        onClick={() => handleMoveSegmentDown(idx)}
                        disabled={idx === uploadedSegments.length - 1}
                        title="Move down"
                      >
                        ↓
                      </button>
                      <button 
                        className="segment-remove-btn"
                        onClick={() => handleRemoveSegment(idx)}
                        title="Remove"
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              <div className="segments-ready-notice">
                ✅ Segments ready for comparison
              </div>

              {/* Add more segments button */}
              <input
                ref={segmentInputRef}
                id={`segment-input-add-${type}`}
                type="file"
                accept="video/*"
                multiple
                onChange={handleSegmentFilesSelect}
                className="hidden-file-input"
              />
              <label 
                htmlFor={`segment-input-add-${type}`}
                className="add-more-segments-btn"
              >
                + Add More Segments
              </label>
            </div>
          )}
        </div>
      )}

      {/* Upload Section - Only show in 'process' mode */}
      {mode === 'process' && !videoUrl && (
        <div className="upload-section">
          <input
            ref={fileInputRef}
            id={`file-input-${type}`}
            type="file"
            accept="video/*"
            onChange={handleFileSelect}
            className="hidden-file-input"
          />
          <label 
            htmlFor={`file-input-${type}`}
            className={`upload-btn ${isUploading ? 'uploading' : ''}`}
          >
            {isUploading ? `Uploading... ${uploadProgress}%` : '📁 Upload Video File'}
          </label>

          {isInstructor && (
            <>
              <div className="upload-divider">
                <span>or</span>
              </div>
              <div className="youtube-section">
                <input
                  type="text"
                  placeholder="YouTube URL (e.g., https://youtube.com/watch?v=...)"
                  value={youtubeUrl}
                  onChange={(e) => setYoutubeUrl(e.target.value)}
                  disabled={isDownloading}
                  className="youtube-input"
                />
                <div className="youtube-time-inputs">
                  <input
                    type="text"
                    placeholder="Start (MM:SS)"
                    value={youtubeStartTime}
                    onChange={(e) => setYoutubeStartTime(e.target.value)}
                    disabled={isDownloading}
                  />
                  <input
                    type="text"
                    placeholder="End (MM:SS)"
                    value={youtubeEndTime}
                    onChange={(e) => setYoutubeEndTime(e.target.value)}
                    disabled={isDownloading}
                  />
                </div>
                
                {/* Quality Selection */}
                <div className="quality-selection">
                  <label className="quality-label">Quality:</label>
                  <div className="quality-options">
                    {qualityOptions.map(opt => (
                      <button
                        key={opt.value}
                        className={`quality-btn ${youtubeQuality === opt.value ? 'active' : ''}`}
                        onClick={() => setYoutubeQuality(opt.value)}
                        disabled={isDownloading}
                        title={opt.description}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>

                {!isDownloading ? (
                  <button 
                    className="youtube-btn"
                    onClick={handleYoutubeDownload}
                    disabled={!youtubeUrl.trim()}
                  >
                    📺 Download from YouTube
                  </button>
                ) : (
                  <div className="download-progress-panel">
                    <div className="download-progress-header">
                      <span className="download-status">
                        <span className="spinner-icon">⏳</span>
                        {downloadProgress?.message || 'Downloading...'}
                      </span>
                      <span className="download-percent">{downloadProgress?.progress || 0}%</span>
                    </div>
                    <div className="progress-bar">
                      <div 
                        className="progress-fill animated" 
                        style={{ width: `${downloadProgress?.progress || 0}%` }} 
                      />
                    </div>
                    <div className="download-stats">
                      {downloadProgress?.downloadSpeed && (
                        <span className="download-speed">
                          🚀 {downloadProgress.downloadSpeed}
                        </span>
                      )}
                      {downloadProgress?.downloadedSize && (
                        <span className="download-size">
                          📦 {downloadProgress.downloadedSize}
                        </span>
                      )}
                      {downloadProgress?.etaSeconds ? (
                        <span className="download-eta">
                          ⏱️ {Math.floor(downloadProgress.etaSeconds / 60)}:{String(downloadProgress.etaSeconds % 60).padStart(2, '0')} remaining
                        </span>
                      ) : calculateETA(downloadProgress?.progress, downloadStartTime) && (
                        <span className="download-eta">
                          ⏱️ {calculateETA(downloadProgress?.progress, downloadStartTime)}
                        </span>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </>
          )}

          {isUploading && (
            <div className="progress-bar">
              <div className="progress-fill" style={{ width: `${uploadProgress}%` }} />
            </div>
          )}
        </div>
      )}

      {/* Video Player */}
      {videoUrl && (
        <div className="video-section">
          <div className="video-container">
            <video
              ref={videoRef}
              src={videoUrl}
              controls
              onTimeUpdate={handleTimeUpdate}
              className="video-player"
            />
          </div>

          {videoInfo && (
            <>
              <div className="video-info">
                <span>Duration: {formatTime(videoInfo.duration)}</span>
                <span>•</span>
                <span>{videoInfo.width}x{videoInfo.height}</span>
              </div>

              {/* Timeline */}
              <div className="timeline" onClick={handleTimelineClick}>
                <div 
                  className="timeline-progress" 
                  style={{ width: `${(currentTime / videoInfo.duration) * 100}%` }}
                />
                <div 
                  className="trim-region"
                  style={{
                    left: `${((trimStart || 0) / videoInfo.duration) * 100}%`,
                    width: `${(((trimEnd || videoInfo.duration) - (trimStart || 0)) / videoInfo.duration) * 100}%`
                  }}
                />
                <div 
                  className="playhead"
                  style={{ left: `${(currentTime / videoInfo.duration) * 100}%` }}
                />
              </div>

              <div className="current-time">
                Current: {formatTime(currentTime)}
              </div>

              {/* Trim Controls */}
              <div className="trim-controls">
                <h4>✂️ Trim Video</h4>
                <div className="trim-buttons">
                  <button onClick={handleSetTrimStart} disabled={isProcessing}>
                    Set Start
                  </button>
                  <button onClick={handleSetTrimEnd} disabled={isProcessing}>
                    Set End
                  </button>
                  <button onClick={handleResetTrim} disabled={isProcessing} className="reset-btn">
                    Reset
                  </button>
                </div>
                <div className="trim-info">
                  {formatTime(trimStart || 0)} → {formatTime(trimEnd || videoInfo.duration)}
                  <span className="trim-duration">({formatTime(trimDuration)})</span>
                </div>
              </div>

              {/* Segment Controls */}
              <div className="segment-controls">
                <h4>📊 Split into Segments</h4>
                <p className="segment-tip">
                  Shorter segments (2-5 min) give better AI feedback
                </p>
                <div className="segment-inputs">
                  <label>
                    <span>Minutes:</span>
                    <input
                      type="number"
                      min="0"
                      max="20"
                      value={segmentMinutes}
                      onChange={(e) => setSegmentMinutes(parseInt(e.target.value) || 0)}
                      disabled={isProcessing}
                    />
                  </label>
                  <label>
                    <span>Seconds:</span>
                    <input
                      type="number"
                      min="0"
                      max="59"
                      value={segmentSeconds}
                      onChange={(e) => setSegmentSeconds(parseInt(e.target.value) || 0)}
                      disabled={isProcessing}
                    />
                  </label>
                </div>
                
                {segmentsPreview.length > 0 && (
                  <div className="segments-preview">
                    <p>Will create <strong>{segmentsPreview.length} segment{segmentsPreview.length !== 1 ? 's' : ''}</strong></p>
                    <div className="preview-list">
                      {segmentsPreview.slice(0, 5).map((seg, idx) => (
                        <div key={idx} className="preview-item">
                          Segment {seg.index}: {formatTime(seg.start)} → {formatTime(seg.end)}
                        </div>
                      ))}
                      {segmentsPreview.length > 5 && (
                        <div className="preview-item more">
                          +{segmentsPreview.length - 5} more...
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Process Button */}
              <div className="process-section">
                {isProcessing ? (
                  <div className="processing-status">
                    <div className="processing-header">
                      <span>{processingMessage}</span>
                      <span>{processingProgress}%</span>
                    </div>
                    <div className="progress-bar">
                      <div className="progress-fill" style={{ width: `${processingProgress}%` }} />
                    </div>
                  </div>
                ) : segments.length > 0 ? (
                  <div className="segments-ready">
                    <div className="ready-header">
                      ✅ {segments.length} segment{segments.length !== 1 ? 's' : ''} ready for comparison
                    </div>
                    <button 
                      className="reprocess-btn"
                      onClick={() => setSegments([])}
                    >
                      Start Over
                    </button>
                  </div>
                ) : (
                  <button 
                    className="process-btn"
                    onClick={handleProcessVideo}
                    disabled={!videoInfo || segmentsPreview.length === 0}
                  >
                    ▶️ Process Video
                  </button>
                )}
              </div>

              {/* Change video button */}
              <button 
                className="change-video-btn"
                onClick={() => {
                  setVideoUrl('');
                  setVideoInfo(null);
                  setSegments([]);
                  setTrimStart(0);
                  setTrimEnd(null);
                  if (onSegmentsReady) {
                    onSegmentsReady([]);
                  }
                }}
                disabled={isProcessing}
              >
                Change Video
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

export default VideoPreparationPanel;

