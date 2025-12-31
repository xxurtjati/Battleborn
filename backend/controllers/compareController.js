import { GoogleGenerativeAI } from '@google/generative-ai';
import fs from 'fs/promises';
import fsSync from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import ffmpeg from 'fluent-ffmpeg';
import progressTracker from '../utils/progressTracker.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const outputsDir = path.join(__dirname, '..', '..', 'outputs');
const logsDir = path.join(__dirname, '..', '..', 'logs');

// Ensure logs directory exists
try {
  fsSync.mkdirSync(logsDir, { recursive: true });
} catch (err) {
  // Directory already exists
}

// Store comparison results (in production, use a database)
const comparisonResults = new Map();

// Log comparison results to file
async function logComparison(segmentIndex, instructorVideo, userVideo, prompt, response, duration) {
  const timestamp = new Date().toISOString();
  const logFilename = `comparison_${timestamp.replace(/[:.]/g, '-')}_segment${segmentIndex}.json`;
  const logPath = path.join(logsDir, logFilename);
  
  const logEntry = {
    timestamp,
    segmentIndex,
    instructorVideo,
    userVideo,
    durationMs: duration,
    prompt,
    rawResponse: response,
  };
  
  try {
    await fs.writeFile(logPath, JSON.stringify(logEntry, null, 2));
    console.log(`📝 Logged comparison result to: ${logFilename}`);
  } catch (err) {
    console.error('Failed to write log file:', err);
  }
  
  // Also append to a summary log
  const summaryPath = path.join(logsDir, 'comparison_summary.log');
  const summaryLine = `[${timestamp}] Segment ${segmentIndex}: ${instructorVideo} vs ${userVideo} - Duration: ${duration}ms\n`;
  try {
    await fs.appendFile(summaryPath, summaryLine);
  } catch (err) {
    // Ignore
  }
}

// Helper function to convert video to base64 for inline upload
// Note: JavaScript has a maximum string length of ~512MB (0x1fffffe8 characters)
// Base64 encoding increases size by ~33%, so max file size is ~384MB
async function fileToGenerativePart(filePath, mimeType) {
  const stats = await fs.stat(filePath);
  const fileSizeMB = stats.size / 1024 / 1024;
  
  // JavaScript string limit is approximately 512MB, but base64 increases size by ~33%
  // So we can safely handle files up to ~384MB
  const MAX_FILE_SIZE_MB = 350; // Conservative limit to avoid string length errors
  
  if (fileSizeMB > MAX_FILE_SIZE_MB) {
    throw new Error(
      `File size (${fileSizeMB.toFixed(1)} MB) exceeds maximum for base64 encoding (${MAX_FILE_SIZE_MB} MB). ` +
      `Please use shorter video segments (2-5 minutes recommended).`
    );
  }
  
  console.log(`   Reading file (${fileSizeMB.toFixed(1)} MB)...`);
  const data = await fs.readFile(filePath);
  
  console.log(`   Converting to base64...`);
  const base64Data = data.toString('base64');
  
  // Check if base64 string is within limits
  if (base64Data.length > 0x1fffffe8) {
    throw new Error(
      `Base64 encoded string exceeds JavaScript maximum length. ` +
      `File is too large (${fileSizeMB.toFixed(1)} MB). Please use shorter segments.`
    );
  }
  
  return {
    inlineData: {
      data: base64Data,
      mimeType
    }
  };
}

