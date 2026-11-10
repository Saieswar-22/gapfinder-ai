import crypto from 'crypto';
import { CONFIG } from '@/lib/config';

export interface ExtractionResult {
  pages: string[];
  pageCount: number;
}

/**
 * Validate file type by extension and magic bytes.
 */
export function validateFileType(
  buffer: Buffer,
  filename: string,
  declaredMimeType?: string
): { valid: boolean; type: 'pdf' | 'txt' | null; error?: string } {
  const ext = filename.toLowerCase().split('.').pop();

  if (buffer.length === 0) {
    return { valid: false, type: null, error: 'File is empty' };
  }

  if (buffer.length > CONFIG.MAX_FILE_SIZE) {
    return {
      valid: false,
      type: null,
      error: `File size exceeds the 4 MB limit (${(buffer.length / (1024 * 1024)).toFixed(2)} MB)`,
    };
  }

  if (ext === 'pdf') {
    // Check PDF magic bytes: %PDF
    if (buffer.length < 4 || buffer.subarray(0, 4).toString('ascii') !== '%PDF') {
      return { valid: false, type: null, error: 'File is not a valid PDF or has a corrupted header' };
    }
    return { valid: true, type: 'pdf' };
  }

  if (ext === 'txt') {
    return { valid: true, type: 'txt' };
  }

  return { valid: false, type: null, error: 'Unsupported file type. Only .pdf and .txt files are allowed' };
}

/**
 * Extract per-page text from PDF using unpdf.
 */
export async function extractPdfText(buffer: Buffer): Promise<ExtractionResult> {
  try {
    const { getDocumentProxy, extractText } = await import('unpdf');
    const uint8 = new Uint8Array(buffer);
    const pdf = await getDocumentProxy(uint8);
    const { totalPages, text: rawPages } = await extractText(pdf, { mergePages: false });

    const pages = Array.isArray(rawPages) ? rawPages : [rawPages];

    return {
      pages,
      pageCount: totalPages,
    };
  } catch (err: any) {
    throw new Error(`Failed to extract text from PDF: ${err?.message || 'corrupt or encrypted file'}`);
  }
}

/**
 * Extract text from plain-text file.
 */
export function extractTxtText(buffer: Buffer): ExtractionResult {
  const text = buffer.toString('utf-8');
  return {
    pages: [text],
    pageCount: 1,
  };
}

/**
 * Check if extracted text is sufficient (not a scanned image PDF).
 */
export function hasExtractableText(pages: string[]): boolean {
  const totalChars = pages.reduce((acc, p) => acc + (p?.trim().length || 0), 0);
  return totalChars >= CONFIG.MIN_TEXT_LENGTH;
}

/**
 * Compute SHA-256 content hash for duplicate detection per subject.
 */
export function computeContentHash(buffer: Buffer): string {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

