import { GoogleGenerativeAI } from '@google/generative-ai';
import dotenv from 'dotenv';

dotenv.config();

console.log('API Key loaded:', process.env.GEMINI_API_KEY ? 'YES' : 'NO');
console.log('API Key length:', process.env.GEMINI_API_KEY?.length);

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

try {
  const result = await model.generateContent('Say hello in 3 words');
  const response = result.response.text();
  console.log('Success! Response:', response);
} catch (error) {
  console.error('Error:', error.message);
  console.error('Status:', error.status);
}
