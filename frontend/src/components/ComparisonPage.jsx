import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
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
  
  // Report ref for PDF download
  const reportRef = useRef(null);
  
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

  // Format time in seconds to MM:SS
  const formatTime = (seconds) => {
    if (!seconds && seconds !== 0) return '-';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Download report as PDF
  const downloadReportPDF = async () => {
    if (!reportRef.current || results.length === 0) return;
    
    try {
      // Create a temporary container for the print-optimized content
      const printContainer = document.createElement('div');
      printContainer.style.cssText = `
        position: fixed;
        left: -9999px;
        top: 0;
        width: 800px;
        background: #1a1a2e;
        padding: 40px;
        color: white;
        font-family: 'Space Grotesk', system-ui, sans-serif;
      `;
      
      const sortedResults = [...results].sort((a, b) => (a.segmentIndex || 0) - (b.segmentIndex || 0));
      const stats = calculateOverallStats();
      const date = new Date().toLocaleDateString('en-US', { 
        year: 'numeric', month: 'long', day: 'numeric' 
      });
      
      // Build PDF content as HTML
      printContainer.innerHTML = `
        <div style="text-align: center; margin-bottom: 30px;">
          <h1 style="margin: 0; font-size: 28px; color: #667eea;">🏆 Workout Comparison Report</h1>
          <p style="margin: 10px 0 0 0; color: rgba(255,255,255,0.6); font-size: 14px;">${date}</p>
        </div>
        
        <div style="display: flex; justify-content: space-around; margin-bottom: 30px; padding: 20px; background: rgba(0,0,0,0.3); border-radius: 12px;">
          <div style="text-align: center;">
            <div style="font-size: 36px; font-weight: bold; color: #4caf50;">${overallScore}%</div>
            <div style="font-size: 12px; color: rgba(255,255,255,0.5);">OVERALL MATCH</div>
          </div>
          <div style="text-align: center;">
            <div style="font-size: 36px; font-weight: bold; color: #667eea;">${stats?.avgGrade || 'N/A'}</div>
            <div style="font-size: 12px; color: rgba(255,255,255,0.5);">GRADE</div>
          </div>
          <div style="text-align: center;">
            <div style="font-size: 36px; font-weight: bold; color: ${stats?.totalRepDeficit < 0 ? '#ef5350' : '#4caf50'};">
              ${stats?.totalRepDeficit > 0 ? '+' : ''}${stats?.totalRepDeficit || 0}
            </div>
            <div style="font-size: 12px; color: rgba(255,255,255,0.5);">REP DIFFERENCE</div>
          </div>
          <div style="text-align: center;">
            <div style="font-size: 36px; font-weight: bold; color: white;">${results.length}</div>
            <div style="font-size: 12px; color: rgba(255,255,255,0.5);">SEGMENTS</div>
          </div>
        </div>
        
        ${sortedResults.map(result => {
          const colorMap = { green: '#4caf50', yellow: '#ffc107', orange: '#ff9800', red: '#f44336' };
          const borderColor = colorMap[result.colorCode] || 
            (result.matchPercentage >= 85 ? colorMap.green : 
             result.matchPercentage >= 70 ? colorMap.yellow : 
             result.matchPercentage >= 50 ? colorMap.orange : colorMap.red);
          
          return `
            <div style="margin-bottom: 20px; padding: 20px; background: rgba(0,0,0,0.25); border-radius: 12px; border-left: 5px solid ${borderColor};">
              <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px;">
                <div>
                  <span style="font-size: 18px; font-weight: bold;">Segment ${result.segmentIndex}: ${result.exerciseName || 'Exercise'}</span>
                  ${result.exerciseNameConfidence === 'guessed' ? '<span style="color: #ffc107; font-size: 12px;"> (?)</span>' : ''}
                </div>
                <div style="background: ${borderColor}; color: #1a1a2e; padding: 8px 16px; border-radius: 8px; font-weight: bold; font-size: 18px;">
                  ${result.overallScore || 'N/A'}
                </div>
              </div>
              
              <div style="margin-bottom: 12px;">
                <div style="display: flex; justify-content: space-between; margin-bottom: 5px;">
                  <span style="color: rgba(255,255,255,0.7);">Match:</span>
                  <span style="font-weight: bold;">${result.matchPercentage}%</span>
                </div>
                <div style="height: 8px; background: rgba(255,255,255,0.1); border-radius: 4px; overflow: hidden;">
                  <div style="height: 100%; width: ${result.matchPercentage}%; background: ${borderColor}; border-radius: 4px;"></div>
                </div>
              </div>
              
              ${result.quickSummary ? `<p style="margin: 0 0 12px 0; color: rgba(255,255,255,0.8); font-style: italic; padding-left: 10px; border-left: 3px solid rgba(102,126,234,0.5);">${result.quickSummary}</p>` : ''}
              
              ${result.repComparison ? `
                <div style="display: flex; gap: 20px; margin-bottom: 12px; font-size: 14px;">
                  <span>Reps: <strong>${result.repComparison.userTotal}/${result.repComparison.instructorTotal}</strong></span>
                  <span style="color: ${result.repComparison.difference < 0 ? '#ef5350' : '#4caf50'};">
                    (${result.repComparison.difference > 0 ? '+' : ''}${result.repComparison.difference})
                  </span>
                </div>
              ` : ''}
              
              ${result.topStrength || (result.strengths && result.strengths[0]) ? `
                <div style="margin-bottom: 8px; display: flex; gap: 8px;">
                  <span style="color: #4caf50;">✅</span>
                  <span style="color: rgba(255,255,255,0.8);">${result.topStrength || result.strengths[0]}</span>
                </div>
              ` : ''}
              
              ${result.topIssue || (result.improvements && result.improvements[0]) ? `
                <div style="display: flex; gap: 8px;">
                  <span style="color: #ff9800;">⚠️</span>
                  <span style="color: rgba(255,255,255,0.8);">${result.topIssue || result.improvements[0]}</span>
                </div>
              ` : ''}
            </div>
          `;
        }).join('')}
        
        <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid rgba(255,255,255,0.1); text-align: center; color: rgba(255,255,255,0.4); font-size: 12px;">
          Generated by Battleborn Workout Analyzer
        </div>
      `;
      
      document.body.appendChild(printContainer);
      
      // Use html2canvas to capture it
      const canvas = await html2canvas(printContainer, {
        backgroundColor: '#1a1a2e',
        scale: 2,
        logging: false,
        useCORS: true
      });
      
      document.body.removeChild(printContainer);
      
      // Create PDF
      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4'
      });
      
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = pdf.internal.pageSize.getHeight();
      const imgWidth = canvas.width;
      const imgHeight = canvas.height;
      const ratio = Math.min(pdfWidth / imgWidth, pdfHeight / imgHeight);
      const imgX = (pdfWidth - imgWidth * ratio) / 2;
      
      // Handle multi-page if needed
      const pageHeight = pdfHeight;
      const scaledImgHeight = imgHeight * ratio * 2; // scale factor from html2canvas
      let heightLeft = scaledImgHeight;
      let position = 0;
      
      // For now, just add the image (it may span multiple pages)
      const totalPages = Math.ceil(canvas.height / (canvas.width * pdfHeight / pdfWidth));
      
      if (totalPages <= 1) {
        pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, imgHeight * pdfWidth / imgWidth);
      } else {
        // Split into pages
        const pageCanvas = document.createElement('canvas');
        const pageCtx = pageCanvas.getContext('2d');
        const pageImgHeight = canvas.width * pdfHeight / pdfWidth;
        
        for (let page = 0; page < totalPages; page++) {
          pageCanvas.width = canvas.width;
          pageCanvas.height = pageImgHeight;
          
          pageCtx.fillStyle = '#1a1a2e';
          pageCtx.fillRect(0, 0, pageCanvas.width, pageCanvas.height);
          pageCtx.drawImage(
            canvas, 
            0, page * pageImgHeight, 
            canvas.width, Math.min(pageImgHeight, canvas.height - page * pageImgHeight),
            0, 0,
            canvas.width, Math.min(pageImgHeight, canvas.height - page * pageImgHeight)
          );
          
          const pageData = pageCanvas.toDataURL('image/png');
          
          if (page > 0) pdf.addPage();
          pdf.addImage(pageData, 'PNG', 0, 0, pdfWidth, pdfHeight);
        }
      }
      
      // Download
      const filename = `workout_report_${new Date().toISOString().split('T')[0]}.pdf`;
      pdf.save(filename);
      
    } catch (error) {
      console.error('Error generating PDF:', error);
      alert('Error generating PDF. Please try again.');
    }
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

  // Segment statuses from backend
  const [segmentStatuses, setSegmentStatuses] = useState([]);
  const [segmentRetryAttempts, setSegmentRetryAttempts] = useState([]);
  const [inProgressCount, setInProgressCount] = useState(0);
  const [completedCount, setCompletedCount] = useState(0);
  const [failedCount, setFailedCount] = useState(0);
  const [estimatedTimeRemaining, setEstimatedTimeRemaining] = useState(null);
  const [currentJobId, setCurrentJobId] = useState(null);
  const [failedSegments, setFailedSegments] = useState([]);

  // Poll for comparison progress
  const pollComparisonProgress = async (jobId) => {
    try {
      const response = await axios.get(`/api/compare/progress/${jobId}`);
      const job = response.data;
      
      console.log('Progress poll:', job);
      
      // Update progress state
      setComparisonProgress(job.progress || 0);
      setComparisonMessage(job.message || 'Processing...');
      setSegmentStatuses(job.segmentStatuses || []);
      setSegmentRetryAttempts(job.retryAttempts || []);
      setInProgressCount(job.inProgressCount || 0);
      setCompletedCount(job.completedCount || 0);
      setFailedCount(job.failedCount || 0);
      setEstimatedTimeRemaining(job.estimatedTimeRemaining);
      
      // Update results incrementally as they come in
      if (job.results && job.results.length > 0) {
        setResults(job.results);
        if (job.overallMatchPercentage !== null) {
          setOverallScore(job.overallMatchPercentage);
        }
      }
      
      // Update matched pairs with segment statuses
      if (job.segmentStatuses) {
        setMatchedPairs(prev => prev.map((pair, idx) => {
          const status = job.segmentStatuses[idx];
          const result = job.segmentResults?.[idx] || null;
          const retryCount = job.retryAttempts?.[idx] || 0;
          return {
            ...pair,
            status: status === 'completed' ? 'completed' : 
                    status === 'error' ? 'error' : 
                    status === 'retrying' ? 'retrying' :
                    status === 'processing' ? 'comparing' : 'pending',
            result: result,
            retryCount: retryCount
          };
        }));
      }
      
      // Check if job is complete
      if (job.status === 'completed') {
        clearInterval(progressPollRef.current);
        progressPollRef.current = null;
        setIsComparing(false);
        setComparisonStartTime(null);
        setComparisonMessage('Complete!');
        
        // Get final results
        if (job.result?.results) {
          setResults(job.result.results);
          setOverallScore(job.result.overallMatchPercentage);
        }
        
        // Collect failed segments for retry UI
        const failed = [];
        if (job.segmentStatuses) {
          job.segmentStatuses.forEach((status, idx) => {
            if (status === 'error') {
              failed.push({
                segmentIndex: idx + 1,
                error: job.segmentErrors?.[idx] || 'Unknown error',
                retryAttempts: job.retryAttempts?.[idx] || 0
              });
            }
          });
        }
        setFailedSegments(failed);
        
        console.log('Comparison complete!', job.result);
      } else if (job.status === 'failed') {
        clearInterval(progressPollRef.current);
        progressPollRef.current = null;
        setIsComparing(false);
        setComparisonStartTime(null);
        alert('Comparison failed: ' + (job.error || 'Unknown error'));
      }
      
    } catch (error) {
      console.error('Progress poll error:', error);
      // Don't stop polling on transient errors
    }
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
        setSegmentStatuses([]);
        setSegmentRetryAttempts([]);
        setInProgressCount(0);
        setCompletedCount(0);
        setFailedCount(0);
        setEstimatedTimeRemaining(null);

    // Set all pairs to pending status initially
    setMatchedPairs(prev => prev.map(pair => ({
      ...pair,
      status: 'pending'
    })));

    try {
      const comparisons = matchedPairs.map(pair => ({
        instructorVideo: pair.instructorSegment.filename,
        userVideo: pair.userSegment.filename
      }));

      console.log('Sending comparisons:', comparisons);

      // Start the comparison - returns immediately with jobId
      const response = await axios.post('/api/compare/batch', { comparisons });
      const jobId = response.data.jobId;
      
      console.log('Comparison started, jobId:', jobId);

      if (!jobId) {
        throw new Error('No job ID returned from server');
      }

      setCurrentJobId(jobId);
      setFailedSegments([]);

      // Start polling for progress
      setComparisonMessage(`Processing ${comparisons.length} segments...`);
      
      // Poll every 1.5 seconds
      progressPollRef.current = setInterval(() => {
        pollComparisonProgress(jobId);
      }, 1500);

      // Also poll immediately
      pollComparisonProgress(jobId);

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
      setIsComparing(false);
      setComparisonStartTime(null);
    }
  };

  // Handle retry of failed segments
  const handleRetryFailedSegments = async (jobId, segmentIndices) => {
    try {
      setIsComparing(true);
      setComparisonProgress(0);
      setComparisonMessage('Retrying failed segments...');
      setComparisonStartTime(Date.now());
      setFailedSegments([]);

      const response = await axios.post(`/api/compare/retry/${jobId}`, {
        segmentIndices: segmentIndices || undefined // null means retry all
      });

      const retryJobId = response.data.jobId;
      setCurrentJobId(retryJobId);

      console.log('Retry started, jobId:', retryJobId);

      // Start polling for retry progress
      setComparisonMessage(`Retrying ${response.data.totalSegments} segment(s)...`);
      
      // Poll every 1.5 seconds
      progressPollRef.current = setInterval(() => {
        pollComparisonProgress(retryJobId);
      }, 1500);

      // Also poll immediately
      pollComparisonProgress(retryJobId);

    } catch (error) {
      console.error('Retry error:', error);
      const errorDetail = error.response?.data?.error || 
                          error.response?.data?.details ||
                          error.message;
      alert('Retry failed: ' + errorDetail);
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
                    {pair.status === 'retrying' && (
                      <span className="status-retrying">
                        🔄 Retrying {pair.retryCount > 0 && `(${pair.retryCount})`}
                      </span>
                    )}
                    {pair.status === 'completed' && (
                      <span className="status-complete">
                        ✅ {pair.result?.matchPercentage || 0}%
                        {pair.retryCount > 0 && <span className="retry-badge"> (retried)</span>}
                      </span>
                    )}
                    {pair.status === 'error' && (
                      <span className="status-error">
                        ❌ {pair.retryCount > 0 && `(${pair.retryCount} attempts)`}
                      </span>
                    )}
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
            
            {/* Enhanced Progress indicator during comparison */}
            {isComparing && (
              <div className="comparison-progress-panel enhanced">
                <div className="progress-header">
                  <div className="progress-pulse"></div>
                  <span className="progress-message">{comparisonMessage || 'Processing...'}</span>
                </div>
                
                {/* Progress bar */}
                <div className="progress-bar-container">
                  <div 
                    className="progress-bar-fill" 
                    style={{ width: `${comparisonProgress}%` }}
                  ></div>
                  <span className="progress-percent">{comparisonProgress}%</span>
                </div>
                
                {/* Segment counters */}
                <div className="progress-counters">
                  <div className="counter completed">
                    <span className="counter-value">{completedCount}</span>
                    <span className="counter-label">Completed</span>
                  </div>
                  <div className="counter in-progress">
                    <span className="counter-value">{inProgressCount}</span>
                    <span className="counter-label">Processing</span>
                  </div>
                  <div className="counter pending">
                    <span className="counter-value">{matchedPairs.length - completedCount - failedCount - inProgressCount}</span>
                    <span className="counter-label">Pending</span>
                  </div>
                  {failedCount > 0 && (
                    <div className="counter failed">
                      <span className="counter-value">{failedCount}</span>
                      <span className="counter-label">Failed</span>
                    </div>
                  )}
                </div>
                
                {/* Time info */}
                <div className="progress-time-info">
                  <span className="progress-elapsed">⏱️ Elapsed: {getElapsedTime()}</span>
                  {estimatedTimeRemaining !== null && estimatedTimeRemaining > 0 && (
                    <span className="progress-remaining">
                      ⏳ Est. remaining: {formatTime(Math.ceil(estimatedTimeRemaining / 1000))}
                    </span>
                  )}
                </div>
                
                {/* Per-segment status grid */}
                {segmentStatuses.length > 0 && (
                  <div className="segment-status-grid">
                    {segmentStatuses.map((status, idx) => {
                      const retryCount = segmentRetryAttempts[idx] || 0;
                      return (
                        <div 
                          key={idx} 
                          className={`segment-status-dot ${status}`}
                          title={`Segment ${idx + 1}: ${status}${retryCount > 0 ? ` (${retryCount} retry attempt${retryCount !== 1 ? 's' : ''})` : ''}`}
                        >
                          {status === 'completed' ? '✓' : 
                           status === 'retrying' ? '🔄' :
                           status === 'processing' ? '⏳' : 
                           status === 'error' ? '✗' : 
                           '○'}
                        </div>
                      );
                    })}
                  </div>
                )}
                
                <p className="progress-reassurance">
                  🧠 Processing {inProgressCount} segment{inProgressCount !== 1 ? 's' : ''} in parallel. 
                  Results appear as they complete.
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
        <div className="results-section" ref={reportRef}>
          <div className="results-header">
            <h2>🏆 Comparison Results</h2>
            <button className="download-report-btn" onClick={downloadReportPDF}>
              📥 Download PDF Report
            </button>
          </div>
          
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

          {/* Individual Results - New Card-Based Layout */}
          <div className="segment-cards-container">
            {/* Sort results by segmentIndex to maintain original order */}
            {[...results]
              .sort((a, b) => (a.segmentIndex || 0) - (b.segmentIndex || 0))
              .map((result) => {
              // Use segmentIndex from backend (1-based), not idx or AI's segmentNumber
              const segmentNum = result.segmentIndex || 1;
              const expandKey = segmentNum; // Use segment number as key for expansion state
              
              // Helper functions for this result
              const getColorBorderClass = () => {
                const color = result.colorCode || 
                  (result.matchPercentage >= 85 ? 'green' : 
                   result.matchPercentage >= 70 ? 'yellow' : 
                   result.matchPercentage >= 50 ? 'orange' : 'red');
                return `border-${color}`;
              };
              
              const getStatusBadge = () => {
                const badge = result.statusBadge || 
                  (result.matchPercentage >= 90 ? 'excellent' : 
                   result.completionPercentage >= 90 ? 'completed' : 'incomplete');
                const badges = {
                  'excellent': { icon: '🔥', text: 'Excellent' },
                  'completed': { icon: '✅', text: 'Completed' },
                  'incomplete': { icon: '⚠️', text: 'Incomplete' },
                  'improving': { icon: '📈', text: 'Improving' },
                  'on_pace': { icon: '🎯', text: 'On Pace' }
                };
                return badges[badge] || badges['completed'];
              };

              const statusBadge = getStatusBadge();

              return (
                <div 
                  key={`segment-${segmentNum}`} 
                  className={`segment-card ${getColorBorderClass()} ${expandedSegments[expandKey] ? 'expanded' : ''}`}
                >
                  {/* Card Header with Exercise Name */}
                  <div className="segment-card-header" onClick={() => toggleSegmentExpansion(expandKey)}>
                    <div className="segment-title-row">
                      <div className="segment-title">
                        <span className="segment-emoji">🏋️</span>
                        <span className="segment-name">
                          Segment {segmentNum}: {result.exerciseName || 'Exercise'}
                        </span>
                        {result.exerciseNameConfidence === 'guessed' && (
                          <span className="confidence-indicator" title="AI identified this exercise">(?)</span>
                        )}
                      </div>
                      <div className={`grade-badge-large ${getGradeClass(result.overallScore)}`}>
                        {result.overallScore || 'N/A'}
                      </div>
                    </div>
                    
                    {/* Match Percentage Bar */}
                    <div className="match-bar-container">
                      <div className="match-bar-label">
                        <span>Match:</span>
                        <span className="match-value">{result.matchPercentage}%</span>
                      </div>
                      <div className="match-bar-track">
                        <div 
                          className={`match-bar-fill ${getMatchClass(result.matchPercentage)}`}
                          style={{ width: `${result.matchPercentage}%` }}
                        ></div>
                      </div>
                    </div>

                    {/* Quick Stats Row */}
                    <div className="quick-stats-row">
                      <div className="quick-stat">
                        <span className="stat-icon">{statusBadge.icon}</span>
                        <span className="stat-text">{statusBadge.text}</span>
                      </div>
                      {result.repComparison && (
                        <div className="quick-stat">
                          <span className="stat-label">Reps:</span>
                          <span className={`stat-value ${result.repComparison.difference < 0 ? 'deficit' : ''}`}>
                            {result.repComparison.userTotal}/{result.repComparison.instructorTotal}
                          </span>
                        </div>
                      )}
                      {result.completionPercentage !== undefined && (
                        <div className="quick-stat">
                          <span className="stat-label">Completion:</span>
                          <span className="stat-value">{result.completionPercentage}%</span>
                        </div>
                      )}
                      <span className="expand-toggle">{expandedSegments[expandKey] ? '▼' : '▶'}</span>
                    </div>
                  </div>

                  {/* Collapsed View - Quick Summary */}
                  {!expandedSegments[expandKey] && (
                    <div className="segment-collapsed-content" onClick={() => toggleSegmentExpansion(expandKey)}>
                      {/* Quick Summary */}
                      {result.quickSummary && (
                        <p className="quick-summary">{result.quickSummary}</p>
                      )}
                      
                      {/* Top Strength & Issue */}
                      <div className="quick-insights">
                        {(result.topStrength || (result.strengths && result.strengths[0])) && (
                          <div className="quick-insight strength">
                            <span className="insight-icon">✅</span>
                            <span className="insight-text">{result.topStrength || result.strengths[0]}</span>
                          </div>
                        )}
                        {(result.topIssue || (result.improvements && result.improvements[0])) && (
                          <div className="quick-insight issue">
                            <span className="insight-icon">⚠️</span>
                            <span className="insight-text">{result.topIssue || result.improvements[0]}</span>
                          </div>
                        )}
                      </div>
                      
                      <div className="expand-hint-text">👆 Click anywhere to expand for full details</div>
                    </div>
                  )}

                  {/* Expanded View - Full Details */}
                  {expandedSegments[expandKey] && (
                    <div className="segment-expanded-content">
                      {/* Timeline Visualization */}
                      {result.timelineSections && result.timelineSections.length > 0 && (
                        <div className="timeline-section">
                          <h5>📊 Timeline</h5>
                          <div className="timeline-track">
                            {result.timelineSections.map((section, i) => (
                              <div 
                                key={i}
                                className={`timeline-segment status-${section.status}`}
                                style={{
                                  flexGrow: section.end - section.start,
                                }}
                                title={section.label}
                              >
                                <span className="timeline-label">{section.label}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Comparison Stats Table */}
                      {result.repComparison && (
                        <div className="comparison-stats-section">
                          <h5>📈 Comparison Stats</h5>
                          <div className="stats-table">
                            <div className="stats-row header">
                              <span>Metric</span>
                              <span>Instructor</span>
                              <span>You</span>
                              <span>Diff</span>
                            </div>
                            <div className="stats-row">
                              <span>Reps</span>
                              <span>{result.repComparison.instructorTotal}</span>
                              <span>{result.repComparison.userTotal}</span>
                              <span className={result.repComparison.difference < 0 ? 'deficit' : 'surplus'}>
                                {result.repComparison.difference > 0 ? '+' : ''}{result.repComparison.difference}
                              </span>
                            </div>
                            {result.comparisonStats && (
                              <>
                                <div className="stats-row">
                                  <span>Duration</span>
                                  <span>{formatTime(result.comparisonStats.instructorDuration)}</span>
                                  <span>{formatTime(result.comparisonStats.userDuration)}</span>
                                  <span className={result.comparisonStats.durationDifference < 0 ? 'deficit' : ''}>
                                    {result.comparisonStats.durationDifference > 0 ? '+' : ''}{formatTime(Math.abs(result.comparisonStats.durationDifference))}
                                  </span>
                                </div>
                                <div className="stats-row">
                                  <span>Pace</span>
                                  <span>{result.comparisonStats.instructorPace}</span>
                                  <span>{result.comparisonStats.userPace}</span>
                                  <span>-</span>
                                </div>
                              </>
                            )}
                          </div>
                          {result.repComparison.timingOffset && (
                            <p className="timing-offset-note">⏱️ {result.repComparison.timingOffset}</p>
                          )}
                        </div>
                      )}

                      {/* Strengths */}
                      {result.strengths && result.strengths.length > 0 && (
                        <div className="detail-section strengths">
                          <h5>✅ Strengths</h5>
                          <ul>
                            {result.strengths.map((s, i) => <li key={i}>{s}</li>)}
                          </ul>
                        </div>
                      )}

                      {/* Areas to Improve */}
                      {result.improvements && result.improvements.length > 0 && (
                        <div className="detail-section improvements">
                          <h5>📈 Areas to Improve</h5>
                          <ul>
                            {result.improvements.map((imp, i) => <li key={i}>{imp}</li>)}
                          </ul>
                        </div>
                      )}

                      {/* Form Issues with Severity */}
                      {result.formIssues && result.formIssues.length > 0 && (
                        <div className="detail-section form-issues">
                          <h5>⚠️ Form Issues</h5>
                          <div className="form-issues-list">
                            {result.formIssues.map((issue, i) => (
                              <div key={i} className={`form-issue-item severity-${issue.severity || 'medium'}`}>
                                <span className="issue-timestamp">{issue.timestamp}</span>
                                <span className={`severity-badge ${issue.severity || 'medium'}`}>
                                  {issue.severity?.toUpperCase() || 'MEDIUM'}
                                </span>
                                <span className="issue-text">{issue.issue}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Per-Minute Breakdown */}
                      {result.perMinuteAnalysis && result.perMinuteAnalysis.length > 0 && (
                        <div className="detail-section minute-breakdown">
                          <h5>⏱️ Minute-by-Minute</h5>
                          <div className="minute-cards">
                            {result.perMinuteAnalysis.map((minute, i) => (
                              <div key={i} className="minute-breakdown-card">
                                <div className="minute-header-row">
                                  <span className="minute-num">Min {minute.minute}</span>
                                  <span className={`minute-match-badge ${getMatchClass(minute.matchPercentage)}`}>
                                    {minute.matchPercentage}%
                                  </span>
                                </div>
                                <p className="minute-obs">{minute.observation}</p>
                                {minute.repCount && (
                                  <div className="minute-rep-count">
                                    Reps: {minute.repCount.user}/{minute.repCount.instructor}
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Speed Analysis */}
                      {result.speedAnalysis && (
                        <div className="detail-section">
                          <h5>🏃 Speed Analysis</h5>
                          <p className="speed-text">{result.speedAnalysis}</p>
                        </div>
                      )}

                      {/* Key Moments */}
                      {result.timestamps && result.timestamps.length > 0 && (
                        <div className="detail-section">
                          <h5>📍 Key Moments</h5>
                          <div className="key-moments-list">
                            {result.timestamps.map((ts, i) => (
                              <div key={i} className="key-moment-item">
                                <span className="moment-time">{ts.time}</span>
                                <span className="moment-obs">{ts.observation}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Action Items */}
                      {result.actionItems && result.actionItems.length > 0 && (
                        <div className="detail-section action-items">
                          <h5>💡 Action Items for Next Workout</h5>
                          <ul className="action-list">
                            {result.actionItems.map((action, i) => (
                              <li key={i}>{action}</li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {/* Detailed Analysis */}
                      {result.analysis && (
                        <div className="detail-section full-analysis">
                          <h5>📝 Full Analysis</h5>
                          <div className="analysis-text-box">
                            <p>{result.analysis}</p>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Retry Failed Segments Section */}
      {!isComparing && failedSegments.length > 0 && currentJobId && (
        <div className="retry-section">
          <h2>🔄 Retry Failed Segments</h2>
          <div className="retry-panel">
            <p className="retry-intro">
              {failedSegments.length} segment{failedSegments.length !== 1 ? 's' : ''} failed during processing.
              You can retry them individually or all at once.
            </p>
            
            <div className="failed-segments-list">
              {failedSegments.map((failed, idx) => (
                <div key={idx} className="failed-segment-item">
                  <div className="failed-segment-info">
                    <span className="failed-segment-number">Segment {failed.segmentIndex}</span>
                    <span className="failed-segment-error">{failed.error}</span>
                    {failed.retryAttempts > 0 && (
                      <span className="failed-segment-retries">
                        ({failed.retryAttempts} auto-retry attempt{failed.retryAttempts !== 1 ? 's' : ''})
                      </span>
                    )}
                  </div>
                  <button
                    className="retry-segment-btn"
                    onClick={() => handleRetryFailedSegments(currentJobId, [failed.segmentIndex])}
                    disabled={isComparing}
                  >
                    Retry This Segment
                  </button>
                </div>
              ))}
            </div>
            
            <div className="retry-actions">
              <button
                className="retry-all-btn"
                onClick={() => handleRetryFailedSegments(currentJobId, null)}
                disabled={isComparing}
              >
                🔄 Retry All Failed Segments
              </button>
            </div>
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

