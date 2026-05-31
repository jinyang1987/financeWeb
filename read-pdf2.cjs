const fs = require('fs');
const pdfjsLib = require('pdfjs-dist/legacy/build/pdf.js');

const pdfPath = './assets/档案整理三大维度视图的业务逻辑与开发需求梳理.pdf';

async function readPdf() {
  try {
    const dataBuffer = fs.readFileSync(pdfPath);
    const loadingTask = pdfjsLib.getDocument({
      data: new Uint8Array(dataBuffer),
      useSystemFonts: true
    });
    
    const pdfDocument = await loadingTask.promise;
    console.log('PDF loaded, pages:', pdfDocument.numPages);
    
    let fullText = '';
    
    for (let i = 1; i <= pdfDocument.numPages; i++) {
      const page = await pdfDocument.getPage(i);
      const textContent = await page.getTextContent();
      const pageText = textContent.items.map(item => item.str).join(' ');
      fullText += pageText + '\n';
    }
    
    console.log('\n=== PDF Content ===\n');
    console.log(fullText);
  } catch (error) {
    console.error('Error reading PDF:', error);
  }
}

readPdf();