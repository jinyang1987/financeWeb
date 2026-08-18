-- ────────────────────────────────────────────────────────────────
-- V6: 密集架架位模型（实体库房上架，2026-08-17）
--
-- 业务背景：组卷→确认→移交归盒后，盒须「上架」定位到密集架格位才算入库保管。
-- 模型：库房(room) → 密集架(rack) → 列(column) → 层(layer) → 位(cell)，
-- 每架容量 = 列×层×位；盒与格位一一对应（uq_box_cell 数据库级占用互斥）。
-- ────────────────────────────────────────────────────────────────

-- 密集架布局（可扩展：多库房/多架，维度受 CHECK 约束）
CREATE TABLE ams.ams_storage_rack (
  id           uuid PRIMARY KEY,
  room         text NOT NULL,                -- 库房号，如 01
  room_name    text NOT NULL,                -- 库房名，如 第一库房
  rack         text NOT NULL,                -- 架号，如 A
  rack_name    text NOT NULL,                -- 架名，如 A 架
  column_count int  NOT NULL,                -- 列数（1-26）
  layer_count  int  NOT NULL,                -- 层数（1-12）
  cell_count   int  NOT NULL,                -- 每层盒位（1-40）
  sort         int  NOT NULL DEFAULT 0,
  CONSTRAINT uq_storage_rack UNIQUE (room, rack),
  CONSTRAINT ck_rack_dims CHECK (column_count BETWEEN 1 AND 26
                             AND layer_count BETWEEN 1 AND 12
                             AND cell_count BETWEEN 1 AND 40)
);

-- 盒架位（一盒一位；box_node_id = Alfresco finance:archiveBox 节点）
CREATE TABLE ams.ams_box_position (
  box_node_id text PRIMARY KEY,
  room        text NOT NULL,
  rack        text NOT NULL,
  column_no   int  NOT NULL,
  layer_no    int  NOT NULL,
  cell_no     int  NOT NULL,
  shelved_at  timestamptz NOT NULL DEFAULT now(),
  shelved_by  text NOT NULL DEFAULT '',
  CONSTRAINT uq_box_cell UNIQUE (room, rack, column_no, layer_no, cell_no)
);
CREATE INDEX idx_box_position_rack ON ams.ams_box_position (room, rack);

-- 默认库房布局：第一库房(01)，密集架 A-D（6列×6层×8位 = 288 盒/架，共 1152 格位）
INSERT INTO ams.ams_storage_rack (id, room, room_name, rack, rack_name, column_count, layer_count, cell_count, sort) VALUES
  (gen_random_uuid(), '01', '第一库房', 'A', 'A 架', 6, 6, 8, 1),
  (gen_random_uuid(), '01', '第一库房', 'B', 'B 架', 6, 6, 8, 2),
  (gen_random_uuid(), '01', '第一库房', 'C', 'C 架', 6, 6, 8, 3),
  (gen_random_uuid(), '01', '第一库房', 'D', 'D 架', 6, 6, 8, 4);
