-- ────────────────────────────────────────────────────────────────
-- V8: 四性检测标准检测项库（2026-08-18）
--
-- 模型对齐档案行业四性检测体系：环节(归档gd/移交yj/长期保存cq) ×
-- 四性(真实real/完整complete/可用usable/安全safe) × 检测项。
-- 每个检测项映射引擎内一个可执行检查（check_type 注册式），
-- enabled 由「四性检测配置」页维护（方案即标准库的勾选集合）。
-- ────────────────────────────────────────────────────────────────

CREATE TABLE ams.ams_inspection_item (
  code         text PRIMARY KEY,            -- GD-1-01（环节-四性-序号）
  phase        text NOT NULL,               -- gd 归档 / yj 移交 / cq 长期保存
  dimension    text NOT NULL,               -- real / complete / usable / safe
  seq          int  NOT NULL,
  name         text NOT NULL,
  standard_ref text NOT NULL DEFAULT '',    -- 标准依据
  check_type   text NOT NULL,               -- 引擎注册检查类型
  enabled      boolean NOT NULL DEFAULT true,
  sort         int  NOT NULL DEFAULT 0,
  CONSTRAINT ck_inspection_item_phase CHECK (phase IN ('gd','yj','cq')),
  CONSTRAINT ck_inspection_item_dim   CHECK (dimension IN ('real','complete','usable','safe'))
);

INSERT INTO ams.ams_inspection_item (code, phase, dimension, seq, name, standard_ref, check_type, enabled, sort) VALUES
-- ── 归档环节 gd ──
('GD-1-01','gd','real',1,'电子文件存在性（内容非空）','DA/T 94-2022','file-present',true,1),
('GD-1-02','gd','real',2,'文件摘要登记（防篡改固化）','GB/T 18894-2016','hash-registered',false,2),
('GD-1-03','gd','real',3,'档号规范性（字符集/非占位）','DA/T 13-2022','archive-code-format',true,3),
('GD-2-01','gd','complete',1,'必填元数据齐全','DA/T 94-2022 / 79号令','required-fields',true,4),
('GD-2-02','gd','complete',2,'凭证号连续性（断号检测）','DA/T 42-2022','voucher-no-gap',true,5),
('GD-2-03','gd','complete',3,'凭证号重复性（卷内查重）','79号令','voucher-no-dup',true,6),
('GD-2-04','gd','complete',4,'附件完整性（应有影像/附件）','79号令','attachment-presence',false,7),
('GD-2-05','gd','complete',5,'金额值域合理性','—','amount-range',true,8),
('GD-3-01','gd','usable',1,'电子文件格式合规（白名单）','GB/T 33190-2016','format-whitelist',true,9),
('GD-3-02','gd','usable',2,'元数据可读性（题名/属性可读）','DA/T 94-2022','metadata-readable',true,10),
('GD-3-03','gd','usable',3,'日期值域合理性（年度/月份）','—','date-range',true,11),
('GD-4-01','gd','safe',1,'敏感信息模式扫描（身份证/银行卡）','—','sensitive-pattern',true,12),
('GD-4-02','gd','safe',2,'敏感关键词扫描（可配置词表）','—','sensitive-keywords',true,13),
('GD-4-03','gd','safe',3,'密级标识合规性','—','security-level-valid',true,14),
-- ── 移交环节 yj ──
('YJ-1-01','yj','real',1,'移交件电子文件存在性','DA/T 94-2022','file-present',true,20),
('YJ-2-01','yj','complete',1,'移交必填元数据齐全','DA/T 94-2022','required-fields',true,21),
('YJ-2-02','yj','complete',2,'卷内件数与卷头登记一致','DA/T 39-2008','volume-count-match',true,22),
('YJ-3-01','yj','usable',1,'移交格式合规（白名单）','GB/T 33190-2016','format-whitelist',true,23),
('YJ-4-01','yj','safe',1,'移交敏感信息模式扫描','—','sensitive-pattern',true,24),
-- ── 长期保存环节 cq ──
('CQ-1-01','cq','real',1,'在库件摘要登记抽查','GB/T 18894-2016','hash-registered',false,30),
('CQ-3-01','cq','usable',1,'长期保存格式合规（白名单）','GB/T 33190-2016','format-whitelist',true,31),
('CQ-3-02','cq','usable',2,'元数据可读性抽查','DA/T 94-2022','metadata-readable',true,32);
