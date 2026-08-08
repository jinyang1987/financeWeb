-- ============================================================
-- 会计档案管理系统 - 目录配置表结构
-- 远期 MySQL 迁移 DDL
-- ============================================================

CREATE TABLE IF NOT EXISTS dir_archive_type (
  id          VARCHAR(32)   PRIMARY KEY,
  name        VARCHAR(50)   NOT NULL COMMENT '档案类型名称（如: 会计凭证）',
  code        VARCHAR(20)   NOT NULL COMMENT '档案类型编码（如: KP）',
  enabled     TINYINT(1)    NOT NULL DEFAULT 1 COMMENT '是否启用',
  sort_order  INT           NOT NULL DEFAULT 0 COMMENT '排序',
  created_at  DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='档案类型配置';

CREATE TABLE IF NOT EXISTS dir_year (
  id          VARCHAR(32)   PRIMARY KEY,
  year        INT           NOT NULL COMMENT '年份',
  enabled     TINYINT(1)    NOT NULL DEFAULT 1 COMMENT '是否启用',
  sort_order  INT           NOT NULL DEFAULT 0 COMMENT '排序',
  created_at  DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='年份配置';

CREATE TABLE IF NOT EXISTS dir_project (
  id          VARCHAR(32)   PRIMARY KEY,
  name        VARCHAR(100)  NOT NULL COMMENT '项目名称',
  code        VARCHAR(20)   NOT NULL COMMENT '项目编码',
  enabled     TINYINT(1)    NOT NULL DEFAULT 1 COMMENT '是否启用',
  sort_order  INT           NOT NULL DEFAULT 0 COMMENT '排序',
  created_at  DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='项目配置';

CREATE TABLE IF NOT EXISTS dir_selected_item (
  id          VARCHAR(64)   PRIMARY KEY,
  item_name   VARCHAR(100)  NOT NULL COMMENT '档案勾选项名称',
  enabled     TINYINT(1)    NOT NULL DEFAULT 1 COMMENT '是否勾选',
  created_at  DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='档案分类勾选项';

CREATE TABLE IF NOT EXISTS dir_view_dimension (
  id          VARCHAR(32)   PRIMARY KEY,
  name        VARCHAR(50)   NOT NULL COMMENT '视图维度名称',
  logic       VARCHAR(200)  NOT NULL COMMENT '维度逻辑说明',
  enabled     TINYINT(1)    NOT NULL DEFAULT 1 COMMENT '是否启用',
  sort_order  INT           NOT NULL DEFAULT 0 COMMENT '排序',
  created_at  DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='视图维度配置';

-- 初始数据
INSERT INTO dir_archive_type (id, name, code, enabled, sort_order) VALUES
('type-1', '会计凭证', 'KP', 1, 1),
('type-2', '会计账簿', 'KB', 1, 2),
('type-3', '财务报表', 'FB', 1, 3),
('type-4', '其他会计资料', 'QT', 1, 4);

INSERT INTO dir_year (id, year, enabled, sort_order) VALUES
('year-2026', 2026, 1, 1),
('year-2025', 2025, 1, 2);

INSERT INTO dir_project (id, name, code, enabled, sort_order) VALUES
('project-1', '华北数据中心建设项目', 'P1', 1, 1),
('project-2', 'AI平台研发三期', 'P2', 1, 2);

INSERT INTO dir_view_dimension (id, name, logic, enabled, sort_order) VALUES
('finance-category', '财务大类视图', '按会计档案分类，再按时间维度细化', 1, 1),
('project-panorama', '项目全景视图', '以业务项目为核心，聚合该项目所有相关档案', 1, 2),
('time-timeline', '时间主线视图', '按时间年份为一级目录，再按档案类型分类', 1, 3);
