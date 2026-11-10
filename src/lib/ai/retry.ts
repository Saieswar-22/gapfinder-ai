import { getGroqModel, getGeminiModel } from './providers';

interface RetryOptions {
  maxRetries?: number;
  initialDelay?: number;
  maxDelay?: number;
  useFallback?: boolean;
}

export async function withRetry<T>(
  fn: (model: any) => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const { maxRetries = 3, initialDelay = 1000, maxDelay = 10000, useFallback = true } = options;

  let lastError: Error | null = null;

  // Try with Groq first
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn(getGroqModel());
    } catch (error: any) {
      lastError = error;
      console.error(`Groq attempt ${attempt + 1} failed:`, error?.message || error);

      // Don't retry on non-retryable 4xx errors other than 429
      if (error?.status && error.status >= 400 && error.status < 500 && error.status !== 429) {
        break;
      }

      if (attempt < maxRetries - 1) {
        const delay = Math.min(initialDelay * Math.pow(2, attempt), maxDelay);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  // Fallback to Gemini
  if (useFallback) {
    try {
      console.log('Falling back to Gemini...');
      return await fn(getGeminiModel());
    } catch (error: any) {
      console.error('Gemini fallback failed:', error?.message || error);
      throw error;
    }
  }

  throw lastError || new Error('All retry attempts failed');
}
