-- ────────────────────────────────────────────────────────────────
-- V7: 库房实体化（档案库房配置，2026-08-18）
--
-- 库房(room) 由「架表隐式派生」升级为独立实体表：
--   增删库房/重命名有明确语义；库房号/架号创建后不可改（被架位引用），名称可改。
-- 联动约束：
--   fk_rack_room     架必须属于既有库房（删库房须先删空架，应用层同步校验）
--   fk_position_rack 架位必须落在既有架（删架须空，应用层+DB 双保险）
-- ────────────────────────────────────────────────────────────────

CREATE TABLE ams.ams_storage_room (
  room      text PRIMARY KEY,              -- 库房号，如 01（创建后不可改）
  room_name text NOT NULL,                 -- 库房名，如 第一库房（可改）
  sort      int  NOT NULL DEFAULT 0
);

-- 既有架表中的隐式库房回填为实体
INSERT INTO ams.ams_storage_room (room, room_name, sort)
  SELECT room, MAX(room_name), MIN(sort) FROM ams.ams_storage_rack GROUP BY room;

ALTER TABLE ams.ams_storage_rack
  ADD CONSTRAINT fk_rack_room FOREIGN KEY (room) REFERENCES ams.ams_storage_room (room);

ALTER TABLE ams.ams_box_position
  ADD CONSTRAINT fk_position_rack FOREIGN KEY (room, rack)
  REFERENCES ams.ams_storage_rack (room, rack);
