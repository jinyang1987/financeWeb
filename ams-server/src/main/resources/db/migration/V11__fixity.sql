-- ────────────────────────────────────────────────────────────────
-- V11: 电子文件固化登记（哈希）+ 检测项库真比对补强（2026-08-29，缺陷修复第一批 T1）
--
-- 背景：审计发现全后端无文件哈希计算（GD-1-1 固化信息有效性零落地），
--   finance:digitalHash 仅卷级属性且无人写入。本迁移：
--   1. 建件级固化登记表 ams_record_fixity（哈希落 PG 读模型侧，与混合架构一致；
--      Alfresco 模型不动，避免热部署风险——见 finance-model 部署规程）；
--   2. 激活既有「摘要登记」检测项（GD-1-02 / CQ-1-01，T1 起三入口真实写入）；
--   3. 新增「重算比对」真检测项（hash-verify / volume-hash-verify）。
-- ────────────────────────────────────────────────────────────────

CREATE TABLE ams.ams_record_fixity (
  node_id           text PRIMARY KEY,             -- Alfresco 件节点 id
  sha256            text NOT NULL,                -- 内容字节 SHA-256（64 位小写 hex）
  size_bytes        bigint NOT NULL,              -- 登记时文件字节数（一致性比对基准）
  mime              text NOT NULL DEFAULT '',     -- 登记时声明格式（一致性比对基准）
  registered_by     text NOT NULL DEFAULT '',     -- 登记人（上传/推送/同步操作人）
  registered_at     timestamptz NOT NULL DEFAULT now(),
  last_verified_at  timestamptz,                  -- 最近一次重算比对时间
  last_verify_ok    boolean,                      -- 最近一次重算比对结果
  verify_count      int NOT NULL DEFAULT 0        -- 累计比对次数
);
CREATE INDEX idx_fixity_verify_due ON ams.ams_record_fixity (last_verified_at NULLS FIRST);
CREATE INDEX idx_fixity_verify_bad ON ams.ams_record_fixity (last_verify_ok) WHERE last_verify_ok = false;

-- 摘要登记检测项激活（T1 起建件/推送/用友同步三入口真实登记，不再是空检查）
UPDATE ams.ams_inspection_item SET enabled = true WHERE code IN ('GD-1-02', 'CQ-1-01');

-- 新增真比对检测项：重算内容 SHA-256 与登记值逐位比对（DA/T 70-2018 固化信息有效性落地）
INSERT INTO ams.ams_inspection_item (code, phase, dimension, seq, name, standard_ref, check_type, enabled, sort) VALUES
('GD-1-04', 'gd', 'real', 4, '文件摘要一致性（重算比对）', 'DA/T 70-2018 5.1.1.1', 'hash-verify', true, 15),
('YJ-1-02', 'yj', 'real', 2, '移交文件摘要复核（重算比对）', 'DA/T 70-2018 5.2.1.1', 'hash-verify', true, 25),
('YJ-1-03', 'yj', 'real', 3, '案卷聚合摘要复核', 'DA/T 70-2018 5.2.1.2', 'volume-hash-verify', true, 26),
('CQ-1-02', 'cq', 'real', 2, '在库件摘要重算比对', 'DA/T 70-2018 4.3.2', 'hash-verify', true, 33);