// Compare two video segments
export const compareVideos = async (req, res) => {
  try {
    const { instructorVideo, userVideo, segmentIndex } = req.body;

    if (!instructorVideo || !userVideo) {
      return res.status(400).json({ error: 'Both instructor and user videos are required' });
    }

    if (!process.env.GEMINI_API_KEY) {
      return res.status(500).json({
        error: 'Gemini API key not configured. Please add GEMINI_API_KEY to your .env file'
      });
    }

    const instructorPath = path.join(outputsDir, instructorVideo);
    const userPath = path.join(outputsDir, userVideo);

    // Verify files exist
    try {
      await fs.access(instructorPath);
      await fs.access(userPath);
    } catch (accessError) {
      console.error(`File access error - Instructor: ${instructorPath}, User: ${userPath}`);
      console.error(`Access error:`, accessError);
      return res.status(400).json({ 
        error: 'Video files not found',
        details: `Instructor: ${instructorVideo}, User: ${userVideo}. Please ensure files exist in outputs directory.`
      });
    }

    // Validate segment duration (20 minute maximum = 1200 seconds)
    const getDuration = (filePath) => {
      return new Promise((resolve, reject) => {
        ffmpeg.ffprobe(filePath, (err, metadata) => {
          if (err) reject(err);
          else resolve(metadata.format.duration);
        });
      });
    };

    const instructorDuration = await getDuration(instructorPath);
    const userDuration = await getDuration(userPath);

    if (instructorDuration > 1200) {
      return res.status(400).json({
        error: `Instructor segment is ${(instructorDuration / 60).toFixed(1)} minutes. Maximum allowed is 20 minutes per segment.`
      });
    }

    if (userDuration > 1200) {
      return res.status(400).json({
        error: `User segment is ${(userDuration / 60).toFixed(1)} minutes. Maximum allowed is 20 minutes per segment.`
      });
    }

    // Check file sizes before attempting base64 conversion
    const instructorStats = await fs.stat(instructorPath);
    const userStats = await fs.stat(userPath);
    const instructorSizeMB = instructorStats.size / 1024 / 1024;
    const userSizeMB = userStats.size / 1024 / 1024;
    
    console.log(`   Instructor video: ${instructorSizeMB.toFixed(1)} MB`);
    console.log(`   User video: ${userSizeMB.toFixed(1)} MB`);
    
    // Convert videos to inline data (base64)
    console.log(`   Converting videos to base64...`);
    let instructorPart, userPart;
    try {
      instructorPart = await fileToGenerativePart(instructorPath, 'video/mp4');
      console.log(`   ✅ Instructor video converted`);
      userPart = await fileToGenerativePart(userPath, 'video/mp4');
      console.log(`   ✅ User video converted`);
    } catch (convertError) {
      console.error('   ❌ Error converting videos to base64:', convertError);
      return res.status(400).json({
        error: 'Video file too large for processing',
        details: convertError.message || 'Files must be under 350MB each for base64 encoding. Please use shorter video segments (2-5 minutes recommended).'
      });
    }

    // Initialize Gemini AI (do this here to ensure .env is loaded)
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

    // Create the model - Using latest Gemini 3 Pro (as of Dec 2024)
    const model = genAI.getGenerativeModel({ model: 'gemini-3-pro-preview' });
    console.log(`🤖 Using model: gemini-3-pro-preview`);

    // Generate comparison with enhanced prompt for better UI display
    const prompt = `You are an expert HIIT workout coach analyzing video submissions.

Compare these two workout videos:
1. Instructor Video (reference)
2. User Submission (to be evaluated)

FIRST: Identify the exercise name
- Check if the instructor video displays the exercise name (usually shown at the beginning)
- If the name is shown, extract it exactly as displayed
- If no name is shown, identify the exercise based on the movement pattern
- Format: "Segment [X]: [Exercise Name]" or "Segment [X]: Exercise Name (?)" if you had to guess

ANALYSIS REQUIREMENTS:
Analyze the following aspects:
- Form and technique accuracy
- Movement timing and rhythm
- Exercise execution quality
- Energy and intensity level
- Range of motion
- Rep counting (count reps for both videos and compare)
  IMPORTANT: Allow 1-2 second delay tolerance between user and instructor
  If the user is slightly ahead or behind but completes the same number of reps, this should NOT be penalized
  Only penalize significant timing differences (>2 seconds) or incomplete reps
- Speed/pace comparison

Provide DETAILED analysis including:
1. Exercise name identification (with confidence indicator)
2. Overall match percentage (0-100%)
3. PER-MINUTE breakdown with match % for each minute
4. Rep count comparison (instructor vs user)
   - Account for 1-2 second timing offset when counting
   - Focus on total reps completed, not perfect synchronization
5. Speed analysis (too slow, too fast, or good pace)
6. Form critique with specific timestamps and severity levels
7. Detailed strengths and areas for improvement
8. Quick summary for display
9. Status assessment (completed, incomplete, excellent)
10. Actionable improvement tips

Format your response as JSON with this structure:
{
  "exerciseName": "<extracted or identified exercise name>",
  "exerciseNameConfidence": "<certain|guessed>",
  "segmentNumber": ${segmentIndex || 1},
  "matchPercentage": <number 0-100>,
  "overallScore": "<letter grade A-F>",
  "quickSummary": "<1-sentence summary for display>",
  "statusBadge": "<completed|incomplete|excellent|improving|on_pace>",
  "colorCode": "<green|yellow|orange|red>",
  "topStrength": "<single most important strength>",
  "topIssue": "<single most important issue to address>",
  "completionPercentage": <number 0-100>,
  "timelineSections": [
    {"start": <seconds>, "end": <seconds>, "status": "<good|warning|missed>", "label": "<description>"}
  ],
  "perMinuteAnalysis": [
    {
      "minute": 1,
      "matchPercentage": <number 0-100>,
      "observation": "<what happened in this minute>",
      "repCount": {"instructor": <number>, "user": <number>}
    }
  ],
  "repComparison": {
    "instructorTotal": <number>,
    "userTotal": <number>,
    "difference": <number>,
    "timingOffset": "<description of any timing delay>",
    "analysis": "<explanation - note if rep counts match despite timing offset>"
  },
  "speedAnalysis": "<too slow/too fast/good pace with details>",
  "formIssues": [
    {"timestamp": "<MM:SS>", "issue": "<specific form problem>", "severity": "<low|medium|high>"}
  ],
  "strengths": ["<strength 1>", "<strength 2>", ...],
  "improvements": ["<improvement 1>", "<improvement 2>", ...],
  "analysis": "<detailed paragraph analysis>",
  "timestamps": [
    {"time": "<MM:SS>", "observation": "<what differs here>"}
  ],
  "actionItems": [
    "<specific actionable tip for next workout>"
  ],
  "comparisonStats": {
    "instructorDuration": <seconds>,
    "userDuration": <seconds>,
    "durationDifference": <seconds>,
    "instructorPace": "<seconds per rep>",
    "userPace": "<seconds per rep>"
  }
}`;

    console.log(`⏳ Sending segment ${segmentIndex || 1} to Gemini 3 Pro for analysis...`);
    console.log(`   📹 Instructor: ${instructorVideo}`);
    console.log(`   📹 User: ${userVideo}`);
    
    const startTime = Date.now();
    
    let result;
    try {
      result = await model.generateContent([
        instructorPart,
        userPart,
        { text: prompt }
      ]);
    } catch (geminiError) {
      console.error('   ❌ Gemini API error:', geminiError);
      return res.status(500).json({
        error: 'Gemini API request failed',
        details: geminiError.message || 'Failed to generate content from Gemini'
      });
    }

    const response = result.response.text();
    const duration = Date.now() - startTime;
    
    console.log(`✅ Segment ${segmentIndex || 1} analysis complete in ${(duration / 1000).toFixed(1)}s`);

    // Log the full response to file
    await logComparison(segmentIndex || 1, instructorVideo, userVideo, prompt, response, duration);

    // Parse the JSON response
    let comparisonData;
    try {
      // Extract JSON from markdown code blocks if present
      const jsonMatch = response.match(/```json\n([\s\S]*?)\n```/) || response.match(/\{[\s\S]*\}/);
      const jsonText = jsonMatch ? (jsonMatch[1] || jsonMatch[0]) : response;
      comparisonData = JSON.parse(jsonText);
      console.log(`   📊 Match: ${comparisonData.matchPercentage}% | Grade: ${comparisonData.overallScore}`);
    } catch (parseError) {
      console.error('Failed to parse Gemini response:', response);
      comparisonData = {
        matchPercentage: 0,
        overallScore: 'N/A',
        strengths: [],
        improvements: [],
        analysis: response,
        timestamps: []
      };
    }

    // Store result
    const resultId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const fullResult = {
      id: resultId,
      segmentIndex: segmentIndex || 0,
      instructorVideo,
      userVideo,
      timestamp: new Date().toISOString(),
      ...comparisonData
    };

    comparisonResults.set(resultId, fullResult);

    res.json(fullResult);

  } catch (error) {
    console.error('Comparison error:', error);
    console.error('Error stack:', error.stack);
    res.status(500).json({
      error: 'Failed to compare videos',
      details: error.message || 'Unknown error occurred',
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
};

// Concurrency limit for parallel processing
const CONCURRENT_LIMIT = 4;

// Process a single comparison (internal function for parallel processing)
async function processSingleComparison(instructorVideo, userVideo, segmentNum) {
  return new Promise(async (resolve, reject) => {
    const mockReq = {
      body: {
        instructorVideo,
        userVideo,
        segmentIndex: segmentNum
      }
    };

    const mockRes = {
      json: (data) => resolve(data),
      status: (code) => ({
        json: (data) => {
          const error = new Error(data.error || 'Comparison failed');
          error.code = code;
          error.details = data.details || data.error;
          reject(error);
        }
      })
    };

    try {
      await compareVideos(mockReq, mockRes);
    } catch (err) {
      reject(err);
    }
  });
}

// Parallel batch processor with concurrency limit and auto-retry
async function processComparisonsInParallel(jobId, comparisons) {
  const totalSegments = comparisons.length;
  const queue = comparisons.map((comp, idx) => ({
    ...comp,
    segmentNum: idx + 1,
    retryCount: 0  // Track retry attempts
  }));
  
  const inProgress = new Map(); // Map of segmentNum -> Promise
  const results = [];
  const errors = [];
  
  console.log(`\n📊 Processing ${totalSegments} segments with ${CONCURRENT_LIMIT} concurrent workers\n`);
  
  progressTracker.updateProgress(jobId, {
    status: 'processing',
    message: 'Starting parallel processing...'
  });
  
  while (queue.length > 0 || inProgress.size > 0) {
    // Start new comparisons up to the concurrency limit
    while (inProgress.size < CONCURRENT_LIMIT && queue.length > 0) {
      const item = queue.shift();
      const { instructorVideo, userVideo, segmentNum, retryCount } = item;
      
      // Check if this is a retry
      if (retryCount > 0) {
        progressTracker.markSegmentRetrying(jobId, segmentNum);
        console.log(`🔄 Retrying segment ${segmentNum}/${totalSegments} (attempt ${retryCount + 1})`);
      } else {
        progressTracker.markSegmentProcessing(jobId, segmentNum);
        console.log(`▶️ Starting segment ${segmentNum}/${totalSegments}`);
      }
      
      // Start the comparison and track it
      const comparisonPromise = processSingleComparison(instructorVideo, userVideo, segmentNum)
        .then(result => ({ success: true, result, segmentNum, retryCount }))
        .catch(error => ({ success: false, error, segmentNum, retryCount }));
      
      inProgress.set(segmentNum, comparisonPromise);
    }
    
    // Wait for at least one to complete
    if (inProgress.size > 0) {
      const completed = await Promise.race(inProgress.values());
      inProgress.delete(completed.segmentNum);
      
      if (completed.success) {
        results.push(completed.result);
        progressTracker.markSegmentCompleted(jobId, completed.segmentNum, completed.result);
        if (completed.retryCount > 0) {
          console.log(`✅ Segment ${completed.segmentNum} succeeded on retry (${completed.result.matchPercentage}%)`);
        } else {
          console.log(`✅ Segment ${completed.segmentNum} complete (${completed.result.matchPercentage}%)`);
        }
      } else {
        const errorMessage = completed.error?.details || completed.error?.message || 'Unknown error';
        
        // Check if we can retry this segment
        if (progressTracker.canRetrySegment(jobId, completed.segmentNum)) {
          // Add back to queue for retry
          const originalComparison = comparisons.find((_, idx) => idx + 1 === completed.segmentNum);
          if (originalComparison) {
            queue.push({
              ...originalComparison,
              segmentNum: completed.segmentNum,
              retryCount: completed.retryCount + 1
            });
            console.log(`🔄 Segment ${completed.segmentNum} queued for retry (attempt ${completed.retryCount + 2})`);
          }
        } else {
          // Permanently failed - exceeded retry limit
          errors.push({
            segmentIndex: completed.segmentNum,
            error: errorMessage,
            retryAttempts: completed.retryCount + 1
          });
          progressTracker.markSegmentFailed(jobId, completed.segmentNum, errorMessage);
          console.log(`❌ Segment ${completed.segmentNum} failed permanently after ${completed.retryCount + 1} attempt(s): ${errorMessage}`);
        }
      }
      
      // Log current progress
      const job = progressTracker.getJob(jobId);
      const completedTotal = job.completedCount + job.failedCount;
      const retryingCount = job.segmentStatuses?.filter(s => s === 'retrying').length || 0;
      console.log(`   Progress: ${completedTotal}/${totalSegments} (${job.inProgressCount} in progress, ${retryingCount} retrying)`);
    }
  }
  
  // Calculate overall match percentage
  const validResults = results.filter(r => r.matchPercentage !== undefined);
  const overallMatch = validResults.length > 0
    ? Math.round(validResults.reduce((sum, r) => sum + r.matchPercentage, 0) / validResults.length)
    : 0;

  console.log(`\n${'='.repeat(60)}`);
  console.log(`🏆 Batch comparison complete!`);
  console.log(`   Overall Match: ${overallMatch}%`);
  console.log(`   Success: ${results.length}/${totalSegments} | Errors: ${errors.length}`);
  console.log(`${'='.repeat(60)}\n`);

  // Complete the job
  progressTracker.completeJob(jobId, {
    overallMatchPercentage: overallMatch,
    segmentCount: totalSegments,
    successCount: results.length,
    results,
    errors: errors.length > 0 ? errors : undefined
  });
  
  return { results, errors, overallMatch };
}

// Batch compare multiple segment pairs (with progress tracking and parallel processing)
export const batchCompare = async (req, res) => {
  try {
    const { comparisons } = req.body;

    if (!Array.isArray(comparisons) || comparisons.length === 0) {
      return res.status(400).json({ error: 'Comparisons array is required' });
    }

    // Create a job ID for progress tracking
    const jobId = `compare_${Date.now()}`;
    progressTracker.createComparisonJob(jobId, comparisons.length, comparisons);
    
    console.log(`\n${'='.repeat(60)}`);
    console.log(`🚀 Starting batch comparison: ${comparisons.length} segments`);
    console.log(`   Job ID: ${jobId}`);
    console.log(`   Concurrency: ${CONCURRENT_LIMIT} parallel workers`);
    console.log(`${'='.repeat(60)}\n`);

    // Pre-validate all segments before processing
    const validationErrors = [];
    for (let i = 0; i < comparisons.length; i++) {
      const { instructorVideo, userVideo } = comparisons[i];
      const instructorPath = path.join(outputsDir, instructorVideo);
      const userPath = path.join(outputsDir, userVideo);

      try {
        // Check if files exist
        await fs.access(instructorPath);
        await fs.access(userPath);

        // Check durations
        const getDuration = (filePath) => {
          return new Promise((resolve, reject) => {
            ffmpeg.ffprobe(filePath, (err, metadata) => {
              if (err) reject(err);
              else resolve(metadata.format.duration);
            });
          });
        };

        const instructorDuration = await getDuration(instructorPath);
        const userDuration = await getDuration(userPath);

        if (instructorDuration > 1200) {
          validationErrors.push({
            segmentIndex: i + 1,
            error: `Instructor segment ${i + 1} is ${(instructorDuration / 60).toFixed(1)} minutes (exceeds 20 min limit)`
          });
        }

        if (userDuration > 1200) {
          validationErrors.push({
            segmentIndex: i + 1,
            error: `User segment ${i + 1} is ${(userDuration / 60).toFixed(1)} minutes (exceeds 20 min limit)`
          });
        }
      } catch (error) {
        validationErrors.push({
          segmentIndex: i + 1,
          error: `Error validating segment ${i + 1}: ${error.message}`
        });
      }
    }

    // If validation errors exist, return them without processing
    if (validationErrors.length > 0) {
      progressTracker.failJob(jobId, 'Validation failed');
      return res.status(400).json({
        error: 'Some segments exceed the 20 minute maximum limit',
        validationErrors
      });
    }

    // Return immediately with jobId - processing happens in background
    res.json({
      jobId,
      status: 'processing',
      message: `Processing ${comparisons.length} segments with ${CONCURRENT_LIMIT} concurrent workers`,
      totalSegments: comparisons.length
    });

    // Start parallel processing in background (don't await)
    processComparisonsInParallel(jobId, comparisons).catch(error => {
      console.error('Background processing error:', error);
      progressTracker.failJob(jobId, error.message);
    });

  } catch (error) {
    console.error('Batch comparison error:', error);
    res.status(500).json({
      error: 'Failed to perform batch comparison',
      details: error.message
    });
  }
};

// Get comparison progress with partial results
export const getComparisonProgress = async (req, res) => {
  try {
    const { jobId } = req.params;
    const job = progressTracker.getJobWithSummary(jobId);

    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }

    // Return enhanced progress data including:
    // - segmentStatuses: array of status per segment
    // - segmentResults: array of results (null for incomplete)
    // - results: array of completed results only
    // - overallMatchPercentage: calculated from completed segments
    res.json(job);
  } catch (error) {
    console.error('Get comparison progress error:', error);
    res.status(500).json({ error: 'Failed to get progress' });
  }
};

// Retry failed segments from a completed job
export const retryFailedSegments = async (req, res) => {
  try {
    const { jobId } = req.params;
    const { segmentIndices } = req.body; // Optional array of segment indices to retry (1-based)

    // Get the original job
    const originalJob = progressTracker.getJob(jobId);
    if (!originalJob) {
      return res.status(404).json({ error: 'Original job not found' });
    }

    // Job must be completed
    if (originalJob.status !== 'completed') {
      return res.status(400).json({ 
        error: 'Job is not completed. Only completed jobs can have segments retried.' 
      });
    }

    // Get original comparisons
    if (!originalJob.originalComparisons || originalJob.originalComparisons.length === 0) {
      return res.status(400).json({ 
        error: 'Original comparisons not found',
        message: 'Cannot retry: original video information was not stored'
      });
    }

    // Find failed segments to retry
    const segmentsToRetry = [];
    for (let i = 0; i < originalJob.totalSegments; i++) {
      const segmentIndex = i + 1;
      const status = originalJob.segmentStatuses[i];
      
      // If segmentIndices is provided, only retry those specific segments
      if (segmentIndices && Array.isArray(segmentIndices)) {
        if (!segmentIndices.includes(segmentIndex)) continue;
      }
      
      // Only retry segments that failed
      if (status === 'error') {
        segmentsToRetry.push({
          ...originalJob.originalComparisons[i],
          segmentNum: segmentIndex
        });
      }
    }

    if (segmentsToRetry.length === 0) {
      return res.status(400).json({ 
        error: 'No failed segments found to retry',
        message: segmentIndices 
          ? 'The specified segments are not in failed status'
          : 'All segments completed successfully'
      });
    }

    // Create a new job for retries
    const retryJobId = `retry_${jobId}_${Date.now()}`;
    progressTracker.createComparisonJob(retryJobId, segmentsToRetry.length, segmentsToRetry);
    
    console.log(`\n${'='.repeat(60)}`);
    console.log(`🔄 Retrying ${segmentsToRetry.length} failed segment(s) from job ${jobId}`);
    console.log(`   Retry Job ID: ${retryJobId}`);
    console.log(`${'='.repeat(60)}\n`);

    // Return immediately with retry jobId
    res.json({
      jobId: retryJobId,
      originalJobId: jobId,
      status: 'processing',
      message: `Retrying ${segmentsToRetry.length} failed segment(s)`,
      totalSegments: segmentsToRetry.length,
      retriedSegments: segmentsToRetry.map(s => s.segmentNum)
    });

    // Start parallel processing in background (don't await)
    processComparisonsInParallel(retryJobId, segmentsToRetry).catch(error => {
      console.error('Retry processing error:', error);
      progressTracker.failJob(retryJobId, error.message);
    });

  } catch (error) {
    console.error('Retry failed segments error:', error);
    res.status(500).json({ 
      error: 'Failed to retry segments',
      details: error.message 
    });
  }
};

// Get stored comparison result
export const getComparisonResult = async (req, res) => {
  try {
    const { id } = req.params;
    const result = comparisonResults.get(id);

    if (!result) {
      return res.status(404).json({ error: 'Comparison result not found' });
    }

    res.json(result);
  } catch (error) {
    console.error('Get result error:', error);
    res.status(500).json({
      error: 'Failed to retrieve comparison result',
      details: error.message
    });
  }
};
