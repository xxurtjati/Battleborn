import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import ProgressIndicator from './ProgressIndicator';
import SegmentPicker from './SegmentPicker';
import './VideoComparison.css';

function VideoComparison() {
  const [instructorSegments, setInstructorSegments] = useState([]);
  const [userSegments, setUserSegments] = useState([]);
  const [comparisons, setComparisons] = useState([]);
  const [isComparing, setIsComparing] = useState(false);
  const [overallMatch, setOverallMatch] = useState(null);

  // Segment picker modal state
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerType, setPickerType] = useState(null); // 'instructor' or 'user'

  // YouTube download states
  const [youtubeUrl, setYoutubeUrl] = useState('');
  const [youtubeStartTime, setYoutubeStartTime] = useState('');
  const [youtubeEndTime, setYoutubeEndTime] = useState('');
  const [youtubeQuality, setYoutubeQuality] = useState('balanced');
  const [intervalMinutes, setIntervalMinutes] = useState(2);
  const [intervalSeconds, setIntervalSeconds] = useState(30);
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(null);
  const [youtubeVideo, setYoutubeVideo] = useState(null);
  const [estimatedSegmentCount, setEstimatedSegmentCount] = useState(0);

  // Segment upload states
  const [isUploadingInstructor, setIsUploadingInstructor] = useState(false);
  const [isUploadingUser, setIsUploadingUser] = useState(false);
  const [uploadProgress, setUploadProgress] = useState({ instructor: 0, user: 0 });

  // UI states
  const [expandedResults, setExpandedResults] = useState(new Set());

  const progressPollRef = useRef(null);
  const instructorFileInputRef = useRef(null);
  const userFileInputRef = useRef(null);

  // Convert MM:SS format to seconds
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

  // Calculate estimated segment count when times or interval change
  useEffect(() => {
    const startSecs = parseTimeToSeconds(youtubeStartTime);
    const endSecs = parseTimeToSeconds(youtubeEndTime);
    const totalInterval = intervalMinutes * 60 + intervalSeconds;

    if (startSecs !== undefined && endSecs !== undefined && totalInterval > 0) {
      const totalDuration = endSecs - startSecs;
      const count = Math.ceil(totalDuration / totalInterval);
      setEstimatedSegmentCount(count);
    } else {
      setEstimatedSegmentCount(0);
    }
  }, [youtubeStartTime, youtubeEndTime, intervalMinutes, intervalSeconds]);

  // Poll for job progress
  const pollProgress = async (jobId) => {
    try {
      const response = await axios.get(`/api/video/progress/${jobId}`);
      const job = response.data;

      setDownloadProgress(job);

      if (job.status === 'completed') {
        clearInterval(progressPollRef.current);
        setIsDownloading(false);
        setYoutubeVideo(job.result);

        // Auto-load segments for comparison
        if (job.result.segments && job.result.segments.length > 0) {
          // Map segments to the format expected by comparison
          const segments = job.result.segments.map(seg => ({
            filename: seg.filename,
            url: seg.url
          }));
          setInstructorSegments(segments);
        } else if (job.result.filename) {
          // Single video, no segments
          setInstructorSegments([{
            filename: job.result.filename,
            url: job.result.url
          }]);
        }
      } else if (job.status === 'failed') {
        clearInterval(progressPollRef.current);
        setIsDownloading(false);
        alert('Download failed: ' + job.error);
      }
    } catch (error) {
      console.error('Progress poll error:', error);
    }
  };

  const handleDownloadYoutube = async () => {
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

    const totalInterval = intervalMinutes * 60 + intervalSeconds;
    if (totalInterval <= 0) {
      alert('Please enter a valid segment interval');
      return;
    }

    setIsDownloading(true);
    setDownloadProgress(null);

    try {
      const response = await axios.post('/api/video/download-youtube', {
        url: youtubeUrl,
        startTime: startSecs,
        endTime: endSecs,
        quality: youtubeQuality,
        intervalMinutes,
        intervalSeconds
      });

      const jobId = response.data.jobId;

      // Start polling for progress
      progressPollRef.current = setInterval(() => {
        pollProgress(jobId);
      }, 1000);

    } catch (error) {
      console.error('YouTube download error:', error);
      alert('Failed to start YouTube download: ' + (error.response?.data?.error || error.message));
      setIsDownloading(false);
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

  const handleLoadSegments = (type) => {
    setPickerType(type);
    setPickerOpen(true);
  };

  const handleSegmentsSelected = (segments) => {
    if (pickerType === 'instructor') {
      setInstructorSegments(segments);
    } else {
      setUserSegments(segments);
    }
  };

  // Upload pre-split segment files
  const handleUploadSegments = async (files, type) => {
    if (!files || files.length === 0) return;

    const setUploading = type === 'instructor' ? setIsUploadingInstructor : setIsUploadingUser;
    const setSegments = type === 'instructor' ? setInstructorSegments : setUserSegments;

    setUploading(true);
    setUploadProgress(prev => ({ ...prev, [type]: 0 }));

    try {
      const formData = new FormData();

      // Sort files by name to maintain order
      const sortedFiles = Array.from(files).sort((a, b) => a.name.localeCompare(b.name));

      sortedFiles.forEach(file => {
        formData.append('segments', file);
      });
      formData.append('type', type);
      formData.append('prefix', `${type}_seg`);

      const response = await axios.post('/api/video/upload-segments', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        onUploadProgress: (progressEvent) => {
          const percentCompleted = Math.round((progressEvent.loaded * 100) / progressEvent.total);
          setUploadProgress(prev => ({ ...prev, [type]: percentCompleted }));
        }
      });

      // Map segments to the format expected by comparison
      const segments = response.data.segments.map(seg => ({
        filename: seg.filename,
        url: seg.url,
        duration: seg.duration,
        size: seg.size
      }));

      setSegments(segments);
      alert(`${segments.length} segment(s) uploaded successfully!`);

    } catch (error) {
      console.error('Segment upload error:', error);
      alert('Failed to upload segments: ' + (error.response?.data?.error || error.message));
    } finally {
      setUploading(false);
      setUploadProgress(prev => ({ ...prev, [type]: 0 }));
    }
  };

  const handleInstructorFileChange = (e) => {
    handleUploadSegments(e.target.files, 'instructor');
    e.target.value = ''; // Reset input
  };

  const handleUserFileChange = (e) => {
    handleUploadSegments(e.target.files, 'user');
    e.target.value = ''; // Reset input
  };

  const handleCompare = async () => {
    if (instructorSegments.length === 0 || userSegments.length === 0) {
      alert('Please complete Step 1 and Step 2: Add both instructor and user segments');
      return;
    }

    if (instructorSegments.length !== userSegments.length) {
      alert(`Segment count mismatch: Instructor has ${instructorSegments.length} segments, User has ${userSegments.length} segments.\n\nPlease ensure both have the same number of segments.`);
      return;
    }

    // Validate 20-minute limit
    const validation = validateSegmentsForComparison();
    if (validation.errors.length > 0) {
      alert('Cannot start comparison. Please fix these errors:\n\n' + validation.errors.join('\n') + '\n\nEach segment must be under 20 minutes.');
      return;
    }

    setIsComparing(true);
    setComparisons([]);
    setOverallMatch(null);

    try {
      const comparisonPairs = instructorSegments.map((inst, idx) => ({
        instructorVideo: inst.filename,
        userVideo: userSegments[idx].filename
      }));

      const response = await axios.post('/api/compare/batch', {
        comparisons: comparisonPairs
      });

      setComparisons(response.data.results);
      setOverallMatch(response.data.overallMatchPercentage);

    } catch (error) {
      console.error('Comparison error:', error);
      alert('Failed to compare videos: ' + (error.response?.data?.error || error.message));
    } finally {
      setIsComparing(false);
    }
  };

  const handleSingleCompare = async (instructorFile, userFile, index) => {
    setIsComparing(true);

    try {
      const response = await axios.post('/api/compare/analyze', {
        instructorVideo: instructorFile,
        userVideo: userFile,
        segmentIndex: index + 1
      });

      // Update the specific comparison result
      setComparisons(prev => {
        const newComparisons = [...prev];
        newComparisons[index] = response.data;
        return newComparisons;
      });

    } catch (error) {
      console.error('Comparison error:', error);
      alert('Failed to compare segment: ' + (error.response?.data?.error || error.message));
    } finally {
      setIsComparing(false);
    }
  };

  const getScoreColor = (percentage) => {
    if (percentage >= 90) return '#10b981';
    if (percentage >= 75) return '#3b82f6';
    if (percentage >= 60) return '#f59e0b';
    return '#ef4444';
  };

  const formatTime = (timeStr) => {
    return timeStr || 'N/A';
  };

  // Validate segments for 20-minute maximum limit
  const validateSegmentsForComparison = () => {
    const errors = [];
    const guidance = [];
    const totalSegments = Math.max(instructorSegments.length, userSegments.length);
    
    // Check instructor segments for 20-minute limit
    instructorSegments.forEach((seg, idx) => {
      if (seg.duration && seg.duration > 1200) { // 20 minutes = 1200 seconds
        errors.push(`Instructor Segment ${idx + 1}: ${(seg.duration / 60).toFixed(1)} minutes (exceeds 20 min maximum limit)`);
      }
    });

    // Check user segments for 20-minute limit
    userSegments.forEach((seg, idx) => {
      if (seg.duration && seg.duration > 1200) { // 20 minutes = 1200 seconds
        errors.push(`User Segment ${idx + 1}: ${(seg.duration / 60).toFixed(1)} minutes (exceeds 20 min maximum limit)`);
      }
    });

    // Guidance about segment count (only if no errors)
    if (totalSegments === 0) {
      return { errors, guidance: [], totalSegments: 0 };
    }
    
    if (errors.length === 0) {
      if (totalSegments === 1) {
        guidance.push({
          type: 'info',
          message: '💡 Tip: Breaking your video into multiple shorter segments (2-5 minutes each) will give the AI more detailed and accurate feedback.'
        });
      } else if (totalSegments < 3) {
        guidance.push({
          type: 'info',
          message: '💡 Good! More segments = better AI analysis. Consider splitting into even shorter segments (2-3 minutes) for optimal results.'
        });
      } else {
        guidance.push({
          type: 'success',
          message: `✅ Excellent! ${totalSegments} segments will provide detailed, accurate AI feedback.`
        });
      }
    }

    return { errors, guidance, totalSegments };
  };

  // Check if steps are completed
  const getStepStatus = () => {
    return {
      step1: userSegments.length > 0, // User content added
      step2: instructorSegments.length > 0, // Instructor content added
      step3: instructorSegments.length > 0 && 
             userSegments.length > 0 && 
             instructorSegments.length === userSegments.length // Segments matched
    };
  };

  const toggleExpandedResult = (index) => {
    setExpandedResults(prev => {
      const newSet = new Set(prev);
      if (newSet.has(index)) {
        newSet.delete(index);
      } else {
        newSet.add(index);
      }
      return newSet;
    });
  };

  const stepStatus = getStepStatus();
  const segmentValidation = validateSegmentsForComparison();

  return (
    <div className="video-comparison">
      <div className="comparison-header">
        <h2>Video Comparison</h2>
        <p>Compare user workout submissions against instructor videos using AI analysis</p>
      </div>

      {/* Step-by-Step Guide */}
      <div className="workflow-guide">
        <h3>📋 Workflow Guide</h3>
        <p className="workflow-intro">
          Complete these steps in any order. Videos must be manually synced so the AI can properly compare them.
        </p>
        
        <div className="steps-container">
          <div className={`workflow-step ${stepStatus.step1 ? 'completed' : ''}`}>
            <div className="step-header">
              <div className="step-number">
                {stepStatus.step1 ? '✓' : '1'}
              </div>
              <h4>Step 1: Add & Trim User Content</h4>
            </div>
            <div className="step-content">
              <p>Go to the <strong>Video Splitter</strong> tab to:</p>
              <ul>
                <li>Upload your workout video</li>
                <li>Trim it to match the instructor video timing</li>
                <li>Split into segments (max 20 minutes each)</li>
                <li>Upload the segments here or browse saved segments</li>
              </ul>
              <p className="step-note">
                ⚠️ <strong>Important:</strong> Manually sync your video with the instructor video. 
                The AI comparison quality depends on proper alignment.
              </p>
              {stepStatus.step1 && (
                <div className="step-status-badge">
                  ✓ {userSegments.length} user segment{userSegments.length !== 1 ? 's' : ''} loaded
                </div>
              )}
            </div>
          </div>

          <div className={`workflow-step ${stepStatus.step2 ? 'completed' : ''}`}>
            <div className="step-header">
              <div className="step-number">
                {stepStatus.step2 ? '✓' : '2'}
              </div>
              <h4>Step 2: Add & Trim Instructor Content</h4>
            </div>
            <div className="step-content">
              <p>Add the instructor/reference video:</p>
              <ul>
                <li>Download from YouTube (with auto-segmentation)</li>
                <li>Or upload pre-split instructor segments</li>
                <li>Ensure segments match user segments in timing</li>
                <li>Each segment must be under 20 minutes</li>
              </ul>
              {stepStatus.step2 && (
                <div className="step-status-badge">
                  ✓ {instructorSegments.length} instructor segment{instructorSegments.length !== 1 ? 's' : ''} loaded
                </div>
              )}
            </div>
          </div>

          <div className={`workflow-step ${stepStatus.step3 ? 'completed' : 'pending'}`}>
            <div className="step-header">
              <div className="step-number">
                {stepStatus.step3 ? '✓' : '3'}
              </div>
              <h4>Step 3: Match Segments & Review</h4>
            </div>
            <div className="step-content">
              <p>Before AI review, ensure:</p>
              <ul>
                <li>Same number of user and instructor segments</li>
                <li>Segments are properly aligned/synced</li>
              </ul>
              
              <div className="ai-accuracy-tip">
                <strong>🎯 AI Accuracy Tip:</strong>
                <p>
                  The more you break up your videos into shorter segments, the more accurate and detailed 
                  the AI feedback will be. Instead of one long segment, consider splitting into multiple 
                  2-5 minute segments for better analysis of form, timing, and technique.
                </p>
                <p className="tip-example">
                  <strong>Example:</strong> A 10-minute workout split into 5 segments of 2 minutes each 
                  will provide much more detailed feedback than a single 10-minute segment.
                </p>
                <p className="tip-limit" style={{ marginTop: '0.75rem', padding: '0.75rem', background: '#1a1a1a', borderRadius: '6px', borderLeft: '3px solid #f59e0b' }}>
                  <strong>⚠️ Maximum Limit:</strong> Each segment must be under <strong>20 minutes</strong>. 
                  Segments longer than 20 minutes cannot be compared by the AI.
                </p>
              </div>

              {segmentValidation.errors.length > 0 && (
                <div className="validation-errors">
                  <strong>❌ Cannot compare - segments exceed 20 minute limit:</strong>
                  <ul>
                    {segmentValidation.errors.map((error, i) => (
                      <li key={i}>{error}</li>
                    ))}
                  </ul>
                  <p style={{ marginTop: '0.75rem', fontSize: '0.9rem' }}>
                    Please split these segments into smaller parts (under 20 minutes each) before comparing.
                  </p>
                </div>
              )}

              {segmentValidation.guidance.length > 0 && segmentValidation.errors.length === 0 && (
                <div className="segment-guidance">
                  {segmentValidation.guidance.map((item, i) => (
                    <div key={i} className={`guidance-item guidance-${item.type}`}>
                      {item.message}
                    </div>
                  ))}
                </div>
              )}

              {stepStatus.step3 && (
                <div className="step-status-badge success">
                  ✓ Ready for AI comparison! {instructorSegments.length} segment pair{instructorSegments.length !== 1 ? 's' : ''} matched
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="youtube-section">
        <h3>YouTube Instructor Video</h3>
        <p className="section-description">Download a trimmed section from a YouTube workout video to use as instructor reference</p>

        <div className="youtube-inputs">
          <div className="input-group">
            <label>YouTube URL</label>
            <input
              type="text"
              placeholder="https://youtube.com/watch?v=..."
              value={youtubeUrl}
              onChange={(e) => setYoutubeUrl(e.target.value)}
              disabled={isDownloading}
              className="youtube-url-input"
            />
          </div>

          <div className="time-inputs">
            <div className="input-group">
              <label>Start Time (MM:SS or seconds)</label>
              <input
                type="text"
                placeholder="5:30 or 330"
                value={youtubeStartTime}
                onChange={(e) => setYoutubeStartTime(e.target.value)}
                disabled={isDownloading}
              />
            </div>

            <div className="input-group">
              <label>End Time (MM:SS or seconds)</label>
              <input
                type="text"
                placeholder="15:30 or 930"
                value={youtubeEndTime}
                onChange={(e) => setYoutubeEndTime(e.target.value)}
                disabled={isDownloading}
              />
            </div>
          </div>

          <div className="interval-section">
            <label className="section-label">⚡ Auto-Segment Into Intervals</label>
            <div className="interval-inputs">
              <div className="input-group">
                <label>Minutes</label>
                <input
                  type="number"
                  min="0"
                  max="30"
                  value={intervalMinutes}
                  onChange={(e) => setIntervalMinutes(parseInt(e.target.value) || 0)}
                  disabled={isDownloading}
                  className="interval-input"
                />
              </div>
              <div className="input-group">
                <label>Seconds</label>
                <input
                  type="number"
                  min="0"
                  max="59"
                  value={intervalSeconds}
                  onChange={(e) => setIntervalSeconds(parseInt(e.target.value) || 0)}
                  disabled={isDownloading}
                  className="interval-input"
                />
              </div>
            </div>
            {estimatedSegmentCount > 0 && (
              <div className="segment-preview">
                → Will create <strong>{estimatedSegmentCount} segments</strong> of {intervalMinutes}m {intervalSeconds}s each
              </div>
            )}
          </div>

          <div className="input-group">
            <label>Video Quality</label>
            <select
              value={youtubeQuality}
              onChange={(e) => setYoutubeQuality(e.target.value)}
              disabled={isDownloading}
              className="quality-select"
            >
              <option value="fast">Fast (480p) - Smaller files, faster download</option>
              <option value="balanced">Balanced (720p) - Recommended</option>
              <option value="best">Best (1080p) - Larger files, slower download</option>
            </select>
          </div>

          <button
            className="download-youtube-button"
            onClick={handleDownloadYoutube}
            disabled={isDownloading || !youtubeUrl.trim()}
          >
            {isDownloading ? 'Downloading...' : 'Download & Create Segments'}
          </button>

          {downloadProgress && isDownloading && (
            <>
              <ProgressIndicator
                progress={downloadProgress.progress}
                message={downloadProgress.message}
                estimatedTimeRemaining={downloadProgress.estimatedTimeRemaining}
              />

              {downloadProgress.segments && downloadProgress.segments.length > 0 && (
                <div className="segment-progress-list">
                  <h4>Segments Progress</h4>
                  {downloadProgress.segments.map((segment, idx) => (
                    <div key={idx} className={`segment-item segment-${segment.status}`}>
                      <div className="segment-info">
                        <span className="segment-status-icon">
                          {segment.status === 'completed' && '✅'}
                          {segment.status === 'processing' && '⏳'}
                          {segment.status === 'pending' && '⬜'}
                        </span>
                        <span className="segment-name">Segment {segment.index}</span>
                        <span className="segment-time">{segment.timeRange}</span>
                      </div>
                      {segment.size && (
                        <span className="segment-size">
                          {(segment.size / (1024 * 1024)).toFixed(1)} MB
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          {youtubeVideo && !isDownloading && (
            <div className="youtube-success-section">
              {youtubeVideo.segments && youtubeVideo.segments.length > 0 ? (
                <>
                  <div className="youtube-success">
                    ✓ Downloaded and split into {youtubeVideo.segments.length} segments - Ready for comparison!
                  </div>
                  <div className="completed-segments-list">
                    {youtubeVideo.segments.map((segment, idx) => (
                      <div key={idx} className="completed-segment">
                        <span className="segment-icon">✅</span>
                        <span className="segment-label">Segment {segment.index}:</span>
                        <span className="segment-details">
                          {segment.timeRange} ({(segment.size / (1024 * 1024)).toFixed(1)} MB)
                        </span>
                        <a
                          href={segment.url}
                          download={segment.filename}
                          className="segment-download-btn"
                          title="Download this segment"
                        >
                          ⬇
                        </a>
                      </div>
                    ))}
                  </div>
                  <button
                    className="download-all-btn"
                    onClick={() => {
                      youtubeVideo.segments.forEach((segment, idx) => {
                        setTimeout(() => {
                          const a = document.createElement('a');
                          a.href = segment.url;
                          a.download = segment.filename;
                          document.body.appendChild(a);
                          a.click();
                          document.body.removeChild(a);
                        }, idx * 500); // Stagger downloads
                      });
                    }}
                  >
                    Download All Segments
                  </button>
                </>
              ) : (
                <div className="youtube-success">
                  ✓ Downloaded: {youtubeVideo.filename} ({Math.round(youtubeVideo.duration)}s, {(youtubeVideo.size / (1024 * 1024)).toFixed(1)}MB) - Quality: {youtubeVideo.quality}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="divider">OR</div>

      <div className="segment-selectors">
        <div className="selector-section">
          <h3>Instructor Segments</h3>
          <div className="selector-buttons">
            <button
              className="load-button"
              onClick={() => handleLoadSegments('instructor')}
              disabled={isComparing || isDownloading || isUploadingInstructor}
            >
              Browse Saved Segments
            </button>
            <input
              ref={instructorFileInputRef}
              type="file"
              accept="video/*"
              multiple
              onChange={handleInstructorFileChange}
              style={{ display: 'none' }}
            />
            <button
              className="upload-button"
              onClick={() => instructorFileInputRef.current?.click()}
              disabled={isComparing || isDownloading || isUploadingInstructor}
            >
              {isUploadingInstructor ? `Uploading... ${uploadProgress.instructor}%` : 'Upload Pre-Split Files'}
            </button>
          </div>
          {isUploadingInstructor && (
            <div className="upload-progress-bar">
              <div className="upload-progress-fill" style={{ width: `${uploadProgress.instructor}%` }} />
            </div>
          )}
          <div className="segment-count">
            {instructorSegments.length} segments loaded
          </div>
          {instructorSegments.length > 0 && (
            <div className="segment-list-preview">
              {instructorSegments.map((seg, idx) => (
                <div key={idx} className="segment-list-item">
                  {seg.filename}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="selector-section">
          <h3>User Segments</h3>
          <div className="selector-buttons">
            <button
              className="load-button"
              onClick={() => handleLoadSegments('user')}
              disabled={isComparing || isDownloading || isUploadingUser}
            >
              Browse Saved Segments
            </button>
            <input
              ref={userFileInputRef}
              type="file"
              accept="video/*"
              multiple
              onChange={handleUserFileChange}
              style={{ display: 'none' }}
            />
            <button
              className="upload-button"
              onClick={() => userFileInputRef.current?.click()}
              disabled={isComparing || isDownloading || isUploadingUser}
            >
              {isUploadingUser ? `Uploading... ${uploadProgress.user}%` : 'Upload Pre-Split Files'}
            </button>
          </div>
          {isUploadingUser && (
            <div className="upload-progress-bar">
              <div className="upload-progress-fill" style={{ width: `${uploadProgress.user}%` }} />
            </div>
          )}
          <div className="segment-count">
            {userSegments.length} segments loaded
          </div>
          {userSegments.length > 0 && (
            <div className="segment-list-preview">
              {userSegments.map((seg, idx) => (
                <div key={idx} className="segment-list-item">
                  {seg.filename}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {instructorSegments.length > 0 && userSegments.length > 0 && (
        <>
          <div className="segment-pairs">
            <h3>Segment Pairs to Compare</h3>
            {Array.from({ length: Math.min(instructorSegments.length, userSegments.length) }).map((_, idx) => (
              <div key={idx} className="pair-row">
                <div className="pair-info">
                  <span className="pair-number">Pair {idx + 1}</span>
                  <span className="pair-files">
                    {instructorSegments[idx]?.filename} vs {userSegments[idx]?.filename}
                  </span>
                </div>
                <button
                  className="compare-single-button"
                  onClick={() => handleSingleCompare(
                    instructorSegments[idx].filename,
                    userSegments[idx].filename,
                    idx
                  )}
                  disabled={isComparing}
                >
                  Compare This Pair
                </button>
              </div>
            ))}
          </div>

          <div className="compare-actions">
            {segmentValidation.errors.length > 0 && (
              <div className="validation-blocker">
                <strong>❌ Cannot start comparison:</strong>
                <ul>
                  {segmentValidation.errors.map((error, i) => (
                    <li key={i}>{error}</li>
                  ))}
                </ul>
                <p style={{ marginTop: '0.5rem', fontSize: '0.9rem' }}>
                  Please split segments longer than 20 minutes before comparing.
                </p>
              </div>
            )}
            {segmentValidation.guidance.length > 0 && stepStatus.step3 && segmentValidation.errors.length === 0 && (
              <div className="comparison-guidance-note">
                {segmentValidation.guidance.map((item, i) => (
                  <p key={i}>{item.message}</p>
                ))}
              </div>
            )}
            <button
              className="compare-all-button"
              onClick={handleCompare}
              disabled={isComparing || !stepStatus.step3 || segmentValidation.errors.length > 0}
              title={!stepStatus.step3 ? 'Complete all steps before comparing' : segmentValidation.errors.length > 0 ? 'Fix segment duration errors first' : ''}
            >
              {isComparing ? 'Comparing...' : 
               segmentValidation.errors.length > 0 ? 'Fix Errors to Compare' :
               !stepStatus.step3 ? 'Complete Steps 1-3 First' :
               'Compare All Segments'}
            </button>
          </div>
        </>
      )}

      {overallMatch !== null && comparisons.length > 0 && (
        <div className="overall-summary-card">
          <h3>🏆 Overall Performance Summary</h3>

          <div className="summary-stats">
            <div className="summary-stat">
              <div className="stat-label">Overall Match</div>
              <div
                className="stat-value-large"
                style={{ color: getScoreColor(overallMatch) }}
              >
                {overallMatch}%
              </div>
            </div>

            <div className="summary-stat">
              <div className="stat-label">Segments Analyzed</div>
              <div className="stat-value">{comparisons.length}</div>
            </div>

            <div className="summary-stat">
              <div className="stat-label">Average Grade</div>
              <div className="stat-value">
                {comparisons.length > 0
                  ? comparisons[0].overallScore
                  : 'N/A'}
              </div>
            </div>
          </div>

          <div className="summary-overview">
            <h4>Performance Overview</h4>
            <div className="overview-sections">
              <div className="overview-section">
                <h5>💪 Strengths</h5>
                <ul>
                  {comparisons.flatMap(c => c.strengths || [])
                    .filter((v, i, a) => a.indexOf(v) === i)
                    .slice(0, 3)
                    .map((strength, i) => (
                      <li key={i}>{strength}</li>
                    ))}
                </ul>
              </div>

              <div className="overview-section">
                <h5>🎯 Focus Areas</h5>
                <ul>
                  {comparisons.flatMap(c => c.improvements || [])
                    .filter((v, i, a) => a.indexOf(v) === i)
                    .slice(0, 3)
                    .map((improvement, i) => (
                      <li key={i}>{improvement}</li>
                    ))}
                </ul>
              </div>
            </div>

            {comparisons.some(c => c.repComparison) && (
              <div className="summary-reps">
                <h5>Rep Count Summary</h5>
                <p>
                  Total Instructor Reps: {comparisons.reduce((sum, c) => sum + (c.repComparison?.instructorTotal || 0), 0)} |
                  Total User Reps: {comparisons.reduce((sum, c) => sum + (c.repComparison?.userTotal || 0), 0)}
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {comparisons.length > 0 && (
        <div className="comparison-results">
          <h3>Detailed Comparison Results</h3>
          {comparisons.map((comparison, idx) => {
            const isExpanded = expandedResults.has(idx);
            const hasImprovements = comparison.matchPercentage < 100;

            return (
              <div key={idx} className="comparison-card">
                <div className="comparison-header-bar">
                  <h4>Segment {comparison.segmentIndex || idx + 1}</h4>
                  <div className="header-right">
                    <div
                      className="match-badge"
                      style={{ background: getScoreColor(comparison.matchPercentage) }}
                    >
                      {comparison.matchPercentage}% Match
                    </div>
                    <div className="grade-badge">{comparison.overallScore}</div>
                    {hasImprovements && (
                      <button
                        className="more-info-button"
                        onClick={() => toggleExpandedResult(idx)}
                      >
                        {isExpanded ? '▼ Less Info' : '▶ More Info'}
                      </button>
                    )}
                  </div>
                </div>

                {isExpanded && hasImprovements && (
                  <div className="comparison-details">
                <div className="analysis-section">
                  <h5>Analysis</h5>
                  <p>{comparison.analysis}</p>
                </div>

                {comparison.perMinuteAnalysis && comparison.perMinuteAnalysis.length > 0 && (
                  <div className="per-minute-section">
                    <h5>Per-Minute Breakdown</h5>
                    <div className="per-minute-list">
                      {comparison.perMinuteAnalysis.map((minute, i) => (
                        <div key={i} className="minute-card">
                          <div className="minute-header">
                            <span className="minute-number">Minute {minute.minute}</span>
                            <span
                              className="minute-match"
                              style={{ color: getScoreColor(minute.matchPercentage) }}
                            >
                              {minute.matchPercentage}%
                            </span>
                          </div>
                          <p className="minute-observation">{minute.observation}</p>
                          {minute.repCount && (
                            <div className="minute-reps">
                              Reps: Instructor {minute.repCount.instructor} vs User {minute.repCount.user}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {comparison.repComparison && (
                  <div className="rep-comparison-section">
                    <h5>Rep Count Analysis</h5>
                    <div className="rep-stats">
                      <span>Instructor: {comparison.repComparison.instructorTotal} reps</span>
                      <span>User: {comparison.repComparison.userTotal} reps</span>
                      <span className={comparison.repComparison.difference >= 0 ? 'rep-diff-positive' : 'rep-diff-negative'}>
                        Difference: {comparison.repComparison.difference > 0 ? '+' : ''}{comparison.repComparison.difference}
                      </span>
                    </div>
                    <p className="rep-analysis">{comparison.repComparison.analysis}</p>
                  </div>
                )}

                {comparison.speedAnalysis && (
                  <div className="speed-section">
                    <h5>Speed & Pace Analysis</h5>
                    <p>{comparison.speedAnalysis}</p>
                  </div>
                )}

                {comparison.formIssues && comparison.formIssues.length > 0 && (
                  <div className="form-issues-section">
                    <h5>Form Issues</h5>
                    <div className="form-issues-list">
                      {comparison.formIssues.map((issue, i) => (
                        <div key={i} className="form-issue-item">
                          <span className="issue-timestamp">{issue.timestamp}</span>
                          <span className="issue-description">{issue.issue}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="strengths-section">
                  <h5>Strengths</h5>
                  <ul>
                    {comparison.strengths?.map((strength, i) => (
                      <li key={i} className="strength-item">{strength}</li>
                    ))}
                  </ul>
                </div>

                <div className="improvements-section">
                  <h5>Areas for Improvement</h5>
                  <ul>
                    {comparison.improvements?.map((improvement, i) => (
                      <li key={i} className="improvement-item">{improvement}</li>
                    ))}
                  </ul>
                </div>

                {comparison.timestamps && comparison.timestamps.length > 0 && (
                  <div className="timestamps-section">
                    <h5>Key Observations</h5>
                    <div className="timestamps-list">
                      {comparison.timestamps.map((ts, i) => (
                        <div key={i} className="timestamp-item">
                          <span className="timestamp-time">{formatTime(ts.time)}</span>
                          <span className="timestamp-observation">{ts.observation}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                  </div>
                )}

                <div className="comparison-videos">
                  <div className="video-preview">
                    <label>Instructor</label>
                    <video src={`/outputs/${instructorSegments[idx]?.filename}`} controls />
                  </div>
                  <div className="video-preview">
                    <label>User Submission</label>
                    <video src={`/outputs/${userSegments[idx]?.filename}`} controls />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <SegmentPicker
        isOpen={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onSelect={handleSegmentsSelected}
        type={pickerType}
      />
    </div>
  );
}

export default VideoComparison;
