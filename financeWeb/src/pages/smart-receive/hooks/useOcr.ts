/**
 * @license
 * Copyright (c) 2024. All rights reserved.
 * Smart Receive - OCR processing hook
 */

import { useState, useCallback } from 'react';
import { createWorker } from 'tesseract.js';
import * as pdfjsLib from 'pdfjs-dist';
import type { OcrJob } from '../types';
import { generateId, formatTime } from '../types';
import { smartExtract } from '../extractRules';

// Set pdf.js worker once at module level
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url
).toString();

/**
 * Hook that manages OCR state and provides the upload handler.
 * @param setSelectedJobId - callback from parent to update the selected job
 */
export function useOcr(setSelectedJobId: (id: string | null) => void) {
  const [ocrJobs, setOcrJobs] = useState<OcrJob[]>([]);

  /** Upload files (image / PDF) and run OCR */
  const handleOcrUpload = useCallback(async (files: FileList | null) => {
    if (!files?.length) return;

    for (const file of Array.from(files)) {
      const jobId = generateId();
      const isPdf = file.type === 'application/pdf';
      const imageUrl = !isPdf ? URL.createObjectURL(file) : undefined;

      const job: OcrJob = {
        id: jobId,
        fileName: file.name,
        fileType: isPdf ? 'pdf' : 'image',
        status: 'processing',
        ocrText: '',
        extracted: [],
        progress: 0,
        timestamp: formatTime(),
        imageUrl,
      };
      setOcrJobs(prev => [job, ...prev]);
      setSelectedJobId(jobId);

      try {
        let text = '';

        if (isPdf) {
          // === PDF handling: render each page to canvas, then OCR ===
          setOcrJobs(prev =>
            prev.map(j => (j.id === jobId ? { ...j, progress: 5 } : j))
          );

          const arrayBuffer = await file.arrayBuffer();
          const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
          const totalPages = pdf.numPages;

          const worker = await createWorker('chi_sim+eng', 1, {
            logger: (m) => {
              if (m.status === 'recognizing text') {
                const ocrProgress = Math.round((m.progress ?? 0) * 100 * totalPages);
                setOcrJobs(prev =>
                  prev.map(j =>
                    j.id === jobId
                      ? { ...j, progress: Math.min(95, 5 + ocrProgress / totalPages) }
                      : j
                  )
                );
              }
            },
          });

          for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
            const pageProgress = 5 + Math.round((pageNum / totalPages) * 50);
            setOcrJobs(prev =>
              prev.map(j =>
                j.id === jobId
                  ? { ...j, progress: pageProgress, ocrText: `正在识别第 ${pageNum}/${totalPages} 页...` }
                  : j
              )
            );

            const page = await pdf.getPage(pageNum);
            const viewport = page.getViewport({ scale: 2.0 });
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d')!;
            canvas.width = viewport.width;
            canvas.height = viewport.height;

            await page.render({ canvas, canvasContext: ctx, viewport }).promise;

            const { data: { text: pageText } } = await worker.recognize(canvas);
            text += pageText + '\n\n';

            canvas.width = 0;
            canvas.height = 0;
          }

          await worker.terminate();
        } else {
          // === Image handling: direct OCR ===
          const worker = await createWorker('chi_sim+eng', 1, {
            logger: (m) => {
              if (m.status === 'recognizing text') {
                setOcrJobs(prev =>
                  prev.map(j =>
                    j.id === jobId
                      ? { ...j, progress: Math.round((m.progress ?? 0) * 100) }
                      : j
                  )
                );
              }
            },
          });

          const { data: { text: ocrText } } = await worker.recognize(file);
          text = ocrText;
          await worker.terminate();
        }

        const extracted = smartExtract(text);

        setOcrJobs(prev =>
          prev.map(j =>
            j.id === jobId
              ? { ...j, status: 'done', ocrText: text, extracted, progress: 100 }
              : j
          )
        );
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : '未知错误';
        const errorDetail = isPdf
          ? `PDF 处理失败: ${errorMsg}\n提示：Tesseract.js 不直接支持 PDF，已通过 PDF.js 渲染为图片后识别。请确保文件不是加密 PDF，且文件内容为可识别图像。`
          : `图片识别失败: ${errorMsg}\n提示：请确保文件为常见图片格式(JPG/PNG/TIFF)，文件大小不超过 20MB。`;

        setOcrJobs(prev =>
          prev.map(j =>
            j.id === jobId ? { ...j, status: 'error', error: errorDetail } : j
          )
        );
      }
    }
  }, [setSelectedJobId]);

  return { ocrJobs, setOcrJobs, handleOcrUpload };
}
