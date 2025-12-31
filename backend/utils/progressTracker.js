// In-memory progress tracker for video processing operations
// In production, consider using Redis for multi-server support

class ProgressTracker {
  constructor() {
    this.jobs = new Map();
  }

  createJob(jobId, totalSteps = 100) {
    this.jobs.set(jobId, {
      id: jobId,
      status: 'pending',
      progress: 0,
      totalSteps,
      currentStep: 0,
      message: 'Initializing...',
      startTime: Date.now(),
      estimatedTimeRemaining: null,
      segments: [],
      error: null
    });
    return jobId;
  }

  // Create a comparison job with segment tracking
  createComparisonJob(jobId, totalSegments, originalComparisons = null) {
    const segmentStatuses = new Array(totalSegments).fill('pending');
    const segmentResults = new Array(totalSegments).fill(null);
    const retryAttempts = new Array(totalSegments).fill(0);
    
    this.jobs.set(jobId, {
      id: jobId,
      status: 'pending',
      progress: 0,
      totalSegments,
      completedCount: 0,
      failedCount: 0,
      inProgressCount: 0,
      message: 'Initializing...',
      startTime: Date.now(),
      estimatedTimeRemaining: null,
      segmentStatuses,  // ['pending', 'processing', 'completed', 'error', 'retrying'] per segment
      segmentResults,   // Result objects for completed segments, null for others
      segmentErrors: new Array(totalSegments).fill(null), // Error messages per segment
      retryAttempts,    // Retry count per segment (0-based index)
      maxRetries: 1,    // Maximum automatic retries per segment
      originalComparisons, // Store original comparisons array for retry functionality
      error: null
    });
    return jobId;
  }

  // Update a specific segment's status
  updateSegmentStatus(jobId, segmentIndex, status, result = null, error = null) {
    const job = this.jobs.get(jobId);
    if (!job) return null;

    // segmentIndex is 1-based from the comparison, convert to 0-based for array
    const idx = segmentIndex - 1;
    
    if (idx >= 0 && idx < job.totalSegments) {
      const oldStatus = job.segmentStatuses[idx];
      job.segmentStatuses[idx] = status;
      
      // Update counts based on status change
      if (oldStatus === 'processing' || oldStatus === 'retrying') job.inProgressCount--;
      if ((oldStatus === 'pending' || oldStatus === 'error') && status === 'processing') job.inProgressCount++;
      if (status === 'retrying') job.inProgressCount++;
      
      if (status === 'completed') {
        job.completedCount++;
        job.segmentResults[idx] = result;
        // If this was a retry that succeeded, we need to adjust failed count
        if (oldStatus === 'error') {
          job.failedCount = Math.max(0, job.failedCount - 1);
        }
      } else if (status === 'error') {
        // Only increment failed count if it wasn't already failed
        if (oldStatus !== 'error') {
          job.failedCount++;
        }
        job.segmentErrors[idx] = error;
      }
      
      // Update overall progress
      job.progress = Math.round(((job.completedCount + job.failedCount) / job.totalSegments) * 100);
      
      // Calculate estimated time remaining
      const completedTotal = job.completedCount + job.failedCount;
      if (completedTotal > 0 && completedTotal < job.totalSegments) {
        const elapsed = Date.now() - job.startTime;
        const avgTimePerSegment = elapsed / completedTotal;
        const remainingSegments = job.totalSegments - completedTotal;
        job.estimatedTimeRemaining = Math.round(avgTimePerSegment * remainingSegments);
      }
      
      // Update message
      if (status === 'completed' && result) {
        job.message = `Segment ${segmentIndex} complete (${result.matchPercentage}%)`;
      } else if (status === 'error') {
        job.message = `Segment ${segmentIndex} failed`;
      } else if (status === 'processing') {
        job.message = `Analyzing segment ${segmentIndex}...`;
      } else if (status === 'retrying') {
        job.message = `Retrying segment ${segmentIndex}...`;
      }
    }
    
    return job;
  }

