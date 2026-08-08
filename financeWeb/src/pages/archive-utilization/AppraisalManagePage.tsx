/**
 * @license SPDX-License-Identifier: Apache-2.0
 *
 * AppraisalManagePage — 期满鉴定与销毁
 *
 * 功能：
 *   1. 保管期满预警看板（30天/90天）
 *   2. 鉴定小组会签
 *   3. 销毁清册生成
 *   4. 监销确认（永久档案锁定）
 */

import React, { useState, useMemo } from 'react';
import { Trash2, AlertCircle, CheckCircle2, XCircle, Clock, FileText, Users, Shield, Download, ChevronDown, ChevronRight, Search, Lock } from 'lucide-react';
import { useVolumeStore } from '../../stores/volumeStore';

// ── 鉴定记录 ──
interface AppraisalItem {
  id: string;
  volumeId: string;
  volumeCode: string;
  title: string;
  archiveType: string;
  retention: string;
  expiryDate: string;
  daysLeft: number;
  status: '正常' | '即将到期' | '已到期' | '永久锁定';
  appraisalStatus: '待鉴定' | '鉴定中' | '同意销毁' | '同意延期' | '已销毁';
  reviewers: { name: string; role: string; opinion: string; signed: boolean }[];
}

// ── Mock 数据 ──
const MOCK_APPRAISALS: AppraisalItem[] = [
  { id: 'ap-1', volumeId: 'v-1', volumeCode: 'Z001-HJ-2016-KP-D10-V001', title: '2016年会计凭证-第001卷', archiveType: '会计凭证', retention: '10年', expiryDate: '2026-06-30', daysLeft: 17, status: '即将到期', appraisalStatus: '待鉴定', reviewers: [{ name: '张三', role: '财务部', opinion: '', signed: false }, { name: '李四', role: '档案部', opinion: '', signed: false }, { name: '王五', role: '审计部', opinion: '', signed: false }] },
  { id: 'ap-2', volumeId: 'v-2', volumeCode: 'Z001-HJ-2016-QT-D10-V001', title: '2016年其他资料-第001卷', archiveType: '其他会计资料', retention: '10年', expiryDate: '2026-06-15', daysLeft: 2, status: '即将到期', appraisalStatus: '待鉴定', reviewers: [{ name: '张三', role: '财务部', opinion: '', signed: false }, { name: '李四', role: '档案部', opinion: '', signed: false }] },
  { id: 'ap-3', volumeId: 'v-3', volumeCode: 'Z001-HJ-2016-KP-D10-V002', title: '2016年会计凭证-第002卷', archiveType: '会计凭证', retention: '10年', expiryDate: '2026-07-15', daysLeft: 32, status: '即将到期', appraisalStatus: '待鉴定', reviewers: [{ name: '张三', role: '财务部', opinion: '', signed: false }, { name: '李四', role: '档案部', opinion: '', signed: false }] },
  { id: 'ap-4', volumeId: 'v-4', volumeCode: 'Z001-HJ-2015-FB-Y-V001', title: '2015年度财务报告-第001卷', archiveType: '财务报告', retention: '永久', expiryDate: '—', daysLeft: -1, status: '永久锁定', appraisalStatus: '待鉴定', reviewers: [{ name: '张三', role: '财务部', opinion: '', signed: false }, { name: '李四', role: '档案部', opinion: '', signed: false }] },
  { id: 'ap-5', volumeId: 'v-5', volumeCode: 'Z001-HJ-2016-KB-D30-V001', title: '2016年会计账簿-第001卷', archiveType: '会计账簿', retention: '30年', expiryDate: '2056-06-30', daysLeft: 10950, status: '正常', appraisalStatus: '待鉴定', reviewers: [] },
];

