# API 对接指南 — 会计档案管理系统

> 编写日期：2026-06-14
> 本文件记录所有前端 Store 的业务逻辑、Mock 数据、需要的后端 API 端点。
> 接入后端时按此文件逐一替换即可，不必重新梳理业务。

---

## 目录

1. [对接优先级](#1-对接优先级)
2. [Store 对接清单](#2-store-对接清单)
3. [核心业务流程](#3-核心业务流程)
4. [Mock 数据替换清单](#4-mock-数据替换清单)
5. [API 端点总表](#5-api-端点总表)

---

## 1. 对接优先级

| 优先级 | 模块 | 原因 |
|--------|------|------|
| **P0** | `archiveStore` | 所有页面依赖档案记录数据，是最核心的数据源 |
| **P0** | `volumeStore` | 组卷工作台的核心，涉及 CRUD + 档号生成 |
| **P1** | `authStore` | 登录认证，所有接口的前置条件 |
| **P1** | `voucherFilesStore` | 文件上传存储，需要对接 Alfresco CMIS |
| **P2** | `borrowStore` | 借阅流程，涉及审批流转 |
| **P2** | `workflowStore` | 工作流引擎，涉及审批工单 |
| **P3** | `cleanStore` | 数据清洗，涉及后端清洗服务 |
| **P3** | `wfDesignerStore` | 工作流设计器，流程定义持久化 |
| **P4** | 纯配置页面 | 全宗/目录/保管期限/档号规则等配置类页面 |

---

## 2. Store 对接清单

### 2.1 archiveStore — 档案记录（P0）

**文件：** `src/stores/archiveStore.ts`

**核心数据：**

| 字段 | 类型 | Mock | 后端接口 |
|------|------|------|----------|
| `records` | `ArchiveRecord[]` | `data.ts` → `initialRecords` | `GET /api/records` |
| `treeData` | `CategoryNode[]` | `data.ts` → `initialCategoryTree` | `GET /api/categories` |
| `fanzongs` | `Fonds[]` | 硬编码 3 条 | `GET /api/fonds` |
| `fanzongCategories` | `Record<string, CategoryConfigItem[]>` | 空 | `GET /api/fonds/{code}/categories` |

**需要替换的 Mock：**

```typescript
// data.ts — 替换为 API 调用
export const initialRecords: ArchiveRecord[] = []; // → GET /api/records
export const initialCategoryTree: CategoryNode[] = []; // → GET /api/categories
```

**业务逻辑：**
- `filteredRecords` 根据 `currentFanzongCode` + `selectedNode` + `searchQuery` 实时计算
- 选择 Record 行时 `toggleRowSelect` 维护 `selectedRecordIds`（Set）
- 详情抽屉 `openDrawer(record)` → `closeDrawer()` 控制查看详情

**接口设计建议：**
```
GET  /api/records?fonds={code}&category={id}&search={q}&page={n}&size={m}
GET  /api/records/{id}              → 单条详情
POST /api/records                   → 新增（凭证上传/推送）
DELETE /api/records/{id}            → 删除
DELETE /api/records/batch           → 批量删除 body: { ids: string[] }
GET  /api/categories?fonds={code}   → 分类树
GET  /api/fonds                     → 全宗列表
```

---

### 2.2 volumeStore — 案卷管理（P0）

**文件：** `src/stores/volumeStore.ts`

**核心数据：**

| 字段 | 类型 | Mock | 后端接口 |
|------|------|------|----------|
| `volumes` | `Volume[]` | 初始空（从0开始） | `GET /api/volumes` |
| `volumeItems` | `Record<string, VolumeItem[]>` | 初始空 | `GET /api/volumes/{id}/items` |
| `recommendations` | `VolumeRecommendation[]` | 动态计算 | 前端计算无需接口 |
| `volumeSerialCounters` | `Record<string, number>` | 空 | `GET /api/serials/volume` |
| `itemSerialCounters` | `Record<string, number>` | 空 | `GET /api/serials/item` |
| `activeCodeRule` | `ArchiveCodeRule` | `defaultArchiveCodeRule` | `GET /api/code-rules/active` |

**需要对接的操作：**

| Action | 说明 | 接口 |
|--------|------|------|
| `createVolume` | 创建案卷草稿 | `POST /api/volumes` |
| `updateVolume` | 更新案卷信息 | `PUT /api/volumes/{id}` |
| `deleteVolume` | 删除草稿案卷 | `DELETE /api/volumes/{id}` |
| `addItemsToVolume` | 添加条目到案卷 | `POST /api/volumes/{id}/items` |
| `removeItemFromVolume` | 从案卷移除条目 | `DELETE /api/volumes/{id}/items/{recordId}` |
| `reorderItems` | 卷内条目排序 | `PUT /api/volumes/{id}/items/reorder` |
| `confirmVolume` | 确认组卷（赋号） | `POST /api/volumes/{id}/confirm` |
| `transferVolume` | 移交保管 | `POST /api/volumes/{id}/transfer` |
| `generateVolumeCode` | 生成卷号 | `GET /api/code-rules/generate-volume?year=&type=&retention=` |
| `generateItemCode` | 生成件号 | `GET /api/code-rules/generate-item?volumeId=` |
| `batchAssignItemCodes` | 批量赋件号 | `POST /api/volumes/{id}/assign-item-codes` |

**档号生成逻辑（DA/T 13-2022）：**
```
卷级格式: [全宗号]-[类别号]-[年度]-[保管期限代码]-[卷号]
件级格式: [全宗号]-[类别号]-[年度]-[保管期限代码]-[卷号]-[件号]
例: Z001-01-2026-D30-0005-0020
```
当前为前端纯计算，对接后建议后端统一生成（防止并发重复）。

**智能组卷逻辑（`generateRecommendations`）：**
1. 从 `volumeGroupingStore` 读取用户配置
2. 按配置维度分组（年度/类别/期限/部门）
3. 按配置排序方式排序（月份/凭证号/金额）
4. 按 `maxItemsPerVolume` 拆卷
5. 生成 `VolumeRecommendation[]`，用户接受后调 `createVolume`

⚠️ 此逻辑在前端完成，不需要后端接口，但组卷推荐结果可考虑由后端 AI 服务提供。

---

### 2.3 voucherFilesStore — 凭证文件管理（P1）

**文件：** `src/stores/voucherFilesStore.ts`

**核心数据：**

| 字段 | 类型 | 存储 | 后端接口 |
|------|------|------|----------|
| `files` | `VoucherFile[]` | localStorage (persist) | `GET /api/files` |
| `categories` | `VoucherCategory[]` | localStorage (persist) | `GET /api/file-categories` |

**当前状态：** 文件内容以 base64 存 localStorage，纯前端方案。
**对接方案：** 替换为 Alfresco CMIS 或文件服务。

```typescript
// 当前：读取 FileReader → base64 → localStorage
// 对接后：multipart upload → 服务端返回 fileUrl/fileId
```

**需要的接口：**
```
POST   /api/files/upload              → multipart 文件上传，返回 { id, url, name, size }
GET    /api/files?category={id}&q=    → 文件列表
DELETE /api/files/{id}                → 删除文件
DELETE /api/files/batch               → 批量删除
GET    /api/files/{id}/download       → 下载/预览
POST   /api/file-categories           → 创建分类
PUT    /api/file-categories/{id}      → 重命名分类
DELETE /api/file-categories/{id}      → 删除分类（递归删除子分类）
PUT    /api/files/move-category       → 批量移动文件到分类 body: { fileIds, categoryId }
```

**推送组卷流程（`handlePushToWorkspace`）：**
```
VoucherManagerPage:
  勾选文件 → 点击「推送到组卷工作台」
    → 创建 ArchiveRecord[]（取文件名/大小等信息）
    → 写入 archiveStore.records
    → 删除 voucherFilesStore 中已推送的文件
    → setActiveMainMenu('volume-workspace') 跳转
```

---

### 2.4 volumeGroupingStore — 组卷配置（纯前端）

**文件：** `src/stores/volumeGroupingStore.ts`

**状态：** 纯前端配置，`persist` 到 localStorage，**无需后端接口**。

```typescript
interface VolumeGroupingConfig {
  groupByYear: boolean;        // 按年度分组
  groupByArchiveType: boolean; // 按档案类别分组
  groupByRetention: boolean;   // 按保管期限分组
  groupByDepartment: boolean;  // 按部门分组（预留）
  maxItemsPerVolume: number;   // 每卷最多件数（默认50）
  sortField: 'month' | 'voucherNo' | 'amount';  // 排序方式
}
```

---

### 2.5 metadataDisplayStore — 元数据显示配置（纯前端）

**文件：** `src/stores/metadataDisplayStore.ts`

**状态：** 纯前端配置，`persist` 到 localStorage，**无需后端接口**。

在详情页展示时调用：
```typescript
const visibleIds = useMetadataDisplayStore.getState().getVisibleIds();
// visibleIds 按用户配置的顺序返回可见字段的 ID 列表
```

---

### 2.6 authStore — 登录认证（P1）

**文件：** `src/stores/authStore.ts`

**当前：** 简单的 `login(username)` / `logout()` 设置本地状态，无真实认证。

**对接接口：**
```
POST /api/auth/login    body: { username, password }    → { token, user }
POST /api/auth/logout   header: Authorization: Bearer {token}
GET  /api/auth/me       header: Authorization: Bearer {token}    → 当前用户信息
```

---

### 2.7 borrowStore — 借阅管理（P2）

**文件：** `src/stores/borrowStore.ts`

**Mock 数据：** `borrowListState` 4 条硬编码、`returnTableData` 5 条、`specialOrders` 3 条、`borrowOrderData` 5 条

**接口：**
```
GET  /api/borrows?status={}&page={}     → 借阅列表
POST /api/borrows                       → 发起借阅
PUT  /api/borrows/{id}/approve          → 审批通过
PUT  /api/borrows/{id}/reject           → 审批拒绝
POST /api/returns                       → 归还登记
GET  /api/returns?status={}             → 归还列表
GET  /api/special-orders                → 特殊工单
```

---

### 2.8 workflowStore — 工作流引擎（P2）

**文件：** `src/stores/workflowStore.ts`

**Mock 数据：** `rcvTableData` 2 条、`wfTableData` 2 条

**接口：**
```
GET /api/workflows/tasks?status={}       → 待办工单列表
GET /api/workflows/receive-ledger        → 接收台账
PUT /api/workflows/tasks/{id}/approve    → 审批
PUT /api/workflows/tasks/{id}/reject     → 驳回
```

---

### 2.9 cleanStore — 数据清洗（P3）

**文件：** `src/stores/cleanStore.ts`

**Mock 数据：** `cleanTableData` 4 条

**接口：**
```
POST /api/clean/format        → 格式化清洗
POST /api/clean/segment       → 分段插入
POST /api/clean/insert-number → 插号操作
GET  /api/clean/results       → 清洗结果列表
```

---

### 2.10 wfDesignerStore — 工作流设计器（P3）

**文件：** `src/stores/wfDesignerStore.ts`

**Mock 数据：** 2 个内置模板（借阅审批/归还核验）

**接口：**
```
GET    /api/workflow-definitions              → 流程定义列表
POST   /api/workflow-definitions              → 创建定义
PUT    /api/workflow-definitions/{id}         → 更新定义（含完整画布数据）
DELETE /api/workflow-definitions/{id}         → 删除定义
PUT    /api/workflow-definitions/{id}/deploy  → 部署发布
```

---

## 3. 核心业务流程

### 3.1 凭证管理区 → 组卷工作台 流转

```
VoucherManagerPage                    VolumeWorkspacePage
┌─────────────────┐                  ┌──────────────────────┐
│  上传电子文件     │                  │  待分配条目池          │
│  (存 localStorage) │                  │  (archiveStore.records)│
│      ↓           │                  │      ↑               │
│  自建分类整理     │  ──推送──→       │  新记录出现            │
│      ↓           │                  │      ↓               │
│  勾选 → 推送      │                  │  勾选 → 加入案卷        │
│                  │                  │      ↓               │
│                  │                  │  新建案卷/智能组卷      │
│                  │                  │      ↓               │
│                  │                  │  四性检测 → 确认组卷    │
│                  │                  │      ↓               │
│                  │                  │  赋号 → 移交保管       │
└─────────────────┘                  └──────────────────────┘
```

**关键对接点：**
- 推送时：`VoucherFile[]` → `ArchiveRecord[]` → `archiveStore.add()`
- 组卷时：`ArchiveRecord[]` → `Volume` + `VolumeItem[]` → 产生档号
- 移交后：`Volume.status = 'transferred'`

### 3.2 智能组卷流程

```
组卷设置                        组卷工作台
(volumeGroupingStore)            (volumeStore)
┌─────────────────┐             ┌──────────────────────┐
│ 配置分组维度      │             │  「智能组卷」按钮       │
│ 配置每卷上限      │ ──读取──→   │      ↓               │
│ 配置排序方式      │             │  generateRecommendations│
└─────────────────┘             │  按配置分组/排序/拆卷  │
                                 │      ↓               │
                                 │  展示推荐面板          │
                                 │  用户点「接受」        │
                                 │      ↓               │
                                 │  createVolume +      │
                                 │  addItemsToVolume     │
                                 └──────────────────────┘
```

### 3.3 档案记录详情元数据显示

```
AccountingMetadataPage     档案详情页（视图页面）
┌──────────────────┐      ┌──────────────────────┐
│  配置可见字段+顺序   │      │                        │
│  (metadataDisplay  │      │  调用 getVisibleIds()   │
│   Store)           │ ──→  │      ↓               │
│                   │      │  按配置展示字段         │
│  持久化 localStorage│      │  M6  全宗号: Z001      │
└──────────────────┘      │  M8  类别号: 01         │
                          │  M13 档号: Z001-...    │
                          │  ...（按配置顺序）       │
                          └──────────────────────┘
```

---

## 4. Mock 数据替换清单

| 文件 | Mock 数据 | 替换为 |
|------|----------|--------|
| `data.ts` | `initialRecords` (7条) | `GET /api/records` |
| `data.ts` | `initialCategoryTree` | `GET /api/categories` |
| `archiveStore.ts` | `fanzongs` 硬编码3条 | `GET /api/fonds` |
| `borrowStore.ts` | `borrowListState` 4条 | `GET /api/borrows` |
| `borrowStore.ts` | `returnTableData` 5条 | `GET /api/returns` |
| `borrowStore.ts` | `specialOrders` 3条 | `GET /api/special-orders` |
| `borrowStore.ts` | `borrowOrderData` 5条 | `GET /api/borrows/orders` |
| `workflowStore.ts` | `rcvTableData` 2条 | `GET /api/workflows/receive-ledger` |
| `workflowStore.ts` | `wfTableData` 2条 | `GET /api/workflows/tasks` |
| `cleanStore.ts` | `cleanTableData` 4条 | `GET /api/clean/results` |
| `wfDesignerStore.ts` | 2个内置模板 | `GET /api/workflow-definitions` |
| `volumeStore.ts` | 档号流水计数器 | `GET /api/serials/volume?key=...` |
| `volumeStore.ts` | `defaultArchiveCodeRule` | `GET /api/code-rules/active` |

---

## 5. API 端点总表

### 认证
| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/auth/login` | 登录 |
| POST | `/api/auth/logout` | 登出 |
| GET | `/api/auth/me` | 当前用户 |

### 档案记录
| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/records` | 记录列表（支持筛选/搜索/分页） |
| GET | `/api/records/{id}` | 记录详情 |
| POST | `/api/records` | 新增记录 |
| DELETE | `/api/records/{id}` | 删除记录 |
| DELETE | `/api/records/batch` | 批量删除 |
| GET | `/api/categories` | 分类树 |
| GET | `/api/fonds` | 全宗列表 |
| GET | `/api/fonds/{code}/categories` | 全宗下的分类配置 |

### 案卷
| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/volumes` | 案卷列表 |
| POST | `/api/volumes` | 创建案卷 |
| PUT | `/api/volumes/{id}` | 更新案卷 |
| DELETE | `/api/volumes/{id}` | 删除案卷 |
| GET | `/api/volumes/{id}/items` | 卷内条目 |
| POST | `/api/volumes/{id}/items` | 添加条目 |
| DELETE | `/api/volumes/{id}/items/{recordId}` | 移除条目 |
| PUT | `/api/volumes/{id}/items/reorder` | 条目排序 |
| POST | `/api/volumes/{id}/confirm` | 确认组卷 |
| POST | `/api/volumes/{id}/transfer` | 移交保管 |
| POST | `/api/volumes/{id}/assign-item-codes` | 批量赋件号 |

### 档号/流水号
| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/code-rules/active` | 当前档号规则 |
| PUT | `/api/code-rules` | 更新档号规则 |
| GET | `/api/serials/volume?key={}` | 卷号流水 |
| GET | `/api/serials/item?key={}` | 件号流水 |

### 文件管理（凭证管理区）
| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/files/upload` | 文件上传 (multipart) |
| GET | `/api/files` | 文件列表 |
| DELETE | `/api/files/{id}` | 删除文件 |
| DELETE | `/api/files/batch` | 批量删除 |
| GET | `/api/files/{id}/download` | 下载/预览 |
| POST | `/api/file-categories` | 创建分类 |
| PUT | `/api/file-categories/{id}` | 重命名分类 |
| DELETE | `/api/file-categories/{id}` | 删除分类 |
| PUT | `/api/files/move-category` | 批量移动文件所属分类 |

### 借阅
| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/borrows` | 借阅列表 |
| POST | `/api/borrows` | 发起借阅 |
| PUT | `/api/borrows/{id}/approve` | 审批通过 |
| PUT | `/api/borrows/{id}/reject` | 审批拒绝 |
| POST | `/api/returns` | 归还登记 |
| GET | `/api/returns` | 归还列表 |
| GET | `/api/special-orders` | 特殊工单 |

### 工作流
| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/workflows/tasks` | 待办工单 |
| GET | `/api/workflows/receive-ledger` | 接收台账 |
| PUT | `/api/workflows/tasks/{id}/approve` | 审批 |
| PUT | `/api/workflows/tasks/{id}/reject` | 驳回 |
| GET | `/api/workflow-definitions` | 流程定义列表 |
| POST | `/api/workflow-definitions` | 创建流程定义 |
| PUT | `/api/workflow-definitions/{id}` | 更新流程定义 |
| DELETE | `/api/workflow-definitions/{id}` | 删除流程定义 |
| PUT | `/api/workflow-definitions/{id}/deploy` | 部署流程 |

### 数据清洗
| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/clean/results` | 清洗结果列表 |
| POST | `/api/clean/format` | 格式化清洗 |
| POST | `/api/clean/segment` | 分段插入 |
| POST | `/api/clean/insert-number` | 插号操作 |

### 四性检测
| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/checks/volume/{id}` | 对案卷运行四性检测 |
| GET | `/api/checks/volume/{id}/report` | 检测报告 |

---

## 6. 对接模式 — Store 层示例

每个 store 的 action 在对接时，按以下模式替换即可：

```typescript
// 当前：纯前端操作
addRecords: (newRecords) =>
  set((state) => ({ records: [...newRecords, ...state.records] })),

// 对接后：调 API + 更新本地状态
addRecords: async (newRecords) => {
  const res = await fetch('/api/records', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(newRecords),
  });
  if (res.ok) {
    const saved = await res.json();
    set((state) => ({ records: [...saved, ...state.records] }));
  }
},
```

> 注意：zustand 默认不支持异步 action。处理方法：
> 1. 在组件中调用 `fetch` 后调 store 的同步 setter
> 2. 或使用 zustand 中间件支持异步（如配合 react-query / swr）

---

## 附录: 前端项目结构

```
financeWeb/src/
├── stores/          ← 所有状态管理（对接重点）
│   ├── appStore.ts
│   ├── authStore.ts
│   ├── archiveStore.ts        ← P0
│   ├── volumeStore.ts         ← P0
│   ├── voucherFilesStore.ts   ← P1
│   ├── borrowStore.ts         ← P2
│   ├── workflowStore.ts       ← P2
│   ├── cleanStore.ts          ← P3
│   ├── wfDesignerStore.ts     ← P3
│   ├── viewStore.ts           ← 纯前端
│   ├── volumeGroupingStore.ts ← 纯前端
│   └── metadataDisplayStore.ts← 纯前端
│
├── pages/           ← 页面组件
│   ├── archive-arrange/       ← 档案整理（组卷工作台/凭证管理区）
│   ├── archive-config/        ← 档案配置（元数据/组卷设置/档号规则）
│   ├── archive-preserve/      ← 档案保管
│   ├── archive-rcv/           ← 档案接收
│   ├── archive-stats/         ← 档案统计
│   ├── archive-utilization/   ← 档案利用（借阅/归还/移交）
│   ├── quality/               ← 四性检测
│   ├── wf-designer/           ← 工作流设计器
│   └── system/                ← 系统管理
│
├── components/      ← 公共组件
│   └── layout/                ← 布局（Header/Sidebar/ContentArea）
│
├── types/           ← 类型定义
├── data/            ← Mock 数据（替换重点）
└── config/          ← 菜单/路由配置
```

---

## 7. 变更日志

每次功能改动后在此追加记录。

| 日期 | 模块 | 改动说明 | 涉及文件 |
|------|------|----------|----------|
| 2026-06-14 | 档案整理 | 合并三个二级菜单为单个组卷工作台，凭证上传和目录打印改为弹窗 | `menuConfig.ts`, `VoucherUploadModal.tsx`, `VolumePrintModal.tsx`, `VolumeWorkspacePage.tsx`, `ContentArea.tsx` |
| 2026-06-14 | 档案整理 | 条目池加删除（单条+批量），颜色方案从 sky 改为 blue 加深 | `VolumeWorkspacePage.tsx` |
| 2026-06-14 | 档案整理 | 智能推荐改名智能组卷，新增组卷设置页面（分组维度/上限/排序） | `VolumeWorkspacePage.tsx`, `volumeGroupingStore.ts`, `VolumeGroupingConfigPage.tsx`, `menuConfig.ts`, `PageRouter.tsx` |
| 2026-06-14 | 档案整理 | 新增凭证管理区（网盘式文件管理+自建分类+推送到组卷工作台） | `voucherFilesStore.ts`, `VoucherManagerPage.tsx`, `menuConfig.ts`, `ContentArea.tsx` |
| 2026-06-14 | 系统 | 替换左上角 Logo | `Sidebar.tsx`, `public/logo.png` |
| 2026-06-14 | 档案配置 | 新增会计档案元数据页面设置（横版卡片预览+拖拽排序+显示/隐藏） | `metadataDisplayStore.ts`, `AccountingMetadataPage.tsx` |
| 2026-06-14 | 文档 | 创建本对接指南 | `API_INTEGRATION_GUIDE.md` |
```
