import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import VideoPreparationPanel from './VideoPreparationPanel';
import './ComparisonPage.css';

function ComparisonPage() {
  // Segments from each panel
  const [userSegments, setUserSegments] = useState([]);
  const [instructorSegments, setInstructorSegments] = useState([]);
  
  // Processing states
  const [userProcessing, setUserProcessing] = useState(false);
  const [instructorProcessing, setInstructorProcessing] = useState(false);
  
  // Segment matching
  const [matchedPairs, setMatchedPairs] = useState([]);
  
  // Comparison state
  const [isComparing, setIsComparing] = useState(false);
  const [comparisonProgress, setComparisonProgress] = useState(0);
  const [comparisonMessage, setComparisonMessage] = useState('');
  const [currentSegment, setCurrentSegment] = useState(0);
  const [comparisonStartTime, setComparisonStartTime] = useState(null);
  const [results, setResults] = useState([]);
  const [overallScore, setOverallScore] = useState(null);
  
  // Expanded segment details state
  const [expandedSegments, setExpandedSegments] = useState({});
  
  // Progress polling ref
  const progressPollRef = useRef(null);
  
  // Validation
  const [validationErrors, setValidationErrors] = useState([]);

  // Toggle segment expansion
  const toggleSegmentExpansion = (idx) => {
    setExpandedSegments(prev => ({
      ...prev,
      [idx]: !prev[idx]
    }));
  };

  // Calculate overall stats from results
  const calculateOverallStats = () => {
    if (results.length === 0) return null;
    
    let totalRepDeficit = 0;
    const grades = [];
    
    results.forEach(result => {
      if (result.repComparison?.difference) {
        totalRepDeficit += result.repComparison.difference;
      }
      if (result.overallScore) {
        grades.push(result.overallScore);
      }
    });
    
    // Calculate average grade
    const gradeValues = { 'A+': 4.3, 'A': 4.0, 'A-': 3.7, 'B+': 3.3, 'B': 3.0, 'B-': 2.7, 
                         'C+': 2.3, 'C': 2.0, 'C-': 1.7, 'D+': 1.3, 'D': 1.0, 'D-': 0.7, 'F': 0 };
    const avgGradeValue = grades.length > 0 
      ? grades.reduce((sum, g) => sum + (gradeValues[g] || 2.0), 0) / grades.length 
      : 0;
    
    let avgGrade = 'C';
    for (const [grade, value] of Object.entries(gradeValues)) {
      if (avgGradeValue >= value - 0.15) {
        avgGrade = grade;
        break;
      }
    }
    
    return {
      totalRepDeficit,
      avgGrade,
      segmentCount: results.length
    };
  };

  // Get match percentage color class
  const getMatchClass = (percent) => {
    if (percent >= 85) return 'match-high';
    if (percent >= 65) return 'match-medium';
    return 'match-low';
  };

  // Get grade color class
  const getGradeClass = (grade) => {
    if (!grade) return 'grade-C';
    const letter = grade.charAt(0).toUpperCase();
    if (letter === 'A') return 'grade-A';
    if (letter === 'B') return 'grade-B';
    if (letter === 'C') return 'grade-C';
    return 'grade-D';
  };

  // Extract exercise name from observation
  const extractExerciseName = (observation) => {
    if (!observation) return 'Exercise';
    const colonIndex = observation.indexOf(':');
    if (colonIndex > 0 && colonIndex < 40) {
      return observation.substring(0, colonIndex).trim();
    }
    return observation.substring(0, 30) + (observation.length > 30 ? '...' : '');
  };
  
  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (progressPollRef.current) {
        clearInterval(progressPollRef.current);
      }
    };
  }, []);
  
  // Elapsed time state for display
  const [elapsedTime, setElapsedTime] = useState('0:00');
  
  // Update elapsed time every second during comparison
  useEffect(() => {
    let timer;
    if (isComparing && comparisonStartTime) {
      timer = setInterval(() => {
        const elapsed = Math.floor((Date.now() - comparisonStartTime) / 1000);
        const mins = Math.floor(elapsed / 60);
        const secs = elapsed % 60;
        setElapsedTime(`${mins}:${String(secs).padStart(2, '0')}`);
      }, 1000);
    }
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [isComparing, comparisonStartTime]);
  
  // Calculate elapsed time (kept for compatibility)
  const getElapsedTime = () => elapsedTime;

  // Auto-match segments when both are ready
  useEffect(() => {
    if (userSegments.length > 0 && instructorSegments.length > 0) {
      const pairs = [];
      const minCount = Math.min(userSegments.length, instructorSegments.length);
      
      for (let i = 0; i < minCount; i++) {
        pairs.push({
          userSegment: userSegments[i],
          instructorSegment: instructorSegments[i],
          status: 'pending'
        });
      }
      
      setMatchedPairs(pairs);
      validateSegments(userSegments, instructorSegments);
    } else {
      setMatchedPairs([]);
      setValidationErrors([]);
    }
  }, [userSegments, instructorSegments]);

  // Validate segments
  const validateSegments = (user, instructor) => {
    const errors = [];
    const MAX_DURATION = 1200; // 20 minutes

    user.forEach((seg, idx) => {
      if (seg.duration > MAX_DURATION) {
        errors.push(`Your Segment ${idx + 1}: ${(seg.duration / 60).toFixed(1)} min exceeds 20 min limit`);
      }
    });

    instructor.forEach((seg, idx) => {
      if (seg.duration > MAX_DURATION) {
        errors.push(`Instructor Segment ${idx + 1}: ${(seg.duration / 60).toFixed(1)} min exceeds 20 min limit`);
      }
    });

    if (user.length !== instructor.length) {
      errors.push(`Segment count mismatch: You have ${user.length}, instructor has ${instructor.length}`);
    }

    setValidationErrors(errors);
  };

  // Format time
  const formatTime = (seconds) => {
    if (!seconds) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Run comparison with progress tracking
  const handleCompare = async () => {
    if (validationErrors.length > 0) {
      alert('Please fix the validation errors before comparing');
      return;
    }

    if (matchedPairs.length === 0) {
      alert('No matched segments to compare');
      return;
    }

    setIsComparing(true);
    setComparisonProgress(0);
    setComparisonMessage('Starting AI analysis...');
    setCurrentSegment(0);
    setComparisonStartTime(Date.now());
    setResults([]);
    setOverallScore(null);

    // Set all pairs to comparing status
    setMatchedPairs(prev => prev.map(pair => ({
      ...pair,
      status: 'comparing'
    })));

    try {
      const comparisons = matchedPairs.map(pair => ({
        instructorVideo: pair.instructorSegment.filename,
        userVideo: pair.userSegment.filename
      }));

      console.log('Sending comparisons:', comparisons);

      // Start the comparison (this will return with jobId)
      const response = await axios.post('/api/compare/batch', { comparisons });
      const jobId = response.data.jobId;
      
      console.log('Comparison response:', response.data);

      // If we got a jobId, we could poll for progress (optional enhancement)
      // For now, we have the results directly since it's synchronous
      
      if (response.data.results && response.data.results.length > 0) {
        setResults(response.data.results);
        setOverallScore(response.data.overallMatchPercentage);
        setComparisonProgress(100);
        setComparisonMessage('Complete!');

        // Update pair statuses with results
        setMatchedPairs(prev => prev.map((pair, idx) => ({
          ...pair,
          status: response.data.results[idx] ? 'completed' : 'error',
          result: response.data.results[idx]
        })));
      } else {
        // No results - check for errors
        const errorMsg = response.data.errors?.map(e => e.error).join(', ') || 'No results returned';
        console.error('Comparison returned no results:', response.data);
        alert('Comparison issue: ' + errorMsg);
        
        // Reset to pending status
        setMatchedPairs(prev => prev.map(pair => ({
          ...pair,
          status: 'pending'
        })));
      }

    } catch (error) {
      console.error('Comparison error:', error);
      const errorDetail = error.response?.data?.error || 
                          error.response?.data?.details ||
                          error.message;
      alert('Comparison failed: ' + errorDetail);
      
      // Reset to pending status on error
      setMatchedPairs(prev => prev.map(pair => ({
        ...pair,
        status: 'pending'
      })));
    } finally {
      setIsComparing(false);
      setComparisonStartTime(null);
    }
  };

  // Check if ready for comparison
  const isReadyForComparison = 
    userSegments.length > 0 && 
    instructorSegments.length > 0 && 
    matchedPairs.length > 0 &&
    validationErrors.length === 0;

  // Calculate step status
  const stepStatus = {
    yourVideo: userSegments.length > 0,
    instructorVideo: instructorSegments.length > 0,
    matching: matchedPairs.length > 0 && validationErrors.length === 0,
    comparison: results.length > 0
  };

  return (
    <div className="comparison-page">
      {/* Header with progress */}
      <div className="page-header">
        <h1>🥊 Video Comparison Studio</h1>
        <p className="header-subtitle">Compare your workout form with instructor videos using AI analysis</p>
        
        <div className="progress-steps">
          <div className={`step ${stepStatus.yourVideo ? 'complete' : ''}`}>
            <span className="step-num">1</span>
            <span className="step-label">Your Video</span>
          </div>
          <div className="step-connector" />
          <div className={`step ${stepStatus.instructorVideo ? 'complete' : ''}`}>
            <span className="step-num">2</span>
            <span className="step-label">Instructor</span>
          </div>
          <div className="step-connector" />
          <div className={`step ${stepStatus.matching ? 'complete' : ''}`}>
            <span className="step-num">3</span>
            <span className="step-label">Match</span>
          </div>
          <div className="step-connector" />
          <div className={`step ${stepStatus.comparison ? 'complete' : ''}`}>
            <span className="step-num">4</span>
            <span className="step-label">Results</span>
          </div>
        </div>
      </div>

      {/* Side by side panels */}
      <div className="panels-container">
        <VideoPreparationPanel
          type="user"
          onSegmentsReady={setUserSegments}
          onProcessingChange={setUserProcessing}
        />
        <VideoPreparationPanel
          type="instructor"
          onSegmentsReady={setInstructorSegments}
          onProcessingChange={setInstructorProcessing}
        />
      </div>

      {/* Matching Section */}
      {(userSegments.length > 0 || instructorSegments.length > 0) && (
        <div className="matching-section">
          <h2>📋 Segment Matching</h2>
          
          {/* Validation Errors */}
          {validationErrors.length > 0 && (
            <div className="validation-errors">
              <h4>⚠️ Issues to Fix</h4>
              <ul>
                {validationErrors.map((error, idx) => (
                  <li key={idx}>{error}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Matched Pairs */}
          {matchedPairs.length > 0 ? (
            <div className="matched-pairs">
              <div className="pairs-header">
                <span>Your Video</span>
                <span></span>
                <span>Instructor Video</span>
                <span>Status</span>
              </div>
              {matchedPairs.map((pair, idx) => (
                <div key={idx} className={`pair-row ${pair.status}`}>
                  <div className="segment-info user">
                    <span className="seg-name">Segment {idx + 1}</span>
                    <span className="seg-duration">{formatTime(pair.userSegment.duration)}</span>
                  </div>
                  <div className="pair-arrow">↔️</div>
                  <div className="segment-info instructor">
                    <span className="seg-name">Segment {idx + 1}</span>
                    <span className="seg-duration">{formatTime(pair.instructorSegment.duration)}</span>
                  </div>
                  <div className="pair-status">
                    {pair.status === 'pending' && <span className="status-pending">Ready</span>}
                    {pair.status === 'comparing' && <span className="status-comparing">🔄</span>}
                    {pair.status === 'completed' && (
                      <span className="status-complete">
                        ✅ {pair.result?.matchPercentage || 0}%
                      </span>
                    )}
                    {pair.status === 'error' && <span className="status-error">❌</span>}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="matching-empty">
              <p>
                {userSegments.length === 0 && instructorSegments.length === 0 
                  ? 'Process both videos to see matched segments'
                  : userSegments.length === 0 
                    ? 'Process your video to continue'
                    : 'Process the instructor video to continue'}
              </p>
            </div>
          )}

          {/* Compare Button */}
          <div className="compare-action">
            <button
              className="compare-btn"
              onClick={handleCompare}
              disabled={!isReadyForComparison || isComparing}
            >
              {isComparing ? (
                <>
                  <span className="spinner">⏳</span>
                  Analyzing with AI...
                </>
              ) : !isReadyForComparison ? (
                'Complete Both Videos First'
              ) : (
                <>
                  🤖 Compare {matchedPairs.length} Segment{matchedPairs.length !== 1 ? 's' : ''}
                </>
              )}
            </button>
            
            {/* Progress indicator during comparison */}
            {isComparing && (
              <div className="comparison-progress-panel">
                <div className="progress-pulse"></div>
                <div className="progress-info">
                  <span className="progress-message">{comparisonMessage || 'Processing...'}</span>
                  <span className="progress-elapsed">⏱️ Elapsed: {getElapsedTime()}</span>
                </div>
                <p className="progress-reassurance">
                  🧠 Gemini 3 Pro is analyzing video content. This takes 30-90 seconds per segment.
                  <br />
                  <strong>The process is still running - please wait.</strong>
                </p>
              </div>
            )}
            
            {!isComparing && matchedPairs.length > 0 && validationErrors.length === 0 && (
              <p className="compare-tip">
                💡 AI analysis typically takes 30-90 seconds per segment
              </p>
            )}
          </div>
        </div>
      )}

      {/* Results Section */}
      {results.length > 0 && (
        <div className="results-section">
          <h2>🏆 Comparison Results</h2>
          
          {/* Overall Stats Bar */}
          {(() => {
            const stats = calculateOverallStats();
            return stats && (
              <div className="overall-stats-bar">
                <div className="stat-card">
                  <span className="stat-value">{overallScore}%</span>
                  <span className="stat-label">Average Match</span>
                </div>
                <div className="stat-card">
                  <span className={`stat-value grade-badge ${getGradeClass(stats.avgGrade)}`}>
                    {stats.avgGrade}
                  </span>
                  <span className="stat-label">Overall Grade</span>
                </div>
                <div className="stat-card">
                  <span className={`stat-value ${stats.totalRepDeficit < 0 ? 'deficit' : 'surplus'}`}>
                    {stats.totalRepDeficit > 0 ? '+' : ''}{stats.totalRepDeficit}
                  </span>
                  <span className="stat-label">Total Rep Difference</span>
                </div>
                <div className="stat-card">
                  <span className="stat-value">{stats.segmentCount}</span>
                  <span className="stat-label">Segments Analyzed</span>
                </div>
              </div>
            );
          })()}

          {/* Overall Score Circle */}
          {overallScore !== null && (
            <div className="overall-score">
              <div className="score-circle">
                <span className="score-value">{overallScore}</span>
                <span className="score-label">Overall Match</span>
              </div>
            </div>
          )}

          {/* Individual Results - Enhanced Cards */}
          <div className="individual-results enhanced">
            {results.map((result, idx) => (
              <div key={idx} className={`result-card enhanced ${expandedSegments[idx] ? 'expanded' : ''}`}>
                {/* Card Header */}
                <div className="result-header enhanced" onClick={() => toggleSegmentExpansion(idx)}>
                  <div className="header-left">
                    <h4>Segment {idx + 1}</h4>
                    {result.overallScore && (
                      <span className={`grade-badge ${getGradeClass(result.overallScore)}`}>
                        {result.overallScore}
                      </span>
                    )}
                  </div>
                  <div className="header-right">
                    <span className={`result-score ${getMatchClass(result.matchPercentage)}`}>
                      {result.matchPercentage}%
                    </span>
                    <span className="expand-icon">{expandedSegments[idx] ? '▼' : '▶'}</span>
                  </div>
                </div>

                {/* Strengths Section */}
                {result.strengths && result.strengths.length > 0 && (
                  <div className="result-section strengths">
                    <h5>✅ Strengths</h5>
                    <ul>
                      {result.strengths.map((strength, i) => (
                        <li key={i}>{strength}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Improvements Section */}
                {result.improvements && result.improvements.length > 0 && (
                  <div className="result-section improvements">
                    <h5>📈 Areas to Improve</h5>
                    <ul>
                      {result.improvements.map((improvement, i) => (
                        <li key={i}>{improvement}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Expandable Detailed Section */}
                {expandedSegments[idx] && (
                  <div className="result-details">
                    {/* Per-Minute Analysis Grid */}
                    {result.perMinuteAnalysis && result.perMinuteAnalysis.length > 0 && (
                      <div className="result-section minute-breakdown">
                        <h5>⏱️ Minute-by-Minute Breakdown</h5>
                        <div className="minute-grid">
                          {result.perMinuteAnalysis.map((minute, i) => (
                            <div key={i} className="minute-card">
                              <div className="minute-header">
                                <span className="minute-number">Minute {minute.minute}</span>
                                <span className={`minute-match ${getMatchClass(minute.matchPercentage)}`}>
                                  {minute.matchPercentage}%
                                </span>
                              </div>
                              <div className="minute-exercise">
                                {extractExerciseName(minute.observation)}
                              </div>
                              <p className="minute-observation">{minute.observation}</p>
                              {minute.repCount && (
                                <div className="minute-reps">
                                  <span className="rep-instructor">Instructor: {minute.repCount.instructor}</span>
                                  <span className="rep-divider">|</span>
                                  <span className="rep-user">You: {minute.repCount.user}</span>
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Rep Comparison Summary */}
                    {result.repComparison && (
                      <div className="result-section rep-summary">
                        <h5>🔢 Rep Summary</h5>
                        <div className="rep-summary-box">
                          <div className="rep-row">
                            <span>Instructor Total:</span>
                            <span className="rep-value">{result.repComparison.instructorTotal} reps</span>
                          </div>
                          <div className="rep-row">
                            <span>Your Total:</span>
                            <span className="rep-value">{result.repComparison.userTotal} reps</span>
                          </div>
                          <div className="rep-row total">
                            <span>Difference:</span>
                            <span className={`rep-value ${result.repComparison.difference < 0 ? 'deficit' : 'surplus'}`}>
                              {result.repComparison.difference > 0 ? '+' : ''}{result.repComparison.difference} reps
                            </span>
                          </div>
                          {result.repComparison.analysis && (
                            <p className="rep-analysis">{result.repComparison.analysis}</p>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Speed Analysis */}
                    {result.speedAnalysis && (
                      <div className="result-section speed-analysis">
                        <h5>🏃 Speed Analysis</h5>
                        <p className="analysis-text">{result.speedAnalysis}</p>
                      </div>
                    )}

                    {/* Form Issues */}
                    {result.formIssues && result.formIssues.length > 0 && (
                      <div className="result-section form-issues">
                        <h5>⚠️ Form Issues</h5>
                        <div className="issues-list">
                          {result.formIssues.map((issue, i) => (
                            <div key={i} className="issue-item">
                              <span className="issue-timestamp">{issue.timestamp}</span>
                              <span className="issue-text">{issue.issue}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Notable Timestamps */}
                    {result.timestamps && result.timestamps.length > 0 && (
                      <div className="result-section timestamps">
                        <h5>📍 Key Moments</h5>
                        <div className="timestamps-list">
                          {result.timestamps.map((ts, i) => (
                            <div key={i} className="timestamp-item">
                              <span className="timestamp-time">{ts.time}</span>
                              <span className="timestamp-observation">{ts.observation}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Detailed Analysis Paragraph */}
                    {result.analysis && (
                      <div className="result-section detailed-analysis">
                        <h5>📝 Detailed Analysis</h5>
                        <div className="analysis-box">
                          <p>{result.analysis}</p>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Click to expand hint */}
                {!expandedSegments[idx] && (result.perMinuteAnalysis || result.formIssues || result.analysis) && (
                  <div className="expand-hint" onClick={() => toggleSegmentExpansion(idx)}>
                    Click to see detailed breakdown, form issues, and analysis
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Help Section */}
      <div className="help-section">
        <h3>📚 How It Works</h3>
        <div className="help-grid">
          <div className="help-card">
            <span className="help-icon">📱</span>
            <h4>Upload Your Video</h4>
            <p>Record yourself doing the workout and upload the video</p>
          </div>
          <div className="help-card">
            <span className="help-icon">📺</span>
            <h4>Add Instructor</h4>
            <p>Paste a YouTube URL or upload the instructor's video</p>
          </div>
          <div className="help-card">
            <span className="help-icon">✂️</span>
            <h4>Trim & Split</h4>
            <p>Cut to matching sections and split into 2-5 min segments</p>
          </div>
          <div className="help-card">
            <span className="help-icon">🤖</span>
            <h4>Get AI Feedback</h4>
            <p>Our AI analyzes your form and provides personalized tips</p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default ComparisonPage;

