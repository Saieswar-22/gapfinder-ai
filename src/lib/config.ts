// GapFinder configuration — all thresholds configurable via env vars
export const CONFIG = {
  // Gap classification thresholds
  STRONG_THRESHOLD: parseFloat(process.env.STRONG_THRESHOLD || '0.75'),
  MEDIUM_THRESHOLD: parseFloat(process.env.MEDIUM_THRESHOLD || '0.50'),
  MIN_ATTEMPTS_FOR_CLASSIFICATION: parseInt(process.env.MIN_ATTEMPTS_FOR_CLASSIFICATION || '2'),
  LOW_CONFIDENCE_MAX_ATTEMPTS: parseInt(process.env.LOW_CONFIDENCE_MAX_ATTEMPTS || '4'),
  RECENCY_WEIGHT: parseFloat(process.env.RECENCY_WEIGHT || '0.6'),

  // Retrieval
  SIMILARITY_THRESHOLD: parseFloat(process.env.SIMILARITY_THRESHOLD || '0.7'),
  RETRIEVAL_TOP_K: parseInt(process.env.RETRIEVAL_TOP_K || '8'),

  // Chunking
  CHUNK_SIZE_TOKENS: 600,
  CHUNK_OVERLAP_TOKENS: 80,
  MIN_CHUNK_TOKENS: 50,

  // Embedding
  EMBEDDING_DIMENSION: parseInt(process.env.EMBEDDING_DIMENSION || '768'),
  EMBEDDING_BATCH_SIZE: 20,

  // Upload
  MAX_FILE_SIZE: 4 * 1024 * 1024, // 4MB
  MIN_TEXT_LENGTH: 50, // minimum chars to consider a PDF as having extractable text

  // Quiz
  MIN_QUESTIONS: 5,
  MAX_QUESTIONS: 30,
  DEFAULT_QUESTIONS: 10,
  MIN_QUESTIONS_PER_TOPIC: 2,

  // Models
  GROQ_MODEL: process.env.GROQ_MODEL || 'openai/gpt-oss-120b',
  GEMINI_EMBEDDING_MODEL: process.env.GEMINI_EMBEDDING_MODEL || 'gemini-embedding-001',
  GEMINI_LLM_MODEL: process.env.GEMINI_LLM_MODEL || 'gemini-2.5-flash',

  // Auth
  RATE_LIMIT_WINDOW_MS: 15 * 60 * 1000, // 15 minutes
  RATE_LIMIT_MAX_ATTEMPTS: 10,
  JWT_EXPIRY: '7d',

  // Plan
  WEAK_PRIORITY: 4,
  MEDIUM_PRIORITY: 3,
  INSUFFICIENT_PRIORITY: 2,
  STRONG_PRIORITY: 1,
  STRONG_MAINTENANCE_RATIO: 0.1, // strong topics get 10% of their proportional share
  RETEST_MINUTES: 15, // final retest task duration
} as const;

