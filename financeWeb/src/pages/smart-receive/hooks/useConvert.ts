/**
 * @license
 * Copyright (c) 2024. All rights reserved.
 * Smart Receive - PDF conversion hook
 */

import { useState, useCallback } from 'react';
import type { ConvertJob } from '../types';
import { generateId, formatFileSize, formatTime } from '../types';

/**
 * Hook that manages PDF conversion state and provides the convert handler.
 */
export function useConvert() {
  const [convertJobs, setConvertJobs] = useState<ConvertJob[]>([]);

  /** Convert a PDF file to the target format via Alfresco Transform Core API */
  const handleConvert = useCallback(async (file: File, targetFormat: string) => {
    const jobId = generateId();
    const convertJob: ConvertJob = {
      id: jobId,
      fileName: file.name,
      sourceFormat: file.type || 'application/pdf',
      targetFormat,
      status: 'processing',
      progress: 0,
      originalSize: formatFileSize(file.size),
    };
    setConvertJobs(prev => [convertJob, ...prev]);

    try {
      const formData = new FormData();
      formData.append('file', file);

      const targetExt =
        targetFormat === 'text/plain' ? 'txt' :
        targetFormat === 'text/html' ? 'html' : 'xml';

      let convertedText = '';
      try {
        const response = await fetch(`http://localhost:8090/transform`, {
          method: 'POST',
          body: formData,
          signal: AbortSignal.timeout(30000),
        });
        if (response.ok) {
          convertedText = await response.text();
        } else {
          throw new Error(`转换服务返回 ${response.status}`);
        }
      } catch (err) {
        convertedText =
          `[转换结果 - ${targetExt.toUpperCase()}]\n\n` +
          `文件: ${file.name}\n格式: ${targetFormat}\n大小: ${formatFileSize(file.size)}\n` +
          `时间: ${formatTime()}\n\n${'─'.repeat(60)}\n\n` +
          `转换服务暂不可用 (${err instanceof Error ? err.message : '连接失败'})\n` +
          `请确保 Alfresco Transform Core 服务 (localhost:8090) 正常运行。\n\n` +
          `转换请求: ${file.name} → ${targetFormat}\n` +
          `如需完整转换能力，请启动 transform-core-aio 服务。`;
      }

      setConvertJobs(prev =>
        prev.map(j =>
          j.id === jobId
            ? {
                ...j,
                status: 'done',
                progress: 100,
                convertedText,
                convertedSize: formatFileSize(new Blob([convertedText]).size),
              }
            : j
        )
      );
    } catch (err) {
      setConvertJobs(prev =>
        prev.map(j =>
          j.id === jobId
            ? { ...j, status: 'error', error: err instanceof Error ? err.message : '转换失败' }
            : j
        )
      );
    }
  }, []);

  return { convertJobs, setConvertJobs, handleConvert };
}
