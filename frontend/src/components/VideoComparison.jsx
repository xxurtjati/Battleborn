import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import ProgressIndicator from './ProgressIndicator';
import './VideoComparison.css';

function VideoComparison() {
  const [instructorSegments, setInstructorSegments] = useState([]);
  const [userSegments, setUserSegments] = useState([]);
  const [comparisons, setComparisons] = useState([]);
  const [isComparing, setIsComparing] = useState(false);
  const [overallMatch, setOverallMatch] = useState(null);

  // YouTube download states
  const [youtubeUrl, setYoutubeUrl] = useState('');
  const [youtubeStartTime, setYoutubeStartTime] = useState('');
  const [youtubeEndTime, setYoutubeEndTime] = useState('');
  const [youtubeQuality, setYoutubeQuality] = useState('balanced');
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(null);
  const [youtubeVideo, setYoutubeVideo] = useState(null);

  // UI states
  const [expandedResults, setExpandedResults] = useState(new Set());

  const progressPollRef = useRef(null);

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
        setInstructorSegments([{
          filename: job.result.filename,
          url: job.result.url
        }]);
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

    setIsDownloading(true);
    setDownloadProgress(null);

    try {
      const response = await axios.post('/api/video/download-youtube', {
        url: youtubeUrl,
        startTime: startSecs,
        endTime: endSecs,
        quality: youtubeQuality
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

  const handleLoadSegments = async (type) => {
    try {
      const response = await axios.get('/api/video/outputs');
      const allSegments = response.data.outputs;

      // Allow user to manually select which segments belong to which video
      if (type === 'instructor') {
        setInstructorSegments(allSegments);
      } else {
        setUserSegments(allSegments);
      }
    } catch (error) {
      console.error('Error loading segments:', error);
      alert('Failed to load segments');
    }
  };

  const handleCompare = async () => {
    if (instructorSegments.length === 0 || userSegments.length === 0) {
      alert('Please select both instructor and user segments');
      return;
    }

    if (instructorSegments.length !== userSegments.length) {
      alert('Instructor and user must have the same number of segments');
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

  return (
    <div className="video-comparison">
      <div className="comparison-header">
        <h2>Video Comparison</h2>
        <p>Compare user workout submissions against instructor videos using AI analysis</p>
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
            {isDownloading ? 'Downloading...' : 'Download YouTube Segment'}
          </button>

          {downloadProgress && isDownloading && (
            <ProgressIndicator
              progress={downloadProgress.progress}
              message={downloadProgress.message}
              estimatedTimeRemaining={downloadProgress.estimatedTimeRemaining}
            />
          )}

          {youtubeVideo && !isDownloading && (
            <div className="youtube-success">
              ✓ Downloaded: {youtubeVideo.filename} ({Math.round(youtubeVideo.duration)}s, {(youtubeVideo.size / (1024 * 1024)).toFixed(1)}MB) - Quality: {youtubeVideo.quality}
            </div>
          )}
        </div>
      </div>

      <div className="divider">OR</div>

      <div className="segment-selectors">
        <div className="selector-section">
          <h3>Instructor Segments</h3>
          <button
            className="load-button"
            onClick={() => handleLoadSegments('instructor')}
            disabled={isComparing || isDownloading}
          >
            Load Instructor Segments
          </button>
          <div className="segment-count">
            {instructorSegments.length} segments loaded
          </div>
        </div>

        <div className="selector-section">
          <h3>User Segments</h3>
          <button
            className="load-button"
            onClick={() => handleLoadSegments('user')}
            disabled={isComparing || isDownloading}
          >
            Load User Segments
          </button>
          <div className="segment-count">
            {userSegments.length} segments loaded
          </div>
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
            <button
              className="compare-all-button"
              onClick={handleCompare}
              disabled={isComparing}
            >
              {isComparing ? 'Comparing...' : 'Compare All Segments'}
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
    </div>
  );
}

export default VideoComparison;
