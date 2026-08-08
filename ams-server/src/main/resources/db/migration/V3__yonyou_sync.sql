-- ════════════════════════════════════════════════════════════════════
-- V3 用友BIP集成：同步批次 + 同步明细（2026-08-08）
-- 依据：《用友BIP集成设计-2026-08-08.md》§六
-- ════════════════════════════════════════════════════════════════════

-- 同步批次：一次手动/自动同步一行
CREATE TABLE ams.ams_sync_batch (
  id             bigserial PRIMARY KEY,
  batch_no       text NOT NULL UNIQUE,          -- SYNC-yyyymmdd-NNN
  source_system  text NOT NULL DEFAULT 'yonyou-bip',
  period         text NOT NULL,                 -- 会计期间 yyyy-MM
  trigger_type   text NOT NULL,                 -- manual | auto
  status         text NOT NULL DEFAULT 'running', -- running | success | partial | failed
  total_count    int  NOT NULL DEFAULT 0,       -- 凭证总数（远端 recordCount）
  success_count  int  NOT NULL DEFAULT 0,
  skip_count     int  NOT NULL DEFAULT 0,       -- 幂等跳过（已归档过）
  fail_count     int  NOT NULL DEFAULT 0,
  report_count   int  NOT NULL DEFAULT 0,       -- 报表归档数
  volume_node_id text,                          -- 自动组卷生成的案卷节点
  message        text,
  operator       text NOT NULL DEFAULT 'scheduler', -- 触发人 userId / scheduler
  started_at     timestamptz NOT NULL DEFAULT now(),
  finished_at    timestamptz
);
CREATE INDEX idx_sync_batch_period  ON ams.ams_sync_batch (period);
CREATE INDEX idx_sync_batch_started ON ams.ams_sync_batch (started_at DESC);

-- 同步明细：一张凭证/一份报表一行；成功行部分唯一索引兜底幂等
CREATE TABLE ams.ams_sync_item (
  id             bigserial PRIMARY KEY,
  batch_id       bigint NOT NULL REFERENCES ams.ams_sync_batch (id) ON DELETE CASCADE,
  item_type      text NOT NULL,                 -- voucher | report
  external_id    text NOT NULL,                 -- 用友 voucherId / 报表逻辑id
  voucher_no     text,                          -- 凭证字号 转-1
  summary        text,                          -- 摘要
  amount         numeric(18,2),                 -- 借方合计
  status         text NOT NULL,                 -- success | skipped | failed
  record_node_id text,                          -- 落档 finance:record 节点 id
  archive_code   text,                          -- 件级档号（PEND 占位或正式）
  error          text,
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_sync_item_batch ON ams.ams_sync_item (batch_id);
-- 幂等兜底：同一外部单据只允许成功入档一次（重跑/重复期间均跳过）
CREATE UNIQUE INDEX ux_sync_item_success
  ON ams.ams_sync_item (item_type, external_id) WHERE status = 'success';
