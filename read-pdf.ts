import fs from 'fs';
const pdfParse = require('pdf-parse');

const pdfPath = './assets/档案整理三大维度视图的业务逻辑与开发需求梳理.pdf';

async function readPdf() {
  try {
    const dataBuffer = fs.readFileSync(pdfPath);
    const data = await pdfParse(dataBuffer);
    
    console.log('=== PDF Content ===\n');
    console.log(data.text);
  } catch (error) {
    console.error('Error reading PDF:', error);
  }
}

readPdf();