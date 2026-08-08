// Axios 全局实例封装
import axios from 'axios';

const http = axios.create({
  baseURL: '',
  timeout: 30000,
  headers: { 'Content-Type': 'application/json;charset=UTF-8' },
});

// 请求拦截器
http.interceptors.request.use(
  (config) => config,
  (error) => Promise.reject(error),
);

// 响应拦截器
http.interceptors.response.use(
  (response) => response,
  (error) => {
    const message = error.response?.data?.error?.briefSummary
      || error.response?.data?.message
      || error.message;
    console.error('[API Error]', message);
    return Promise.reject(new Error(message));
  },
);

export default http;
