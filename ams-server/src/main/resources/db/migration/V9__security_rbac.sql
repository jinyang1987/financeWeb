-- ════════════════════════════════════════════════════════════════════
-- V9 角色权限补强（三维授权 + 行级过滤 RBAC 扩展，2026-08-18）
-- 依据：《角色与权限业务逻辑梳理》本土化映射
--   ① 人员密级（S_USER.MJ 对应物）：ams_user_ext.security_clearance
--   ② 角色三维授权配置（功能×数据×操作）不落新表：
--      存 ams_config['role-auth-v1']（前端 roleStore 单一数据源，服务端 30s 缓存消费）
--      默认矩阵见 PermissionService.DEFAULTS（与本库演示账号口径一致）
-- ════════════════════════════════════════════════════════════════════

-- ① 人员密级：0普通 / 1内部 / 2秘密 / 3机密（与 finance:securityList 档序一致）
ALTER TABLE ams.ams_user_ext
  ADD COLUMN IF NOT EXISTS security_clearance int NOT NULL DEFAULT 1;

COMMENT ON COLUMN ams.ams_user_ext.security_clearance IS '人员密级 0普通/1内部/2秘密/3机密；有效密级=min(人员密级, 角色密级上限)';

-- 演示账号密级初始化（收紧默认：审批/管理岗高，普通员工低）
UPDATE ams.ams_user_ext SET security_clearance = 3
  WHERE user_id IN ('zhaogang', 'sunli', 'liumin', 'chenjing', 'admin', 'qianfang', 'shenji');
UPDATE ams.ams_user_ext SET security_clearance = 2
  WHERE user_id IN ('wangqiang');
-- zhangwei / lina 保持默认 1（内部）

-- ② 授权变更审计说明：role-auth-v1 的每次 PUT 由 ConfigController 写 ams_operation_log
--    （action='权限配置变更'），复用 V1 哈希链，无需新表。
