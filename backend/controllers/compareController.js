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
async function fileToGenerativePart(filePath, mimeType) {
  const data = await fs.readFile(filePath);
  return {
    inlineData: {
      data: data.toString('base64'),
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
    await fs.access(instructorPath);
    await fs.access(userPath);

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

    // Convert videos to inline data (base64)
    const instructorPart = await fileToGenerativePart(instructorPath, 'video/mp4');
    const userPart = await fileToGenerativePart(userPath, 'video/mp4');

    // Initialize Gemini AI (do this here to ensure .env is loaded)
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

    // Create the model - Using latest Gemini 3 Pro (as of Dec 2024)
    const model = genAI.getGenerativeModel({ model: 'gemini-3-pro-preview' });
    console.log(`🤖 Using model: gemini-3-pro-preview`);

    // Generate comparison
    const prompt = `You are an expert HIIT workout coach analyzing video submissions.

Compare these two workout videos:
1. Instructor Video (reference)
2. User Submission (to be evaluated)

Analyze the following aspects:
- Form and technique accuracy
- Movement timing and rhythm
- Exercise execution quality
- Energy and intensity level
- Range of motion
- Rep counting (count reps for both videos and compare)
- Speed/pace comparison

Provide DETAILED analysis including:
1. Overall match percentage (0-100%)
2. PER-MINUTE breakdown with match % for each minute
3. Rep count comparison (instructor vs user)
4. Speed analysis (too slow, too fast, or good pace)
5. Form critique with specific timestamps
6. Detailed strengths and areas for improvement

Format your response as JSON with this structure:
{
  "matchPercentage": <number 0-100>,
  "overallScore": "<letter grade A-F>",
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
    "analysis": "<explanation of rep differences>"
  },
  "speedAnalysis": "<too slow/too fast/good pace with details>",
  "formIssues": [
    {"timestamp": "<MM:SS>", "issue": "<specific form problem>"}
  ],
  "strengths": ["<strength 1>", "<strength 2>", ...],
  "improvements": ["<improvement 1>", "<improvement 2>", ...],
  "analysis": "<detailed paragraph analysis>",
  "timestamps": [
    {"time": "<MM:SS>", "observation": "<what differs here>"}
  ]
}`;

    console.log(`⏳ Sending segment ${segmentIndex || 1} to Gemini 3 Pro for analysis...`);
    console.log(`   📹 Instructor: ${instructorVideo}`);
    console.log(`   📹 User: ${userVideo}`);
    
    const startTime = Date.now();
    
    const result = await model.generateContent([
      instructorPart,
      userPart,
      { text: prompt }
    ]);

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
    res.status(500).json({
      error: 'Failed to compare videos',
      details: error.message
    });
  }
};

// Batch compare multiple segment pairs (with progress tracking)
export const batchCompare = async (req, res) => {
  try {
    const { comparisons } = req.body;

    if (!Array.isArray(comparisons) || comparisons.length === 0) {
      return res.status(400).json({ error: 'Comparisons array is required' });
    }

    // Create a job ID for progress tracking
    const jobId = `compare_${Date.now()}`;
    progressTracker.createJob(jobId, 100);
    
    console.log(`\n${'='.repeat(60)}`);
    console.log(`🚀 Starting batch comparison: ${comparisons.length} segments`);
    console.log(`   Job ID: ${jobId}`);
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

    const results = [];
    const errors = [];
    const totalSegments = comparisons.length;

    for (let i = 0; i < comparisons.length; i++) {
      const { instructorVideo, userVideo } = comparisons[i];
      const segmentNum = i + 1;
      
      // Update progress
      const progressPercent = Math.round((i / totalSegments) * 100);
      progressTracker.updateProgress(jobId, {
        status: 'processing',
        progress: progressPercent,
        message: `Analyzing segment ${segmentNum} of ${totalSegments}...`,
        currentSegment: segmentNum,
        totalSegments,
        completedSegments: i
      });

      try {
        // Create a mock request object for compareVideos
        const mockReq = {
          body: {
            instructorVideo,
            userVideo,
            segmentIndex: segmentNum
          }
        };

        // Use a promise to handle the comparison
        const result = await new Promise((resolve, reject) => {
          const mockRes = {
            json: (data) => resolve(data),
            status: (code) => ({
              json: (data) => reject({ code, ...data })
            })
          };

          compareVideos(mockReq, mockRes);
        });

        results.push(result);
        
        // Update progress with completed segment
        progressTracker.updateProgress(jobId, {
          progress: Math.round(((i + 1) / totalSegments) * 100),
          message: `Segment ${segmentNum} complete (${result.matchPercentage}%)`,
          completedSegments: i + 1
        });
        
      } catch (error) {
        console.error(`❌ Segment ${segmentNum} failed:`, error.error || error.message);
        errors.push({
          segmentIndex: segmentNum,
          error: error.error || error.message
        });
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

    progressTracker.completeJob(jobId, {
      overallMatchPercentage: overallMatch,
      segmentCount: comparisons.length,
      successCount: results.length,
      results
    });

    res.json({
      jobId,
      overallMatchPercentage: overallMatch,
      segmentCount: comparisons.length,
      successCount: results.length,
      errorCount: errors.length,
      results,
      errors: errors.length > 0 ? errors : undefined
    });

  } catch (error) {
    console.error('Batch comparison error:', error);
    res.status(500).json({
      error: 'Failed to perform batch comparison',
      details: error.message
    });
  }
};

// Get comparison progress
export const getComparisonProgress = async (req, res) => {
  try {
    const { jobId } = req.params;
    const job = progressTracker.getJob(jobId);

    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }

    res.json(job);
  } catch (error) {
    console.error('Get comparison progress error:', error);
    res.status(500).json({ error: 'Failed to get progress' });
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