const AppraisalManagePage: React.FC = () => {
  const volumes = useVolumeStore((s) => s.volumes);
  const [appraisals] = useState<AppraisalItem[]>(MOCK_APPRAISALS);
  const [activeTab, setActiveTab] = useState<'expiring' | 'all'>('expiring');
  const [selectedReview, setSelectedReview] = useState<string | null>(null);

  // 过滤
  const filteredAppraisals = useMemo(() => {
    if (activeTab === 'expiring') return appraisals.filter((a) => a.daysLeft <= 90 && a.daysLeft >= 0);
    return appraisals;
  }, [appraisals, activeTab]);

  // 统计数据
  const stats = useMemo(() => {
    const expired = appraisals.filter((a) => a.daysLeft >= 0 && a.daysLeft <= 30).length;
    const expiring = appraisals.filter((a) => a.daysLeft > 30 && a.daysLeft <= 90).length;
    const locked = appraisals.filter((a) => a.status === '永久锁定').length;
    return { expired, expiring, locked };
  }, [appraisals]);

  return (
    <div className="flex flex-col h-full bg-slate-100">
      {/* 顶栏 */}
      <div className="flex items-center gap-3 px-6 py-3 bg-white border-b border-slate-200">
        <Trash2 className="w-5 h-5 text-slate-600" />
        <h1 className="text-base font-bold text-slate-800">期满鉴定与销毁</h1>
        <div className="flex-1" />
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {/* 预警看板 */}
        <div className="grid grid-cols-3 gap-4">
          <div className="bg-white border border-red-200 rounded-xl p-4">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-5 h-5 text-red-500" />
              <span className="text-xs text-slate-500">30天内到期</span>
            </div>
            <div className="text-2xl font-bold text-red-600 mt-1">{stats.expired}</div>
            <div className="text-xs text-slate-400 mt-1">需立即组织鉴定</div>
          </div>
          <div className="bg-white border border-amber-200 rounded-xl p-4">
            <div className="flex items-center gap-2">
              <Clock className="w-5 h-5 text-amber-500" />
              <span className="text-xs text-slate-500">90天内到期</span>
            </div>
            <div className="text-2xl font-bold text-amber-600 mt-1">{stats.expiring}</div>
            <div className="text-xs text-slate-400 mt-1">需提前准备鉴定材料</div>
          </div>
          <div className="bg-white border border-sky-200 rounded-xl p-4">
            <div className="flex items-center gap-2">
              <Lock className="w-5 h-5 text-sky-500" />
              <span className="text-xs text-slate-500">永久锁定</span>
            </div>
            <div className="text-2xl font-bold text-sky-600 mt-1">{stats.locked}</div>
            <div className="text-xs text-slate-400 mt-1">依法永久保存，不可销毁</div>
          </div>
        </div>

        {/* 列表 + 筛选 */}
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-5 py-3 border-b border-slate-200 flex items-center gap-3">
            <button
              type="button"
              onClick={() => setActiveTab('expiring')}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg ${activeTab === 'expiring' ? 'bg-amber-100 text-amber-700' : 'text-slate-500 hover:bg-slate-100'}`}
            >
              即将到期
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('all')}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg ${activeTab === 'all' ? 'bg-amber-100 text-amber-700' : 'text-slate-500 hover:bg-slate-100'}`}
            >
              全部案卷
            </button>
          </div>

          <div className="divide-y divide-slate-100">
            {filteredAppraisals.length === 0 ? (
              <div className="px-5 py-6 text-center text-sm text-slate-400">暂无符合条件的案卷</div>
            ) : (
              filteredAppraisals.map((item) => (
                <div key={item.id} className="px-5 py-3">
                  <div className="flex items-start gap-3">
                    <div className={`p-2 rounded-lg ${
                      item.status === '永久锁定' ? 'bg-sky-50' :
                      item.daysLeft <= 30 ? 'bg-red-50' : 'bg-amber-50'
                    }`}>
                      {item.status === '永久锁定' ? (
                        <Lock className="w-4 h-4 text-sky-500" />
                      ) : (
                        <Clock className={`w-4 h-4 ${item.daysLeft <= 30 ? 'text-red-500' : 'text-amber-500'}`} />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-sm text-slate-800">{item.volumeCode}</span>
                        <span className={`px-1.5 py-0.5 text-xs font-medium rounded-full ${
                          item.status === '永久锁定' ? 'bg-sky-100 text-sky-700' :
                          item.daysLeft <= 30 ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'
                        }`}>
                          {item.status === '永久锁定' ? (<span className="inline-flex items-center gap-0.5"><Lock className="w-3 h-3" /> 永久保存</span>) : (<span className="inline-flex items-center gap-0.5"><Clock className="w-3 h-3" /> {item.daysLeft}天</span>)}
                        </span>
                      </div>
                      <div className="text-xs text-slate-500 mt-0.5">{item.title} | {item.retention} | 到期日: {item.expiryDate}</div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      {item.status !== '永久锁定' && item.daysLeft <= 90 && (
                        <button
                          type="button"
                          onClick={() => setSelectedReview(selectedReview === item.id ? null : item.id)}
                          className="px-3 py-1.5 text-xs font-medium text-sky-600 bg-sky-50 border border-sky-200 rounded-lg hover:bg-sky-100"
                        >
                          {item.appraisalStatus === '待鉴定' ? '发起鉴定' : '查看鉴定'}
                        </button>
                      )}
                      {item.status === '永久锁定' && (
                        <span className="px-3 py-1.5 text-xs text-slate-400">无需操作</span>
                      )}
                    </div>
                  </div>

                  {/* 鉴定小组（展开） */}
                  {selectedReview === item.id && (
                    <div className="mt-3 ml-11 p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
                      <h4 className="text-xs font-semibold text-slate-700 flex items-center gap-1.5">
                        <Users className="w-3.5 h-3.5" />
                        鉴定小组成员
                      </h4>
                      <div className="space-y-2">
                        {item.reviewers.map((r, i) => (
                          <div key={i} className="flex items-center gap-3 px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm">
                            <div className="w-6 h-6 rounded-full bg-slate-200 flex items-center justify-center text-xs font-medium text-slate-600">
                              {r.name[0]}
                            </div>
                            <div className="flex-1">
                              <span className="font-medium text-slate-700">{r.name}</span>
                              <span className="text-xs text-slate-400 ml-2">{r.role}</span>
                            </div>
                            <select
                              className="px-2 py-1 text-xs border border-slate-300 rounded bg-white"
                              value={r.opinion || ''}
                              onChange={() => {}}
                            >
                              <option value="">请选择意见...</option>
                              <option value="destroy">同意销毁</option>
                              <option value="keep">同意保留（延期）</option>
                              <option value="extend">延长保管期限</option>
                            </select>
                            <button
                              type="button"
                              className={`px-2.5 py-1 text-xs font-medium rounded ${
                                r.signed ? 'bg-green-100 text-green-700' : 'bg-sky-100 text-sky-700'
                              }`}
                            >
                              {r.signed ? (<span className="inline-flex items-center gap-0.5">已签署 <CheckCircle2 className="w-3 h-3" /></span>) : '签署'}
                            </button>
                          </div>
                        ))}
                      </div>
                      <div className="flex items-center gap-2 pt-1">
                        <button
                          type="button"
                          className="px-4 py-1.5 text-xs font-medium text-white bg-sky-600 rounded-lg hover:bg-sky-700"
                        >
                          生成销毁清册
                        </button>
                        <button
                          type="button"
                          className="px-4 py-1.5 text-xs font-medium text-amber-700 bg-amber-100 rounded-lg hover:bg-amber-200"
                        >
                          延期保留
                        </button>
                        <button
                          type="button"
                          className="px-4 py-1.5 text-xs font-medium text-slate-600 bg-white border border-slate-300 rounded-lg hover:bg-slate-50"
                        >
                          <Download className="w-3 h-3 inline mr-1" />
                          导出清册
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>

        {/* 法规提示 */}
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
          <div className="flex items-start gap-2 text-xs text-amber-800">
            <Shield className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
            <div>
              <p className="font-medium">依据 79号令 第三章 保管与销毁</p>
              <p className="mt-0.5">永久保管的会计档案（年度财务报告、保管/销毁清册、鉴定意见书）不得销毁。期满鉴定需成立鉴定小组（≥3人），会签同意后方可执行销毁，监销人需全程监督并在销毁清册上签字确认。</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AppraisalManagePage;


