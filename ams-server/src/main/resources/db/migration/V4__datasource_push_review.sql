-- ════════════════════════════════════════════════════════════════════
-- V4 数据源配置 + 推送接入 + 审核记录（2026-08-09）
-- 依据：Issue#1 链路梳理（抓取/推送→审核→组卷双链路 + token 权限收敛 + 推送真实化）
-- ════════════════════════════════════════════════════════════════════

-- 接入应用（推送方 AppKey/AppSecret）
CREATE TABLE ams.ams_open_app (
  id            bigserial PRIMARY KEY,
  app_key       text NOT NULL UNIQUE,           -- 推送方 AppKey
  app_secret    text NOT NULL,                  -- 推送方 AppSecret（落库明文，前端脱敏）
  app_name      text NOT NULL,                  -- 应用名称（如 报销系统、发票平台）
  source_system text NOT NULL,                  -- 来源系统标识（erp-reimburse/invoice/bank…）
  fonds_code    text NOT NULL DEFAULT 'Z001',   -- 默认目标全宗
  status        text NOT NULL DEFAULT 'active', -- active | disabled
  remark        text,
  created_by    text,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_open_app_source ON ams.ams_open_app (source_system);

-- 推送批次（一次批量推送一行，与 ams_sync_batch 同构）
CREATE TABLE ams.ams_open_push (
  id             bigserial PRIMARY KEY,
  batch_no       text NOT NULL UNIQUE,          -- PUSH-yyyymmdd-NNN
  app_id         bigint NOT NULL REFERENCES ams.ams_open_app (id),
  fonds_code     text NOT NULL DEFAULT 'Z001',
  status         text NOT NULL DEFAULT 'accepted', -- accepted | processing | success | partial | failed
  total_count    int  NOT NULL DEFAULT 0,
  success_count  int  NOT NULL DEFAULT 0,
  fail_count     int  NOT NULL DEFAULT 0,
  message        text,
  operator       text,
  created_at     timestamptz NOT NULL DEFAULT now(),
  finished_at    timestamptz
);
CREATE INDEX idx_open_push_app ON ams.ams_open_push (app_id);
CREATE INDEX idx_open_push_created ON ams.ams_open_push (created_at DESC);

-- 推送明细：一条电子会计资料一行
CREATE TABLE ams.ams_open_push_item (
  id             bigserial PRIMARY KEY,
  push_id        bigint NOT NULL REFERENCES ams.ams_open_push (id) ON DELETE CASCADE,
  external_id    text NOT NULL,                 -- 来源系统业务单号
  source_system  text NOT NULL DEFAULT '',      -- 来源系统标识（幂等键之一）
  voucher_no     text,
  archive_type   text NOT NULL DEFAULT '记账凭证',
  summary        text,
  amount         numeric(18,2),
  record_node_id text,                          -- 落档 finance:record 节点
  archive_code   text,
  status         text NOT NULL,                 -- success | failed | skipped
  error          text,
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_open_push_item_push ON ams.ams_open_push_item (push_id);
CREATE UNIQUE INDEX ux_open_push_item_success
  ON ams.ams_open_push_item (source_system, external_id) WHERE status = 'success';

-- 审核记录（收集池→审核库→通过/驳回 全留痕）
CREATE TABLE ams.ams_review_log (
  id             bigserial PRIMARY KEY,
  record_node_id text NOT NULL,                 -- finance:record 节点
  action         text NOT NULL,                 -- enter(进审核库) | approve(通过) | reject(驳回)
  reviewer       text,                          -- 审核人 userId
  comment        text,                          -- 审核意见
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_review_log_record ON ams.ams_review_log (record_node_id, created_at DESC);

-- 数据源配置（多数据源，统一管理；与 yonyou.connection 兼容）
-- 存 ams_config（key=datasource.config），本迁移仅注释说明不建表。
-- 结构：{ "sources": [ { id, name, type, enabled, direction, config:{...} } ] }
