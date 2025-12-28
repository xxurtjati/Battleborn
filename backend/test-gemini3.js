import { GoogleGenerativeAI } from '@google/generative-ai';
import dotenv from 'dotenv';

dotenv.config();

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: 'gemini-3-pro-preview' });

try {
  const result = await model.generateContent('Say hello in 3 words');
  const response = result.response.text();
  console.log('Success with Gemini 3 Pro! Response:', response);
} catch (error) {
  console.error('Error with Gemini 3 Pro:', error.message);
  console.error('Status:', error.status);
}
