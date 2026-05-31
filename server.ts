import express from 'express';
import { FetchClient, Config, HeaderUtils } from 'coze-coding-dev-sdk';
import cors from 'cors';

const app = express();
app.use(cors());
app.use(express.json());

const config = new Config();
const fetchClient = new FetchClient(config);

// API 路由：读取 PDF 文件内容
app.post('/api/fetch-pdf', async (req, res) => {
  try {
    const { url } = req.body;
    const customHeaders = HeaderUtils.extractForwardHeaders(req.headers as Record<string, string>);
    const client = new FetchClient(config, customHeaders);
    
    const response = await client.fetch(url);
    
    // 提取文本内容
    const textContent = response.content
      .filter(item => item.type === 'text')
      .map(item => item.text)
      .join('\n');
    
    res.json({
      title: response.title,
      content: textContent,
      status: response.status_code === 0 ? 'success' : 'failed'
    });
  } catch (error) {
    console.error('Error fetching PDF:', error);
    res.status(500).json({ error: 'Failed to fetch PDF content' });
  }
});

// API 路由：保存目录配置
app.post('/api/save-config', async (req, res) => {
  try {
    const { config } = req.body;
    // 这里可以保存到数据库或文件系统
    // 目前返回成功响应
    res.json({ success: true, message: 'Configuration saved successfully' });
  } catch (error) {
    console.error('Error saving config:', error);
    res.status(500).json({ error: 'Failed to save configuration' });
  }
});

// API 路由：获取目录配置
app.get('/api/get-config', async (req, res) => {
  try {
    // 这里可以从数据库或文件系统读取配置
    // 目前返回默认配置
    res.json({
      financeCategories: [
        { id: 'voucher', name: '会计凭证', enabled: true },
        { id: 'ledger', name: '会计账簿', enabled: true },
        { id: 'report', name: '财务报表', enabled: true },
        { id: 'other', name: '其他会计资料', enabled: true }
      ],
      years: ['2026', '2025', '2024'],
      fonds: [
        { id: 'fonds-1', name: '第一全宗（华北集团总部）' },
        { id: 'fonds-2', name: '第二全宗（南方智造分公司）' }
      ],
      projects: [
        { id: 'project-1', name: '华北数据中心建设项目' },
        { id: 'project-2', name: 'AI平台研发三期' }
      ]
    });
  } catch (error) {
    console.error('Error getting config:', error);
    res.status(500).json({ error: 'Failed to get configuration' });
  }
});

const PORT = process.env.API_PORT || 3001;
app.listen(PORT, () => {
  console.log(`API server running on port ${PORT}`);
});