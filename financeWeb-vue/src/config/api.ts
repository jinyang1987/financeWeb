// API 基础配置
export const BASE_URL = '/api/proxy/alfresco';
export const API_V1 = `${BASE_URL}/api/-default-/public/alfresco/versions/1`;
export const LEGACY_GROUPS = `${BASE_URL}/service/api/groups`;

export const AUTH = btoa('admin:admin');
export const AUTH_HEADERS = {
  Authorization: `Basic ${AUTH}`,
  'Content-Type': 'application/json;charset=UTF-8',
  'Accept-Charset': 'UTF-8',
};
