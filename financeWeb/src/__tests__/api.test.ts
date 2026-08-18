import { describe, it, expect } from 'vitest';
import { personToPersonnel } from '../services/alfresco';

/**
 * 组织/人员域 API 映射层测试（2026-08-16 重写）
 *
 * 原测试断言的是已删除的 mock 死函数（fetchRecords/fetchFanzongs 等），
 * 现改为校验真实使用的 Alfresco → 前端模型纯映射。
 * 网络侧（Groups/People CRUD）属集成层，由 seed/test-*.mjs 冒烟脚本覆盖。
 */
describe('alfresco 人员映射（personToPersonnel）', () => {
  it('把 Alfresco PersonEntry 映射为前端 PersonnelItem 形状', () => {
    const mapped = personToPersonnel({
      id: 'zhangwei',
      firstName: '伟',
      lastName: '张',
      email: 'zhangwei@example.com',
      enabled: true,
    } as any);
    expect(mapped).toEqual({
      id: 'zhangwei',
      account: 'zhangwei',
      name: '伟张',
      email: 'zhangwei@example.com',
      enabled: true,
    });
  });

  it('保留 enabled=false 状态（禁用账号不丢标志）', () => {
    const mapped = personToPersonnel({
      id: 'sunli', firstName: '丽', lastName: '孙', email: '', enabled: false,
    } as any);
    expect(mapped.enabled).toBe(false);
    expect(mapped.account).toBe('sunli');
  });
});
