import { FetchClient, Config } from 'coze-coding-dev-sdk';

const config = new Config();
const client = new FetchClient(config);

const pdfUrl = 'https://code.coze.cn/api/sandbox/coze_coding/file/proxy?expire_time=-1&file_path=assets%2F%E6%A1%A3%E6%A1%88%E6%95%B4%E7%90%86%E4%B8%89%E5%A4%A7%E7%BB%B4%E5%BA%A6%E8%A7%86%E5%9B%BE%E7%9A%84%E4%B8%9A%E5%8A%A1%E9%80%BB%E8%BE%91%E4%B8%8E%E5%BC%80%E5%8F%E1%E9%9C%80%E6%B1%82%E6%A2%B3%E7%90%86.pdf&nonce=11f97ed3-1bae-4917-a95b-4f4676803273&project_id=7645945336657379366&sign=93d45c5b8212b3a794b7049350f4035aa1c2b1bd0a9328537fad593632d6fa7a';

async function fetchPdf() {
  try {
    const response = await client.fetch(pdfUrl);
    
    console.log('Title:', response.title);
    console.log('Filetype:', response.filetype);
    console.log('Status:', response.status_code);
    
    // 提取文本内容
    const textContent = response.content
      .filter(item => item.type === 'text')
      .map(item => item.text)
      .join('\n');
    
    console.log('\n=== PDF Content ===\n');
    console.log(textContent);
  } catch (error) {
    console.error('Error:', error);
  }
}

fetchPdf();