  // Mark segment as processing
  markSegmentProcessing(jobId, segmentIndex) {
    return this.updateSegmentStatus(jobId, segmentIndex, 'processing');
  }

  // Mark segment as completed with result
  markSegmentCompleted(jobId, segmentIndex, result) {
    return this.updateSegmentStatus(jobId, segmentIndex, 'completed', result);
  }

  // Mark segment as failed with error
  markSegmentFailed(jobId, segmentIndex, error) {
    const job = this.jobs.get(jobId);
    if (!job) return null;
    
    const idx = segmentIndex - 1;
    if (idx >= 0 && idx < job.totalSegments) {
      // Increment retry attempt count
      job.retryAttempts[idx] = (job.retryAttempts[idx] || 0) + 1;
    }
    
    return this.updateSegmentStatus(jobId, segmentIndex, 'error', null, error);
  }

  // Check if a segment can be retried
  canRetrySegment(jobId, segmentIndex) {
    const job = this.jobs.get(jobId);
    if (!job) return false;
    
    const idx = segmentIndex - 1;
    if (idx < 0 || idx >= job.totalSegments) return false;
    
    const retryCount = job.retryAttempts[idx] || 0;
    return retryCount < job.maxRetries;
  }

  // Reset segment for retry (for manual retries)
  resetSegmentForRetry(jobId, segmentIndex) {
    const job = this.jobs.get(jobId);
    if (!job) return null;
    
    const idx = segmentIndex - 1;
    if (idx < 0 || idx >= job.totalSegments) return null;
    
    // Reset status to pending, clear error, keep retry count
    job.segmentStatuses[idx] = 'pending';
    job.segmentErrors[idx] = null;
    job.segmentResults[idx] = null;
    
    // Adjust counts
    if (job.failedCount > 0) {
      job.failedCount--;
    }
    
    return job;
  }

  // Mark segment as retrying
  markSegmentRetrying(jobId, segmentIndex) {
    return this.updateSegmentStatus(jobId, segmentIndex, 'retrying');
  }

  updateProgress(jobId, updates) {
    const job = this.jobs.get(jobId);
    if (!job) return null;

    Object.assign(job, updates);

    // Calculate estimated time remaining
    if (job.progress > 0 && job.progress < 100) {
      const elapsed = Date.now() - job.startTime;
      const estimatedTotal = (elapsed / job.progress) * 100;
      job.estimatedTimeRemaining = Math.max(0, estimatedTotal - elapsed);
    }

    return job;
  }

  getJob(jobId) {
    return this.jobs.get(jobId);
  }

  // Get job with computed summary
  getJobWithSummary(jobId) {
    const job = this.jobs.get(jobId);
    if (!job) return null;
    
    // Calculate overall match percentage from completed segments
    const completedResults = job.segmentResults?.filter(r => r !== null) || [];
    const overallMatchPercentage = completedResults.length > 0
      ? Math.round(completedResults.reduce((sum, r) => sum + (r.matchPercentage || 0), 0) / completedResults.length)
      : null;
    
    return {
      ...job,
      overallMatchPercentage,
      results: completedResults
    };
  }

  completeJob(jobId, result = null) {
    const job = this.jobs.get(jobId);
    if (!job) return null;

    job.status = 'completed';
    job.progress = 100;
    job.message = 'Completed';
    job.estimatedTimeRemaining = 0;
    if (result) job.result = result;

    return job;
  }

  failJob(jobId, error) {
    const job = this.jobs.get(jobId);
    if (!job) return null;

    job.status = 'failed';
    job.message = 'Failed';
    job.error = error;
    job.estimatedTimeRemaining = 0;

    return job;
  }

  deleteJob(jobId) {
    this.jobs.delete(jobId);
  }

  // Clean up old jobs (older than 1 hour)
  cleanup() {
    const oneHourAgo = Date.now() - 60 * 60 * 1000;
    for (const [jobId, job] of this.jobs.entries()) {
      if (job.startTime < oneHourAgo) {
        this.jobs.delete(jobId);
      }
    }
  }
}

export default new ProgressTracker();
