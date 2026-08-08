-- ════════════════════════════════════════════════════════════════════
-- ams-server 业务库 V1 初始化（会计档案管理系统）
-- schema: ams（与 Alfresco 同 PG 实例，独立 schema，严禁改 Alfresco 自有表）
-- 依据：《Alfresco集成总体方案-2026-07-18.md》§六
-- ════════════════════════════════════════════════════════════════════

-- ────────────────────────────────
-- 1. 人员扩展（Alfresco People 为主，本表补工号/岗位/主管）
-- ────────────────────────────────
CREATE TABLE ams.ams_user_ext (
  user_id        text PRIMARY KEY,              -- = Alfresco people.id
  emp_no         text NOT NULL,                 -- 工号
  position       text,                          -- 岗位
  dept_path      text,                          -- 部门全路径（冗余展示）
  supervisor_id  text,                          -- 直属主管（逾期抄送）
  avatar_color   text,
  updated_at     timestamptz NOT NULL DEFAULT now()
);

-- ────────────────────────────────
-- 2. 档号流水（核心：原子单调递增，解决重号）
-- ────────────────────────────────
CREATE TABLE ams.ams_code_serial (
  id             bigserial PRIMARY KEY,
  scope          text NOT NULL,                 -- 'BOX' | 'VOLUME' | 'ITEM'
  fonds_code     text NOT NULL,                 -- Z001
  type_code      text NOT NULL,                 -- KP/KB/FB/QT
  year           int  NOT NULL,
  box_no         text,                          -- ITEM 段的父盒作用域
  next_value     int  NOT NULL DEFAULT 1,
  version        bigint NOT NULL DEFAULT 0,     -- 乐观锁
  CONSTRAINT uq_code_serial UNIQUE (scope, fonds_code, type_code, year, box_no)
);

