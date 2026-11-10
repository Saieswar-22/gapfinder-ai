import { getGroqModel, getGeminiModel } from './providers';

interface RetryOptions {
  maxRetries?: number;
  initialDelay?: number;
  maxDelay?: number;
  useFallback?: boolean;
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`${label} request timed out after ${ms}ms`)), ms)
    ),
  ]);
}

export async function withRetry<T>(
  fn: (model: any) => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const { maxRetries = 2, initialDelay = 1500, maxDelay = 10000, useFallback = true } = options;

  let lastError: Error | null = null;

  // Try with Groq first
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await withTimeout(fn(getGroqModel()), 20000, 'Groq');
    } catch (error: any) {
      lastError = error;
      const msg = error?.message || String(error);
      const isRateLimit =
        error?.status === 429 ||
        msg.includes('Rate limit') ||
        msg.includes('429') ||
        msg.includes('OTPM') ||
        msg.includes('Request too large') ||
        msg.includes('TPM');
      console.warn(`Groq attempt ${attempt + 1} failed:`, msg);

      // If rate limited or quota exceeded on Groq, check needed refill wait
      if (isRateLimit && attempt < maxRetries - 1) {
        const match = msg.match(/try again in ([\d\.]+)s/i);
        const retrySec = match ? parseFloat(match[1]) : 0;
        if (retrySec > 3) {
          console.log(`Groq TPM requires ${retrySec}s wait. Transitioning directly to Gemini fallback.`);
          break;
        }
        console.log('Briefly waiting 1.5s for Groq TPM bucket to refill...');
        await new Promise((r) => setTimeout(r, 1500));
        continue;
      }

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
      return await withTimeout(fn(getGeminiModel()), 50000, 'Gemini');
    } catch (error: any) {
      console.error('Gemini fallback failed:', error?.message || error);
      throw error;
    }
  }

  throw lastError || new Error('All retry attempts failed');
}

