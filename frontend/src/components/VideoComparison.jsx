import React, { useState } from 'react';
import axios from 'axios';
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
  const [isDownloading, setIsDownloading] = useState(false);
  const [youtubeVideo, setYoutubeVideo] = useState(null);

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

    try {
      const response = await axios.post('/api/video/download-youtube', {
        url: youtubeUrl,
        startTime: startSecs,
        endTime: endSecs
      });

      setYoutubeVideo(response.data);
      setInstructorSegments([{
        filename: response.data.filename,
        url: response.data.url
      }]);

      alert('YouTube video downloaded successfully!');
    } catch (error) {
      console.error('YouTube download error:', error);
      alert('Failed to download YouTube video: ' + (error.response?.data?.error || error.message));
    } finally {
      setIsDownloading(false);
    }
  };

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

          <button
            className="download-youtube-button"
            onClick={handleDownloadYoutube}
            disabled={isDownloading || !youtubeUrl.trim()}
          >
            {isDownloading ? 'Downloading...' : 'Download YouTube Segment'}
          </button>

          {youtubeVideo && (
            <div className="youtube-success">
              ✓ Downloaded: {youtubeVideo.filename} ({Math.round(youtubeVideo.duration)}s, {(youtubeVideo.size / (1024 * 1024)).toFixed(1)}MB)
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

      {overallMatch !== null && (
        <div className="overall-result">
          <h3>Overall Match Score</h3>
          <div
            className="overall-percentage"
            style={{ color: getScoreColor(overallMatch) }}
          >
            {overallMatch}%
          </div>
          <p className="overall-description">
            Average match across {comparisons.length} segments
          </p>
        </div>
      )}

      {comparisons.length > 0 && (
        <div className="comparison-results">
          <h3>Detailed Comparison Results</h3>
          {comparisons.map((comparison, idx) => (
            <div key={idx} className="comparison-card">
              <div className="comparison-header-bar">
                <h4>Segment {comparison.segmentIndex || idx + 1}</h4>
                <div
                  className="match-badge"
                  style={{ background: getScoreColor(comparison.matchPercentage) }}
                >
                  {comparison.matchPercentage}% Match
                </div>
                <div className="grade-badge">{comparison.overallScore}</div>
              </div>

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
          ))}
        </div>
      )}
    </div>
  );
}

export default VideoComparison;
