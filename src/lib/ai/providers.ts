import { createGroq } from '@ai-sdk/groq';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { CONFIG } from '@/lib/config';

// Groq provider (primary for fast structured generation and chat)
export const groqProvider = createGroq({
  apiKey: process.env.GROQ_API_KEY,
});

// Google/Gemini provider (embeddings + fallback LLM)
export const googleProvider = createGoogleGenerativeAI({
  apiKey: process.env.GEMINI_API_KEY,
});

// Model instances
export function getGroqModel() {
  return groqProvider(CONFIG.GROQ_MODEL);
}

export function getGeminiModel() {
  return googleProvider(CONFIG.GEMINI_LLM_MODEL);
}

export function getEmbeddingModel() {
  return googleProvider.textEmbeddingModel(CONFIG.GEMINI_EMBEDDING_MODEL, {
    outputDimensionality: CONFIG.EMBEDDING_DIMENSION,
  });
}

