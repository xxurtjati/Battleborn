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
