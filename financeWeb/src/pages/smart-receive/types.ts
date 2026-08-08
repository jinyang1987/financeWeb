/**
 * @license
 * Copyright (c) 2024. All rights reserved.
 * Smart Receive - Type definitions and helpers
 */

/** OCR job representation */
export interface OcrJob {
  id: string;
  fileName: string;
  fileType: 'image' | 'pdf';
  status: 'idle' | 'processing' | 'done' | 'error';
  ocrText: string;
  extracted: ExtractedField[];
  progress: number;
  timestamp: string;
  error?: string;
  imageUrl?: string;
}

/** A single extracted field from OCR text */
export interface ExtractedField {
  label: string;
  key: string;
  value: string;
  confidence: 'high' | 'medium' | 'low';
}

/** PDF / document conversion job representation */
export interface ConvertJob {
  id: string;
  fileName: string;
  sourceFormat: string;
  targetFormat: string;
  status: 'idle' | 'processing' | 'done' | 'error';
  progress: number;
  error?: string;
  convertedText?: string;
  originalSize?: string;
  convertedSize?: string;
}

/** Generate a short random job id */
export const generateId = () => Math.random().toString(36).slice(2, 11);

/** Format byte count to human-readable string */
export const formatFileSize = (bytes: number): string => {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
};

/** Format current time as zh-CN locale string */
export const formatTime = () => {
  const d = new Date();
  return d.toLocaleString('zh-CN', { hour12: false });
};