-- ────────────────────────────────
-- 3-6. 借阅全链路（主单/明细/审批/履约）
-- ────────────────────────────────
CREATE TABLE ams.ams_borrow_order (
  id              uuid PRIMARY KEY,
  order_no        text UNIQUE NOT NULL,         -- JY-YYYY-NNNN
  applicant_id    text NOT NULL,                -- → ams_user_ext.user_id
  reason_type     text NOT NULL,
  reason_detail   text,
  start_date      date NOT NULL,
  end_date        date NOT NULL,
  status          text NOT NULL,                -- approving/rejected/fulfilling/active/returning/completed/terminated
  current_step    int  NOT NULL DEFAULT 0,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_borrow_order_applicant ON ams.ams_borrow_order (applicant_id);
CREATE INDEX idx_borrow_order_status    ON ams.ams_borrow_order (status);

CREATE TABLE ams.ams_borrow_item (
  id              uuid PRIMARY KEY,
  order_id        uuid NOT NULL REFERENCES ams.ams_borrow_order (id) ON DELETE CASCADE,
  record_node_id  text NOT NULL,                -- Alfresco finance:record 节点 id
  volume_node_id  text NOT NULL,                -- finance:volume 节点 id
  title           text NOT NULL,
  type_code       text NOT NULL,                -- KP/KB/FB/QT
  media_type      text NOT NULL,                -- electronic/paper/mixed
  security_level  text NOT NULL,
  stock_status    text NOT NULL,                -- 提交时快照 in_stock/lent_out
  perms           text[] NOT NULL DEFAULT '{}', -- view/download/print
  physical_mode   text NOT NULL DEFAULT 'none'  -- none/original/copy
);
CREATE INDEX idx_borrow_item_order ON ams.ams_borrow_item (order_id);
CREATE INDEX idx_borrow_item_volume ON ams.ams_borrow_item (volume_node_id);

CREATE TABLE ams.ams_approval_step (
  id              uuid PRIMARY KEY,
  order_id        uuid NOT NULL REFERENCES ams.ams_borrow_order (id) ON DELETE CASCADE,
  seq             int  NOT NULL,
  role            text NOT NULL,                -- dept_manager/cfo/hrvp/archivist
  assignee_id     text,
  status          text NOT NULL DEFAULT 'pending',  -- pending/approved/rejected
  acted_by        text,
  acted_at        timestamptz,
  comment         text,
  CONSTRAINT uq_approval_step UNIQUE (order_id, seq)
);

CREATE TABLE ams.ams_fulfillment (
  id              uuid PRIMARY KEY,
  order_id        uuid NOT NULL REFERENCES ams.ams_borrow_order (id) ON DELETE CASCADE,
  type            text NOT NULL,                -- electronic/physical
  status          text NOT NULL,                -- pending/granted/lent/queued/returned/auto_revoked/overdue/terminated
  volume_node_id  text NOT NULL,
  record_node_ids text[] NOT NULL DEFAULT '{}',
  physical_mode   text,                         -- original/copy
  start_date      date NOT NULL,
  end_date        date NOT NULL,
  granted_at      timestamptz,
  lent_at         timestamptz,
  returned_at     timestamptz,
  operator_id     text
);
CREATE INDEX idx_fulfill_order  ON ams.ams_fulfillment (order_id);
CREATE INDEX idx_fulfill_volume ON ams.ams_fulfillment (volume_node_id, status);

-- ────────────────────────────────
-- 7. 操作日志（append-only + 哈希链，等保不可篡改）
-- ────────────────────────────────
CREATE TABLE ams.ams_operation_log (
  id           bigserial PRIMARY KEY,
  ts           timestamptz NOT NULL DEFAULT now(),
  actor_id     text NOT NULL,
  actor_name   text,
  actor_role   text,
  action       text NOT NULL,               -- 检索/查看/下载/打印/申请/审批/出库/归还/中止...
  target_type  text,
  target_id    text,
  target_label text,
  order_id     uuid,
  detail       text,
  ip           inet,
  prev_hash    text,                        -- 上一条日志的 hash（哈希链）
  hash         text                         -- sha256(prev_hash + 行内容)
);
CREATE INDEX idx_oplog_ts     ON ams.ams_operation_log (ts DESC);
CREATE INDEX idx_oplog_actor  ON ams.ams_operation_log (actor_id);
CREATE INDEX idx_oplog_action ON ams.ams_operation_log (action);

-- 防篡改触发器：日志仅允许 INSERT
CREATE OR REPLACE FUNCTION ams.operation_log_immutable() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'ams_operation_log 为仅追加表，禁止修改/删除（等保不可篡改要求）';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_operation_log_no_update
  BEFORE UPDATE OR DELETE ON ams.ams_operation_log
  FOR EACH ROW EXECUTE FUNCTION ams.operation_log_immutable();

-- ────────────────────────────────
-- 8. 四性检测报告
-- ────────────────────────────────
CREATE TABLE ams.ams_inspection_report (
  id           uuid PRIMARY KEY,
  target_node  text NOT NULL,               -- Alfresco 节点 id
  target_kind  text NOT NULL,               -- record/volume/package
  phase        text NOT NULL,               -- pre-archive/archiving/transfer/long-term
  real         boolean,
  complete     boolean,
  usable       boolean,
  safe         boolean,
  detail_json  jsonb NOT NULL,              -- 逐项明细（方法/时间/结论/失败原因）
  operator     text,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_inspection_target ON ams.ams_inspection_report (target_node);

-- ────────────────────────────────
-- 9. 封装包（DA/T 48）
-- ────────────────────────────────
CREATE TABLE ams.ams_package (
  id             uuid PRIMARY KEY,
  package_no     text UNIQUE NOT NULL,
  name           text NOT NULL,
  unit_kind      text NOT NULL,             -- volume/book/report-type-year/other
  volume_nodes   text[] NOT NULL,
  manifest_xml   text NOT NULL,             -- DA/T 48 封装说明 XML
  checksum       text NOT NULL,
  status         text NOT NULL,             -- created/downloaded/transferred/received
  created_at     timestamptz NOT NULL DEFAULT now(),
  transferred_at timestamptz,
  received_at    timestamptz
);

-- ────────────────────────────────
-- 10. 移交批次（pending→prepared→received 三态，修复"待处理恒空"）
-- ────────────────────────────────
CREATE TABLE ams.ams_transfer_batch (
  id            uuid PRIMARY KEY,
  transfer_no   text UNIQUE NOT NULL,
  from_dept     text,
  to_dept       text,
  from_person   text,
  to_person     text,
  volume_nodes  text[] NOT NULL,
  total_items   int,
  status        text NOT NULL,              -- pending/prepared/received
  transfer_date date,
  received_at   timestamptz
);

-- ────────────────────────────────
-- 11. 鉴定销毁
-- ────────────────────────────────
CREATE TABLE ams.ams_appraisal (
  id           uuid PRIMARY KEY,
  volume_node  text NOT NULL,
  due_date     date NOT NULL,               -- 保管期满日（retention 推算）
  status       text NOT NULL,               -- pending/reviewing/approved-destroy/retained
  decision     text,                        -- destroy/retain
  meeting_note text,
  reviewer     text,
  reviewed_at  timestamptz,
  destroyed_at timestamptz
);
CREATE INDEX idx_appraisal_due ON ams.ams_appraisal (due_date);

-- ────────────────────────────────
-- 12. 实体库房（库房→柜→架→层，三轨合一）
-- ────────────────────────────────
CREATE TABLE ams.ams_storage_node (
  id          uuid PRIMARY KEY,
  parent_id   uuid REFERENCES ams.ams_storage_node (id),
  kind        text NOT NULL,                -- room/cabinet/shelf/layer
  code        text NOT NULL,                -- 1号库房 / 柜A / 架3 / 层2
  name        text NOT NULL,
  sort        int NOT NULL DEFAULT 0,
  CONSTRAINT uq_storage_node UNIQUE (parent_id, code)
);

-- ────────────────────────────────
-- 13. 配置中心（替代全部 localStorage persist + Express JSON）
-- ────────────────────────────────
CREATE TABLE ams.ams_config (
  key         text PRIMARY KEY,
  -- directory / metadata.display / grouping.rules / code.rule / retention.table
  -- inspection.plan / watermark / cockpit.layout / role.menus / report.config / approval.routes
  value_json  jsonb NOT NULL,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  updated_by  text
);
