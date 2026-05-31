const pdfjsLib = require('pdfjs-dist/legacy/build/pdf.js');
const fs = require('fs');
const path = require('path');

// 设置 worker
pdfjsLib.GlobalWorkerOptions.workerSrc = require.resolve('pdfjs-dist/legacy/build/pdf.worker.js');

async function readPDF() {
  const pdfPath = path.join(__dirname, 'assets', '档案整理三大维度视图的业务逻辑与开发需求梳理_20260531171626419.pdf');
  
  if (!fs.existsSync(pdfPath)) {
    console.error('PDF file not found:', pdfPath);
    return;
  }

  const dataBuffer = fs.readFileSync(pdfPath);
  const data = new Uint8Array(dataBuffer);
  
  try {
    const loadingTask = pdfjsLib.getDocument({ data });
    const pdfDocument = await loadingTask.promise;
    
    console.log('Number of pages:', pdfDocument.numPages);
    
    for (let i = 1; i <= pdfDocument.numPages; i++) {
      const page = await pdfDocument.getPage(i);
      const textContent = await page.getTextContent();
      const text = textContent.items.map(item => item.str).join(' ');
      console.log(`\n--- Page ${i} ---\n${text}`);
    }
  } catch (error) {
    console.error('Error reading PDF:', error);
  }
}

readPDF();