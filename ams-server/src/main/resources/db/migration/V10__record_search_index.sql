-- ════════════════════════════════════════════════════════════════════
-- V10 件级全文检索读模型（2026-08-18）
-- PG read-model + pg_trgm：服务端真分页/任意子串全文（含 ocrText 正文），
-- 退役「全量 ACS 拉取 + 内存过滤」旧链路（门户前端不再全量驻留）。
--
-- 可靠三保险：
--   ① 单写入口主路径：record 域所有变更走 ams-server，成功后发 RecordsChangedEvent
--      → RecordIndexService 同步投影（refresh/remove/refreshVolume）；
--   ② 对账兜底：POST /records/index/rebuild 全量重建（启动空表自建 + 手动/定期对账）；
--   ③ 降级兜底：索引空时 GET /records 旧 gather 路径继续可用（不报错）。
--
-- 行级权限（三维授权）下推 SQL：security_level_int ≤ 有效密级 + 部门范围/创建人谓词，
-- 与 PermissionService.recordRowFilter 同语义（内存侧仍双重保险再过滤一次）。
-- ════════════════════════════════════════════════════════════════════

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE TABLE IF NOT EXISTS ams.ams_record_index (
  node_id            varchar(64)  PRIMARY KEY,
  fonds_code         varchar(32)  NOT NULL DEFAULT '',
  archive_type       varchar(64)  NOT NULL DEFAULT '',
  year               int,
  month              int,
  record_status      varchar(32)  NOT NULL DEFAULT '',
  security_level     varchar(16)  NOT NULL DEFAULT '',
  security_level_int int          NOT NULL DEFAULT 0,
  department         varchar(128) NOT NULL DEFAULT '',
  created_by         varchar(64)  NOT NULL DEFAULT '',
  created_at         timestamptz,
  amount             numeric(18,2),
  search_text        text         NOT NULL DEFAULT '',
  view_json          jsonb        NOT NULL,
  updated_at         timestamptz  NOT NULL DEFAULT now()
);

-- 全文：任意子串（中文免分词，trgm 三字符组）覆盖元数据全字段 + ocrText 正文
CREATE INDEX IF NOT EXISTS idx_recidx_trgm ON ams.ams_record_index
  USING gin (search_text gin_trgm_ops);
-- 列表/分面：全宗 + 年度 + 类别
CREATE INDEX IF NOT EXISTS idx_recidx_list ON ams.ams_record_index (fonds_code, year, archive_type);
-- 默认排序（创建时间倒序，与旧列表口径一致）
CREATE INDEX IF NOT EXISTS idx_recidx_time ON ams.ams_record_index (created_at DESC);

COMMENT ON TABLE ams.ams_record_index IS
  '件级全文检索读模型（V10）：投影自 ACS finance:record 节点；'
  '维护=RecordsChangedEvent 增量 + rebuild 对账；view_json 为完整 RecordView（含卷盒归属）。';
