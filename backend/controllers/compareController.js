import { GoogleGenerativeAI } from '@google/generative-ai';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const outputsDir = path.join(__dirname, '..', '..', 'outputs');

// Store comparison results (in production, use a database)
const comparisonResults = new Map();

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

    // Convert videos to inline data (base64)
    const instructorPart = await fileToGenerativePart(instructorPath, 'video/mp4');
    const userPart = await fileToGenerativePart(userPath, 'video/mp4');

    // Initialize Gemini AI (do this here to ensure .env is loaded)
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

    // Create the model
    const model = genAI.getGenerativeModel({ model: 'gemini-3-pro-preview' });

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

    const result = await model.generateContent([
      instructorPart,
      userPart,
      { text: prompt }
    ]);

    const response = result.response.text();

    // Parse the JSON response
    let comparisonData;
    try {
      // Extract JSON from markdown code blocks if present
      const jsonMatch = response.match(/```json\n([\s\S]*?)\n```/) || response.match(/\{[\s\S]*\}/);
      const jsonText = jsonMatch ? (jsonMatch[1] || jsonMatch[0]) : response;
      comparisonData = JSON.parse(jsonText);
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

// Batch compare multiple segment pairs
export const batchCompare = async (req, res) => {
  try {
    const { comparisons } = req.body;

    if (!Array.isArray(comparisons) || comparisons.length === 0) {
      return res.status(400).json({ error: 'Comparisons array is required' });
    }

    const results = [];
    const errors = [];

    for (let i = 0; i < comparisons.length; i++) {
      const { instructorVideo, userVideo } = comparisons[i];

      try {
        // Create a mock request object for compareVideos
        const mockReq = {
          body: {
            instructorVideo,
            userVideo,
            segmentIndex: i + 1
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
      } catch (error) {
        errors.push({
          segmentIndex: i + 1,
          error: error.error || error.message
        });
      }
    }

    // Calculate overall match percentage
    const validResults = results.filter(r => r.matchPercentage !== undefined);
    const overallMatch = validResults.length > 0
      ? Math.round(validResults.reduce((sum, r) => sum + r.matchPercentage, 0) / validResults.length)
      : 0;

    res.json({
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
