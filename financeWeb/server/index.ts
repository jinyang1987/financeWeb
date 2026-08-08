/**
 * 后端 API 服务器
 * 提供目录配置等业务数据的持久化存储
 * 当前使用 JSON 文件存储，远期可替换为 MySQL
 */
import express from 'express';
import cors from 'cors';
import { dirConfigRouter } from './routes/directoryConfig';

const app = express();
const PORT = 3001;

// 中间件
app.use(cors());
app.use(express.json({ limit: '2mb' }));

// 路由
app.use('/api/directory-config', dirConfigRouter);

// 健康检查
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.listen(PORT, () => {
  console.log(`[API Server] 运行在 http://localhost:${PORT}`);
  console.log(`[API Server] 目录配置: http://localhost:${PORT}/api/directory-config`);
});
