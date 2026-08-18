-- ════════════════════════════════════════════════════════════════════
-- V5 集成接口采集 v2（2026-08-16）
-- 统一四类会计档案推送契约（凭证/账簿/报表/其他）+ 去向路由
-- + 推送全链路日志 + 收集台账 + 接入应用默认去向
-- 字段映射配置存 ams_config（key=fieldmap.<sourceSystem>），不建表
-- ════════════════════════════════════════════════════════════════════

-- 推送批次：会计期间 / 四大类 / 去向
ALTER TABLE ams.ams_open_push ADD COLUMN IF NOT EXISTS period text;
ALTER TABLE ams.ams_open_push ADD COLUMN IF NOT EXISTS category text;
ALTER TABLE ams.ams_open_push ADD COLUMN IF NOT EXISTS destination text;

-- 推送明细：类别（voucher|ledger|report|other）
ALTER TABLE ams.ams_open_push_item ADD COLUMN IF NOT EXISTS category text;

-- 接入应用：默认去向（auto-archive|to-volume|to-check|to-review）
ALTER TABLE ams.ams_open_app ADD COLUMN IF NOT EXISTS default_destination text NOT NULL DEFAULT 'to-volume';

-- 推送/采集全链路日志（受理→校验→映射→建件→四性→去向，每步一行）
CREATE TABLE ams.ams_push_log (
  id         bigserial PRIMARY KEY,
  batch_no   text NOT NULL DEFAULT '',     -- 批次号（推送批次/抓取批次）
  level      text NOT NULL DEFAULT 'info', -- info | warn | error
  step       text NOT NULL,                -- auth|accept|validate|map|create|fourchecks|route|group|receipt|simulate
  message    text NOT NULL,
  detail     text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_push_log_batch ON ams.ams_push_log (batch_no, id);
CREATE INDEX idx_push_log_created ON ams.ams_push_log (created_at DESC);

-- 收集台账：抓取/推送的每条入池记录统一登记（支撑「送核对工作台」去向与收集池待核对列表）
CREATE TABLE ams.ams_collect_item (
  id             bigserial PRIMARY KEY,
  record_node_id text,                     -- Alfresco finance:record 节点
  fonds_code     text NOT NULL DEFAULT 'Z001',
  source_type    text NOT NULL,            -- open-push | yonyou-pull | simulate
  batch_no       text,
  category       text,                     -- voucher | ledger | report | other
  destination    text NOT NULL,            -- auto-archive | to-volume | to-check | to-review
  check_status   text NOT NULL DEFAULT 'na', -- na | pending(待核对) | passed(核对通过)
  external_id    text,
  voucher_no     text,
  archive_type   text,
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_collect_item_dest ON ams.ams_collect_item (destination, check_status);
CREATE INDEX idx_collect_item_node ON ams.ams_collect_item (record_node_id);
