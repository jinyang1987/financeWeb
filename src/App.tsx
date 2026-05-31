/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo } from 'react';
import { 
  Upload, Search, CheckCircle, FolderPlus, Notebook, ChevronRight, 
  Trash2, ShieldCheck, ShieldAlert, Award, FileText, Settings, 
  RefreshCw, Info, CheckCircle2, AlertTriangle, Filter, Database, Menu, X,
  Compass, Grid, Building2, Users, UserCheck, Shield, Fingerprint, ChevronDown, ChevronUp, Briefcase, Layers,
  Check, Files, Bell, Cpu, Ticket, Activity, FileSpreadsheet, FileInput, Link2, CheckSquare, FolderTree, Clock
} from 'lucide-react';

import { CategoryNode, ArchiveRecord, Fonds, CategoryConfigItem } from './types';
import { initialCategoryTree, initialRecords } from './data';
import { StatsDashboard } from './components/StatsDashboard';
import { ArchiveTree } from './components/ArchiveTree';
import { AdvancedWorkbenchSidebar } from './components/AdvancedWorkbenchSidebar';
import { UploadModal } from './components/UploadModal';
import { InteractivePreview } from './components/InteractivePreview';
import { AuditTimeline } from './components/AuditTimeline';

// Import our new professional business components
import { FanzongManager } from './components/FanzongManager';
import { WorkflowConfigPanel } from './components/WorkflowConfigPanel';
import { OrgManagePanel } from './components/OrgManagePanel';
import { UserRolePanel } from './components/UserRolePanel';
import { AuditLogsPanel } from './components/AuditLogsPanel';
import { DigitalWarehousePanel } from './components/DigitalWarehousePanel';

import { ArchiveReceiveCenter } from './components/ArchiveReceiveCenter';
import { ArchiveOfflineReceive } from './components/ArchiveOfflineReceive';

export default function App() {
  // Core persistent reactive state
  const [records, setRecords] = useState<ArchiveRecord[]>(initialRecords);
  const [treeData, setTreeData] = useState<CategoryNode[]>(initialCategoryTree);
  const [selectedNode, setSelectedNode] = useState<CategoryNode | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  // Elevated state for Fanzong Management and Category/Metadata Studio
  const [fanzongs, setFanzongs] = useState<Fonds[]>([
    { id: 'fz-1', name: '第一全宗（华北集团总部）', code: 'Z001', status: 'active', recordCount: 4, address: '北京市朝阳区国贸大厦A座5层', syncSource: '内置主数据库' },
    { id: 'fz-2', name: '第二全宗（南方智造分公司）', code: 'Z002', status: 'active', recordCount: 1, address: '深圳市南山区创智航天大厦12层', syncSource: '金蝶云同步链路' },
    { id: 'fz-3', name: '第三全宗（海外业务事业群）', code: 'Z003', status: 'inactive', recordCount: 0, address: '新加坡滨海路Marina Centre', syncSource: 'SAP Integration Broker' },
  ]);
  const [currentFanzongCode, setCurrentFanzongCode] = useState('Z001');

  // Unified map of Fanzong -> CategoryConfigItem[]
  const [fanzongCategories, setFanzongCategories] = useState<Record<string, CategoryConfigItem[]>>({
    'Z001': [
      {
        id: 'cat-vd-1',
        name: '记账凭证门类',
        alfrescoType: 'archive:voucher',
        creator: 'admin (系统宿主)',
        createTime: '2026-05-12',
        properties: [
          { id: 'p1', key: 'voucherNo', label: '凭证字号', dataType: 'string', isRequired: true, ocrEnabled: true, gbStandardCode: 'GB/T 18894-A.1.1', description: '财务凭证的核心识别号码，如“记-001”' },
          { id: 'p2', key: 'amount', label: '合计金额', dataType: 'decimal', isRequired: true, ocrEnabled: true, gbStandardCode: 'GB/T 18894-A.1.3', description: '报销凭证的借贷轧平人民币总金额' },
          { id: 'p3', key: 'year', label: '核算年度', dataType: 'string', isRequired: true, ocrEnabled: false, gbStandardCode: 'GB/T 18894-A.1.5', description: '对应的记账财务年度，如“2026”' },
          { id: 'p4', key: 'bookkeeper', label: '记账人', dataType: 'string', isRequired: false, ocrEnabled: true, gbStandardCode: 'GB/T 18894-A.2.1', description: '在总账系统中执行该笔账目背书录入的柜员名称' },
          { id: 'p5', key: 'settledStatus', label: '勾稽核销状态', dataType: 'boolean', isRequired: false, ocrEnabled: false, gbStandardCode: 'GB/T 18894-A.3.4', description: '该笔出纳状态是否已与银企直联对账单勾稽匹配完成' }
        ]
      },
      {
        id: 'cat-re-1',
        name: '财务报告门类',
        alfrescoType: 'archive:report',
        creator: 'admin (系统宿主)',
        createTime: '2026-05-15',
        properties: [
          { id: 'p11', key: 'reportName', label: '报告名称', dataType: 'string', isRequired: true, ocrEnabled: false, gbStandardCode: 'GB/T 18894-B.1.1', description: '例如“2025年度董事会审计财务报告”' },
          { id: 'p12', key: 'auditFirm', label: '审计会计师事务所', dataType: 'string', isRequired: true, ocrEnabled: true, gbStandardCode: 'GB/T 18894-B.1.4', description: '出具外部审计核验结论的第三方会计师组织' }
        ]
      }
    ],
    'Z002': [
      {
        id: 'cat-vd-2',
        name: '南方分公司出纳凭单',
        alfrescoType: 'archive:sz_payment',
        creator: 'sz_manager (分公司审计员)',
        createTime: '2026-05-20',
        properties: [
          { id: 'p21', key: 'paymentNo', label: '出纳付款编号', dataType: 'string', isRequired: true, ocrEnabled: true, gbStandardCode: 'GB/T 18894-SZ.1', description: '南方智造分公司付款台账索引号' },
          { id: 'p22', key: 'auditor', label: '分公司稽核员', dataType: 'string', isRequired: false, ocrEnabled: false, gbStandardCode: 'GB/T 18894-SZ.2', description: '分公司内部勾稽责任人' }
        ]
      }
    ],
    'Z003': []
  });
  
  // Selection states (checked rows IDs)

  const [selectedRecordIds, setSelectedRecordIds] = useState<Set<string>>(new Set());
  
  // Slide Drawer details controls
  const [drawerVisible, setDrawerVisible] = useState(false);
  const [activeRecord, setActiveRecord] = useState<ArchiveRecord | null>(null);
  const [activeFileIndex, setActiveFileIndex] = useState(0);

  // Popups/Modals/Loaders
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [isCheckingBatch, setIsCheckingBatch] = useState(false);
  const [feedbackToast, setFeedbackToast] = useState<{message: string, type: 'success' | 'info' | 'warning'} | null>(null);

  // Mobile sidebar drawer
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  // Navigation tabs (matching Vue mock parameters)
  const [activeMainMenu, setActiveMainMenu] = useState<
    'dashboard' | 'view-finance' | 'view-project' | 'view-time' | 'config-fanzong' | 'config-directory' | 'config-workflow' | 'sys-org' | 'sys-user' | 'sys-log' |
    'archive-offline' | 'archive-rcv' | 'wf-control' | 'borrow-manage' | 'return-manage' | 'search-stats' | 'smart-data' | 'order-special' | 'digital-warehouse'
  >('dashboard');

  // Interactive local states for regulatory & compliance workflows (Vue counterpart logic)
  const [typeQueryFilter, setTypeQueryFilter] = useState<'all' | 'unreturned'>('all');
  const [mediaPort, setMediaPort] = useState<'elec' | 'phys'>('elec');
  const [dbNameInput, setDbNameInput] = useState('集团总部2026账套档案库');
  
  const [rcvTableData, setRcvTableData] = useState([
    { id: 'rcv-1', voucherNo: '记-001', matchStatus: '完美匹配', volume: '卷A-202605-01' },
    { id: 'rcv-2', voucherNo: '记-002', matchStatus: '上下游关联缺失', volume: '待定案卷定位' }
  ]);

  const [wfTableData, setWfTableData] = useState([
    { id: 'wf-1', orderId: 'WF-BORROW-202605-092', borrower: '王丽(核算组)', reason: '配合2026年半年度集团内部财务审计', status: '审批中' },
    { id: 'wf-2', orderId: 'WF-BORROW-202605-081', borrower: '刘明(资金组)', reason: '项目合同历史发票复核', status: '审批通过' }
  ]);

  const [borrowListState, setBorrowListState] = useState([
    { id: '1029', onShelfTime: '2026-01-10', borrowTime: '2026-05-30', person: '张三', dept: '上海财务部', vouchers: '记-001 ~ 记-050' },
    { id: '1030', onShelfTime: '2026-02-15', borrowTime: '2026-05-28', person: '李四', dept: '北京核算组', vouchers: '银-002, 银-005' },
    { id: '1031', onShelfTime: '2026-03-01', borrowTime: '2026-05-29', person: '王五', dept: '广州销售部', vouchers: '收-011 ~ 收-015' }
  ]);

  const [returnTableData, setReturnTableData] = useState([
    { id: 'ret-1', code: 'Z1-01-202605-001', deadline: '2026-05-25', overdueDays: 5, status: '超期未归还(已下发催还单)' },
    { id: 'ret-2', code: 'Z1-01-202605-002', deadline: '2026-06-15', overdueDays: 0, status: '借阅中(正常状态)' },
    { id: 'ret-3', code: 'Z1-01-202605-003', deadline: '2026-05-10', overdueDays: 20, status: '超期未归还(已下发催还单)' }
  ]);

  const [selectedReturnIds, setSelectedReturnIds] = useState<Set<string>>(new Set());

  const [specialOrders, setSpecialOrders] = useState([
    { id: 'so-1', orderNum: 'JD-9021', borrower: '赵四', category: '凭证借阅', sameUnit: 'A全宗-202605卷【临近单元自动归纳】', stepActive: 2 },
    { id: 'so-2', orderNum: 'JD-9022', borrower: '钱五', category: '账簿借阅(临时)', sameUnit: 'A全宗-202605卷【临近单元自动归纳】', stepActive: 1 }
  ]);

  const [cleanTableData, setCleanTableData] = useState([
    { id: '1', rawVoucher: '银 [2026] -- 05_004号   (含空格标点)', cleanVoucher: '银-202605-004', archiveCode: '1728-2-004', isSegment: true, status: 'New' },
    { id: '2', rawVoucher: '记字第 001号 ## 临时拼盒', cleanVoucher: '记-202605-001', archiveCode: 'TZ-1-003', isSegment: false, status: '质检中' },
    { id: '3', rawVoucher: '现金 // 2026 / 04-12 号', cleanVoucher: '现-202604-012', archiveCode: '1128-3-201', isSegment: false, status: '已上架' },
    { id: '4', rawVoucher: '外币-2026-05-002 (跨卷盒分离)', cleanVoucher: '外-202605-002', archiveCode: '1728-5-002', isSegment: true, status: '已借出' }
  ]);
  const [cleanSearchQuery, setCleanSearchQuery] = useState('');
  const [isInsertSegmentModalOpen, setIsInsertSegmentModalOpen] = useState(false);
  const [insertSegmentBaseVoucher, setInsertSegmentBaseVoucher] = useState('VOL-1728-2-004');
  const [insertSegmentVal, setInsertSegmentVal] = useState('004-1, 004-2');
  const [insertSegmentRule, setInsertSegmentRule] = useState('1');

  const [borrowOrderData, setBorrowOrderData] = useState([
    { id: 'bo-1', orderId: 'JD-2026-9021', borrower: '张三 (工号1002, 档案室)', dept: '信息科技公司', vouchers: '银-202605-004 等 12 张凭证', nodeStatus: '等待财务部门审批' },
    { id: 'bo-2', orderId: 'JD-2026-9022', borrower: '李四 (工号1541, 核算部)', dept: '文化产业公司', vouchers: '现-202604-012 原始账簿借阅', nodeStatus: '办理完毕' }
  ]);

  const [customVoucherToClean, setCustomVoucherToClean] = useState('记 -- 003   (特殊符号+空格)');
  const [cleanedVoucherOutput, setCleanedVoucherOutput] = useState('');
  const [insertNumbers, setInsertNumbers] = useState('2-1, 2-2');
  const [insertResults, setInsertResults] = useState<string[]>([]);
  const [statsModePerson, setStatsModePerson] = useState('张三');
  const [statsModeDept, setStatsModeDept] = useState('上海财务部');
  
  // Sidebar group accordions
  const [isRcvGroupOpen, setIsRcvGroupOpen] = useState(true);
  const [isArrangeGroupOpen, setIsArrangeGroupOpen] = useState(true);
  const [isPreserveGroupOpen, setIsPreserveGroupOpen] = useState(true);
  const [isUtilGroupOpen, setIsUtilGroupOpen] = useState(true);
  const [isDisposalGroupOpen, setIsDisposalGroupOpen] = useState(true);
  const [isStatsGroupOpen, setIsStatsGroupOpen] = useState(true);
  const [isArchiveSettingsGroupOpen, setIsArchiveSettingsGroupOpen] = useState(true);
  const [isSystemGroupOpen, setIsSystemGroupOpen] = useState(true);

  // Top-level menu visibility settings
  const [visibleMenus, setVisibleMenus] = useState<Record<string, boolean>>({
    rcv: true,
    arrange: true,
    preserve: true,
    util: true,
    disposal: true,
    stats: true,
    archiveSettings: true,
    system: true
  });
  const [isMenuSettingsOpen, setIsMenuSettingsOpen] = useState(false);

  const toggleMenuVisibility = (key: string) => {
    setVisibleMenus(prev => ({ ...prev, [key]: !prev[key] }));
  };

  // Helper function to throw consistent status toasts
  const triggerToast = (msg: string, type: 'success' | 'info' | 'warning' = 'success') => {
    setFeedbackToast({ message: msg, type });
    setTimeout(() => {
      setFeedbackToast(null);
    }, 4500);
  };

  // Helper to query and cache records strictly belonging to the selected Fanzong Co
  const currentFondsRecords = useMemo(() => {
    return records.filter(r => r.archiveCode.startsWith(currentFanzongCode));
  }, [records, currentFanzongCode]);

  // 1. Cascading category filtering + text lookup logic
  const filteredRecords = useMemo(() => {
    // Current workspace view details are filtered by active Fanzong code by default
    let result = records.filter(r => r.archiveCode.startsWith(currentFanzongCode));

    // Filter by Tree Node Selection
    if (selectedNode) {
      if (selectedNode.type === 'fonds') {
        // e.g., Filter by Fonds code prefix Z001 -> Z001-01-01...
        result = result.filter(r => r.archiveCode.startsWith(selectedNode.code || ''));
      } else if (selectedNode.type === 'class') {
        // It's a category like "会计凭证", "会计账簿", etc.
        const baseNameChinese = selectedNode.label;
        if (baseNameChinese === '会计凭证') {
          result = result.filter(r => r.archiveType === '记账凭证' || r.archiveType === '会计凭证');
        } else if (baseNameChinese === '财务报表') {
          result = result.filter(r => r.archiveType === '财务报告' || r.archiveType === '财务报表');
        } else {
          result = result.filter(r => r.archiveType === baseNameChinese);
        }
      } else if (selectedNode.type === 'subclass') {
        const baseNameChinese = selectedNode.label.includes(' ') 
          ? selectedNode.label.substring(selectedNode.label.indexOf(' ') + 1)
          : selectedNode.label;
        if (baseNameChinese === '记账凭证') {
          result = result.filter(r => r.archiveType === '记账凭证' || r.archiveType === '会计凭证');
        } else if (baseNameChinese === '财务报告') {
          result = result.filter(r => r.archiveType === '财务报告' || r.archiveType === '财务报表');
        } else {
          result = result.filter(r => r.archiveType === baseNameChinese);
        }
      } else if (selectedNode.type === 'period') {
        const periodCode = selectedNode.code || '';
        // Because "year/month" are under the class now, we might also want to filter by the parent if available, but the tree selection alone doesn't give parent. For now just periodCode.
        result = result.filter(r => r.year === periodCode || r.archiveCode.includes(`-${periodCode}-`) || r.month === periodCode || (r.year + r.month) === periodCode);
      }
    }

    // Filter by text search query
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      result = result.filter(item => 
        item.archiveCode.toLowerCase().includes(q) ||
        item.voucherNo.toLowerCase().includes(q) ||
        item.department.toLowerCase().includes(q) ||
        item.amount.toString().includes(q) ||
        item.remarks?.toLowerCase().includes(q) ||
        item.components.some(c => c.name.toLowerCase().includes(q))
      );
    }

    return result;
  }, [records, selectedNode, searchQuery, currentFanzongCode]);

  // Handle single row checkbox toggle
  const toggleRowSelect = (id: string) => {
    setSelectedRecordIds(prev => {
      const copy = new Set(prev);
      if (copy.has(id)) {
        copy.delete(id);
      } else {
        copy.add(id);
      }
      return copy;
    });
  };

  // Toggle all visible rows
  const toggleSelectAll = () => {
    if (selectedRecordIds.size === filteredRecords.length) {
      setSelectedRecordIds(new Set());
    } else {
      setSelectedRecordIds(new Set(filteredRecords.map(r => r.id)));
    }
  };

  const handleOpenDrawer = (record: ArchiveRecord) => {
    setActiveRecord(record);
    setActiveFileIndex(0);
    setDrawerVisible(true);
  };

  const handleCloseDrawer = () => {
    setDrawerVisible(false);
    setActiveRecord(null);
  };

  // Action: Append node to stateful archiving tree
  const handleAddNewCategory = (parentCode: string, label: string, code: string) => {
    const parentNodeFinder = (nodes: CategoryNode[]): boolean => {
      for (let n of nodes) {
        if (n.code === parentCode) {
          if (!n.children) n.children = [];
          n.children.push({
            id: `usr-cat-${Date.now()}`,
            label: label,
            type: parentCode.includes('-') ? 'period' : 'subclass',
            code: code
          });
          return true;
        }
        if (n.children && parentNodeFinder(n.children)) {
          return true;
        }
      }
      return false;
    };

    const newTreeData = [...treeData];
    const success = parentNodeFinder(newTreeData);
    if (success) {
      setTreeData(newTreeData);
      triggerToast(`已成功创建类目：${label} (编码：${code})`, 'success');
    } else {
      triggerToast(`无法定位父类目 ${parentCode}，请检查分类编码是否正确。`, 'warning');
    }
  };

  // Action: "一键四性检测" (Four-Properties Checker Engine)
  const handleRunFourPropertiesCheck = () => {
    setIsCheckingBatch(true);
    
    // Choose selected rows, or run on entire state list if none checked
    const targetIds = selectedRecordIds.size > 0 
      ? Array.from(selectedRecordIds) 
      : filteredRecords.map(r => r.id);

    if (targetIds.length === 0) {
      setIsCheckingBatch(false);
      triggerToast('当前目录下无可核验的档案要素。', 'warning');
      return;
    }

    triggerToast(`四性安全核验微核已启动，正在核验 ${targetIds.length} 个存证凭证...`, 'info');

    setTimeout(() => {
      setIsCheckingBatch(false);
      // Run status reconciliation and display feedback
      // Highlight any record that fails checks
      const containsIssues = records.some(r => targetIds.includes(r.id) && (!r.checks.real || !r.checks.complete || !r.checks.usable || !r.checks.safe));
      
      if (containsIssues) {
        triggerToast('一键四性检测完成：发现 [可用性] 或 [签章缺陷] 异常节点，请打开详情查看修复说明。', 'warning');
      } else {
        triggerToast('一键四性检测完成：所选凭证验签（真）、哈希比对（完）、版式渲染（可用）、权限脱敏（安）全部通过！', 'success');
      }
    }, 1800);
  };

  // Action: "一键自动组卷" (Auto Voluming装订)
  const handleAutoGroup = () => {
    // Collect records in static "仅件数据" status
    const pendingVoluming = records.filter(r => r.status === '仅件数据' && r.checks.usable);
    if (pendingVoluming.length === 0) {
      triggerToast('暂无可用于组卷的合格件数据（已被阻断或全数组卷）。', 'warning');
      return;
    }

    const updatedRecords = records.map(r => {
      if (r.status === '仅件数据' && r.checks.usable) {
        // Create an official digital book volumeAJ
        const volumeIndex = `AJ-${r.year}${r.month || '05'}-02`;
        
        return {
          ...r,
          status: '已组卷' as const,
          volumeCode: volumeIndex,
          auditLogs: [
            {
              id: `log-auto-group-${Date.now()}`,
              timestamp: '2026-05-30 10:20:00',
              action: '一键自动装订组卷',
              operator: 'jinlinrun198x (首席财务审核官)',
              details: `根据国标 GB/T 18894 标准，将分散件数据自动划分，压入所属案卷: [${volumeIndex}]`,
              ipAddress: '192.168.1.135'
            },
            ...r.auditLogs
          ]
        };
      }
      return r;
    });

    setRecords(updatedRecords);
    triggerToast(`自动组卷成功！已对 ${pendingVoluming.length} 单普通发票及凭据件文件进行封皮卷宗归类装订。`, 'success');
  };

  // Action: "赋予/校验档号" (Calculate official e-archive code structure)
  const handleAssignVerifyCode = () => {
    triggerToast('系统档号校验程序运行：所有电子凭证档号编码结构均契合 GBT-18894 归档元数据国家标准。', 'success');
  };

  // Action: "一键修护可用性" (Repair Usability for warning OFDs)
  const handleRepairUsability = (recordId: string) => {
    const updated = records.map(r => {
      if (r.id === recordId) {
        const fixedCheckDetails = r.checkDetails.map(detail => {
          if (detail.property === 'usable') {
            return {
              ...detail,
              status: 'passed' as const,
              message: '【AI自修复成功】通过系统微服务引擎，动态补全仿宋_GB2312/标宋字体，格式重构无歪斜，已通过全生命周期长效可用度检测。',
              timestamp: '2026-05-30 10:22:00',
              operator: '安全密码机字字库嵌入代理'
            };
          }
          return detail;
        });

        const newAuditLog = {
          id: `log-fix-usable-${Date.now()}`,
          timestamp: '2026-05-30 10:22:15',
          action: '可用性专项故障修复',
          operator: '李四 (系统管理员)',
          details: '用户对缺陷OFD包体执行了一键智能重组，嵌入国家规定标准物理标宋矢量网格字型，解决文字在脱机环境乱码的潜在故障。可用性转化合格。',
          ipAddress: '192.168.1.112'
        };

        const updatedRecord = {
          ...r,
          checks: {
            ...r.checks,
            usable: true
          },
          checkDetails: fixedCheckDetails,
          auditLogs: [newAuditLog, ...r.auditLogs]
        };

        // If drawer is currently inspecting this row, push update to inspector drawer state immediately
        if (activeRecord && activeRecord.id === recordId) {
          setActiveRecord(updatedRecord);
        }

        return updatedRecord;
      }
      return r;
    });

    setRecords(updated);
    triggerToast('可用性致命破损已一键修复！标宋矢量字重网格已经静态重编码进包体。', 'success');
  };

  // Action: Delete custom archive from state
  const handleDeleteRecord = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm('是否确定删除该电子会计档案组件？此行为会彻底清除该卡节点及所算签名链。')) {
      setRecords(prev => prev.filter(r => r.id !== id));
      triggerToast('档案凭证已被彻底擦除，审计锁链失效注销。', 'warning');
    }
  };

  // Action: Upload Callback Append record
  const handleUploadSuccess = (newRecord: ArchiveRecord) => {
    setRecords(prev => [newRecord, ...prev]);
    triggerToast(`数电凭证 [${newRecord.voucherNo}] 智能读取采集并封锁归账（件数据，等待组卷）。`, 'success');
  };

  return (
    <div id="smart-accounting-root" className="min-h-screen bg-slate-50 flex text-slate-800 font-sans antialiased selection:bg-blue-500 selection:text-white">
      
      {/* Visual Feedback Toasts */}
      {feedbackToast && (
        <div 
          id="custom-toast-pill" 
          className={`fixed top-4 left-1/2 -translate-x-1/2 z-50 p-4 rounded-xl shadow-xl flex items-center gap-2.5 max-w-lg border text-xs font-bold transition-all animate-bounce ${
            feedbackToast.type === 'success' 
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800' 
              : feedbackToast.type === 'warning'
                ? 'bg-amber-50 border-amber-200 text-amber-800'
                : 'bg-blue-50 border-blue-200 text-blue-800'
          }`}
        >
          {feedbackToast.type === 'success' && <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />}
          {feedbackToast.type === 'warning' && <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />}
          {feedbackToast.type === 'info' && <Info className="w-4 h-4 text-blue-600 shrink-0" />}
          <span>{feedbackToast.message}</span>
        </div>
      )}

      {/* LEFT SIDEBAR: Static Enterprise Menu matching el-aside class="main-sidebar" */}
      <aside className="hidden md:flex flex-col w-[260px] bg-[#F8FAFC] shrink-0 min-h-screen text-slate-600 border-r border-slate-200 transition-all duration-300 shadow-[2px_0_8px_-4px_rgba(0,0,0,0.05)]">
        {/* LOGO AREA: system-logo */}
        <div className="h-[76px] bg-[#F8FAFC] flex items-center justify-between px-4 shrink-0 select-none border-b border-slate-200">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-indigo-600 rounded-xl text-white shadow-md shadow-indigo-600/20 flex items-center justify-center w-8 h-8 shrink-0">
              <Grid className="w-4 h-4 font-extrabold" />
            </div>
            <div className="flex flex-col">
              <span className="font-bold text-slate-800 text-[14px] tracking-wide leading-tight">会计档案管理系统</span>
            </div>
          </div>
          <button 
            type="button" 
            onClick={() => setIsMenuSettingsOpen(true)}
            className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-slate-100/80 rounded-md transition-colors" 
            title="自定义菜单"
          >
            <Settings className="w-4 h-4" />
          </button>
        </div>

        {/* SCROLLABLE SIDEBAR MENU */}
        <nav className="flex-1 overflow-y-auto py-4 space-y-4 font-sans text-sm select-none">
          {/* 1. 档案接收 (isRcvGroupOpen) */}
          {visibleMenus.rcv && (
          <div className="space-y-1">
            <button 
              type="button"
              onClick={() => setIsRcvGroupOpen(!isRcvGroupOpen)}
              className="w-[calc(100%-24px)] flex items-center justify-between mx-3 py-2 px-4 text-sm font-extrabold text-indigo-700 bg-indigo-50/50 rounded-lg uppercase tracking-wider hover:text-indigo-900 hover:bg-indigo-50 transition-all cursor-pointer text-left"
            >
              <span className="flex items-center gap-2">
                <Upload className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                <span>档案接收</span>
              </span>
              {isRcvGroupOpen ? <ChevronDown className="w-3.5 h-3.5 text-indigo-600" /> : <ChevronRight className="w-3.5 h-3.5 text-slate-400" />}
            </button>

            {isRcvGroupOpen && (
              <div className="space-y-1 mt-1 pl-1">
                <button
                  type="button"
                  onClick={() => {
                    setActiveMainMenu('archive-offline');
                    triggerToast('进入档案离线接收页面', 'info');
                  }}
                  className={`w-[calc(100%-24px)] flex items-center gap-3 mx-3 py-2 px-4 font-medium rounded-xl transition-all border-l-4 cursor-pointer text-left ${
                    activeMainMenu === 'archive-offline'
                      ? 'bg-[#EEF2FF] text-[#4F46E5] border-l-[#4F46E5] font-bold shadow-xs'
                      : 'text-slate-600 hover:bg-slate-100/80 hover:text-slate-900 border-l-transparent'
                  }`}
                >
                  <Database className={`w-4 h-4 shrink-0 ${activeMainMenu === 'archive-offline' ? 'text-indigo-600' : 'text-sky-500'}`} />
                  <span>档案离线接收</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setActiveMainMenu('archive-rcv');
                    triggerToast('进入档案接收业务中台', 'info');
                  }}
                  className={`w-[calc(100%-24px)] flex items-center gap-3 mx-3 py-2 px-4 font-medium rounded-xl transition-all border-l-4 cursor-pointer text-left ${
                    activeMainMenu === 'archive-rcv'
                      ? 'bg-[#EEF2FF] text-[#4F46E5] border-l-[#4F46E5] font-bold shadow-xs'
                      : 'text-slate-600 hover:bg-slate-100/80 hover:text-slate-900 border-l-transparent'
                  }`}
                >
                  <Upload className={`w-4 h-4 shrink-0 ${activeMainMenu === 'archive-rcv' ? 'text-indigo-600' : 'text-blue-500'}`} />
                  <span>档案接收业务中台</span>
                </button>
              </div>
            )}
          </div>
          )}

          {/* 2. 档案整理 (isArrangeGroupOpen) */}
          {visibleMenus.arrange && (
          <div className="space-y-1">
            <button 
              type="button"
              onClick={() => setIsArrangeGroupOpen(!isArrangeGroupOpen)}
              className="w-[calc(100%-24px)] flex items-center justify-between mx-3 py-2 px-4 text-sm font-extrabold text-emerald-700 bg-emerald-50/50 rounded-lg uppercase tracking-wider hover:text-emerald-900 hover:bg-emerald-50 transition-all cursor-pointer text-left"
            >
              <span className="flex items-center gap-2">
                <Layers className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                <span>档案整理</span>
              </span>
              {isArrangeGroupOpen ? <ChevronDown className="w-3.5 h-3.5 text-emerald-600" /> : <ChevronRight className="w-3.5 h-3.5 text-slate-400" />}
            </button>

            {isArrangeGroupOpen && (
              <div className="space-y-1 mt-1 pl-1">
                <button
                  type="button"
                  onClick={() => {
                    setActiveMainMenu('view-finance');
                    triggerToast('进入财务类视图', 'info');
                  }}
                  className={`w-[calc(100%-24px)] flex items-center gap-3 mx-3 py-2 px-4 font-medium rounded-xl transition-all border-l-4 cursor-pointer text-left ${
                    activeMainMenu === 'view-finance'
                      ? 'bg-[#EEF2FF] text-[#4F46E5] border-l-[#4F46E5] font-bold shadow-xs'
                      : 'text-slate-600 hover:bg-slate-100/80 hover:text-slate-900 border-l-transparent'
                  }`}
                >
                  <FolderTree className={`w-4 h-4 shrink-0 ${activeMainMenu === 'view-finance' ? 'text-indigo-600' : 'text-blue-500'}`} />
                  <span>财务大类视图</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setActiveMainMenu('view-project');
                    triggerToast('进入项目全景视图', 'info');
                  }}
                  className={`w-[calc(100%-24px)] flex items-center gap-3 mx-3 py-2 px-4 font-medium rounded-xl transition-all border-l-4 cursor-pointer text-left ${
                    activeMainMenu === 'view-project'
                      ? 'bg-[#EEF2FF] text-[#10B981] border-l-[#10B981] font-bold shadow-xs'
                      : 'text-slate-600 hover:bg-slate-100/80 hover:text-slate-900 border-l-transparent'
                  }`}
                >
                  <Briefcase className={`w-4 h-4 shrink-0 ${activeMainMenu === 'view-project' ? 'text-emerald-600' : 'text-emerald-500'}`} />
                  <span>项目全景视图</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setActiveMainMenu('view-time');
                    triggerToast('进入时间主线视图', 'info');
                  }}
                  className={`w-[calc(100%-24px)] flex items-center gap-3 mx-3 py-2 px-4 font-medium rounded-xl transition-all border-l-4 cursor-pointer text-left ${
                    activeMainMenu === 'view-time'
                      ? 'bg-[#EEF2FF] text-[#3B82F6] border-l-[#3B82F6] font-bold shadow-xs'
                      : 'text-slate-600 hover:bg-slate-100/80 hover:text-slate-900 border-l-transparent'
                  }`}
                >
                  <Clock className={`w-4 h-4 shrink-0 ${activeMainMenu === 'view-time' ? 'text-blue-600' : 'text-sky-500'}`} />
                  <span>时间主线视图</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setActiveMainMenu('smart-data');
                    triggerToast('进入数电清洗与分册插卷计算模块', 'info');
                  }}
                  className={`w-[calc(100%-24px)] flex items-center gap-3 mx-3 py-2 px-4 font-medium rounded-xl transition-all border-l-4 cursor-pointer text-left ${
                    activeMainMenu === 'smart-data'
                      ? 'bg-[#EEF2FF] text-[#4F46E5] border-l-[#4F46E5] font-bold shadow-xs'
                      : 'text-slate-600 hover:bg-slate-100/80 hover:text-slate-900 border-l-transparent'
                  }`}
                >
                  <Cpu className={`w-4 h-4 shrink-0 ${activeMainMenu === 'smart-data' ? 'text-[#4F46E5]' : 'text-pink-505'}`} />
                  <span>数据智能处理 (插卷)</span>
                </button>
              </div>
            )}
          </div>
          )}

          {/* 3. 档案保存 (isPreserveGroupOpen) */}
          {visibleMenus.preserve && (
          <div className="space-y-1">
            <button 
              type="button"
              onClick={() => setIsPreserveGroupOpen(!isPreserveGroupOpen)}
              className="w-[calc(100%-24px)] flex items-center justify-between mx-3 py-2 px-4 text-sm font-extrabold text-blue-700 bg-blue-50/50 rounded-lg uppercase tracking-wider hover:text-blue-900 hover:bg-blue-50 transition-all cursor-pointer text-left"
            >
              <span className="flex items-center gap-2">
                <Database className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                <span>档案保存</span>
              </span>
              {isPreserveGroupOpen ? <ChevronDown className="w-3.5 h-3.5 text-blue-600" /> : <ChevronRight className="w-3.5 h-3.5 text-slate-400" />}
            </button>

            {isPreserveGroupOpen && (
              <div className="space-y-1 mt-1 pl-1">
                <button
                  type="button"
                  onClick={() => {
                    setActiveMainMenu('digital-warehouse');
                    triggerToast('进入数字化实体虚拟库房映射与生命管理', 'info');
                  }}
                  className={`w-[calc(100%-24px)] flex items-center gap-3 mx-3 py-2 px-4 font-medium rounded-xl transition-all border-l-4 cursor-pointer text-left ${
                    activeMainMenu === 'digital-warehouse'
                      ? 'bg-[#EEF2FF] text-[#4F46E5] border-l-[#4F46E5] font-bold shadow-xs'
                      : 'text-slate-600 hover:bg-slate-100/80 hover:text-slate-900 border-l-transparent'
                  }`}
                >
                  <Building2 className={`w-4 h-4 shrink-0 ${activeMainMenu === 'digital-warehouse' ? 'text-[#4F46E5]' : 'text-indigo-400'}`} />
                  <span>数字化虚拟库房</span>
                </button>

                <button
                  type="button"
                  onClick={() => setActiveMainMenu('config-fanzong')}
                  className={`w-[calc(100%-24px)] flex items-center gap-3 mx-3 py-2 px-4 font-medium rounded-xl transition-all border-l-4 cursor-pointer text-left ${
                    activeMainMenu === 'config-fanzong'
                      ? 'bg-[#EEF2FF] text-[#4F46E5] border-l-[#4F46E5] font-bold shadow-xs'
                      : 'text-slate-600 hover:bg-slate-100/80 hover:text-slate-900 border-l-transparent'
                  }`}
                >
                  <Building2 className={`w-4 h-4 shrink-0 ${activeMainMenu === 'config-fanzong' ? 'text-[#4F46E5]' : 'text-indigo-500'}`} />
                  <span>全宗管理</span>
                </button>
              </div>
            )}
          </div>
          )}

          {/* 4. 档案利用 (isUtilGroupOpen) */}
          {visibleMenus.util && (
          <div className="space-y-1">
            <button 
              type="button"
              onClick={() => setIsUtilGroupOpen(!isUtilGroupOpen)}
              className="w-[calc(100%-24px)] flex items-center justify-between mx-3 py-2 px-4 text-sm font-extrabold text-amber-700 bg-amber-50/50 rounded-lg uppercase tracking-wider hover:text-amber-900 hover:bg-amber-50 transition-all cursor-pointer text-left"
            >
              <span className="flex items-center gap-2">
                <Notebook className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                <span>档案利用</span>
              </span>
              {isUtilGroupOpen ? <ChevronDown className="w-3.5 h-3.5 text-amber-600" /> : <ChevronRight className="w-3.5 h-3.5 text-slate-400" />}
            </button>

            {isUtilGroupOpen && (
              <div className="space-y-1 mt-1 pl-1">
                <button
                  type="button"
                  onClick={() => {
                    setActiveMainMenu('wf-control');
                    triggerToast('进入审批流协同网络中心', 'info');
                  }}
                  className={`w-[calc(100%-24px)] flex items-center gap-3 mx-3 py-2 px-4 font-medium rounded-xl transition-all border-l-4 cursor-pointer text-left ${
                    activeMainMenu === 'wf-control'
                      ? 'bg-[#EEF2FF] text-[#4F46E5] border-l-[#4F46E5] font-bold shadow-xs'
                      : 'text-slate-600 hover:bg-slate-100/80 hover:text-slate-900 border-l-transparent'
                  }`}
                >
                  <CheckCircle2 className={`w-4 h-4 shrink-0 ${activeMainMenu === 'wf-control' ? 'text-indigo-600' : 'text-emerald-500'}`} />
                  <span>使用审批管控 (线上化)</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setActiveMainMenu('borrow-manage');
                    triggerToast('进入多维档案借阅控制矩阵', 'info');
                  }}
                  className={`w-[calc(100%-24px)] flex items-center gap-3 mx-3 py-2 px-4 font-medium rounded-xl transition-all border-l-4 cursor-pointer text-left ${
                    activeMainMenu === 'borrow-manage'
                      ? 'bg-[#EEF2FF] text-[#4F46E5] border-l-[#4F46E5] font-bold shadow-xs'
                      : 'text-slate-600 hover:bg-slate-100/80 hover:text-slate-900 border-l-transparent'
                  }`}
                >
                  <Notebook className={`w-4 h-4 shrink-0 ${activeMainMenu === 'borrow-manage' ? 'text-[#4F46E5]' : 'text-amber-500'}`} />
                  <span>借阅业务精细管控</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setActiveMainMenu('return-manage');
                    triggerToast('进入归还与催还闭环专区', 'info');
                  }}
                  className={`w-[calc(100%-24px)] flex items-center gap-3 mx-3 py-2 px-4 font-medium rounded-xl transition-all border-l-4 cursor-pointer text-left ${
                    activeMainMenu === 'return-manage'
                      ? 'bg-[#EEF2FF] text-[#4F46E5] border-l-[#4F46E5] font-bold shadow-xs'
                      : 'text-slate-600 hover:bg-slate-100/80 hover:text-slate-900 border-l-transparent'
                  }`}
                >
                  <Check className={`w-4 h-4 shrink-0 ${activeMainMenu === 'return-manage' ? 'text-indigo-600' : 'text-green-500'}`} />
                  <span>归还与催还闭环</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setActiveMainMenu('order-special');
                    triggerToast('进入借单专项全周期精细监控', 'info');
                  }}
                  className={`w-[calc(100%-24px)] flex items-center gap-3 mx-3 py-2 px-4 font-medium rounded-xl transition-all border-l-4 cursor-pointer text-left ${
                    activeMainMenu === 'order-special'
                      ? 'bg-[#EEF2FF] text-[#4F46E5] border-l-[#4F46E5] font-bold shadow-xs'
                      : 'text-slate-600 hover:bg-slate-100/80 hover:text-slate-900 border-l-transparent'
                  }`}
                >
                  <Ticket className={`w-4 h-4 shrink-0 ${activeMainMenu === 'order-special' ? 'text-[#4F46E5]' : 'text-teal-500'}`} />
                  <span>借单专项生命周期</span>
                </button>
              </div>
            )}
          </div>
          )}

          {/* 5. 档案处置 (isDisposalGroupOpen) */}
          {visibleMenus.disposal && (
          <div className="space-y-1">
            <button 
              type="button"
              onClick={() => setIsDisposalGroupOpen(!isDisposalGroupOpen)}
              className="w-[calc(100%-24px)] flex items-center justify-between mx-3 py-2 px-4 text-sm font-extrabold text-rose-700 bg-rose-50/50 rounded-lg uppercase tracking-wider hover:text-rose-900 hover:bg-rose-50 transition-all cursor-pointer text-left"
            >
              <span className="flex items-center gap-2">
                <Trash2 className="w-3.5 h-3.5 text-rose-600 shrink-0" />
                <span>档案处置</span>
              </span>
              {isDisposalGroupOpen ? <ChevronDown className="w-3.5 h-3.5 text-rose-600" /> : <ChevronRight className="w-3.5 h-3.5 text-slate-400" />}
            </button>

            {isDisposalGroupOpen && (
              <div className="space-y-1 mt-1 pl-1">
                <button
                  type="button"
                  onClick={() => {
                    setActiveMainMenu('digital-warehouse');
                    triggerToast('进入虚拟库房：请下拉至页面底部【会计防销毁与会签鉴定】模块。', 'info');
                  }}
                  className={`w-[calc(100%-24px)] flex items-center gap-3 mx-3 py-2 px-4 font-medium rounded-xl transition-all border-l-4 cursor-pointer text-left ${
                    activeMainMenu === 'digital-warehouse'
                      ? 'bg-[#EEF2FF] text-[#4F46E5] border-l-[#4F46E5] font-bold shadow-xs'
                      : 'text-slate-600 hover:bg-slate-100/80 hover:text-slate-900 border-l-transparent'
                  }`}
                >
                  <Trash2 className={`w-4 h-4 shrink-0 ${activeMainMenu === 'digital-warehouse' ? 'text-rose-600' : 'text-rose-450'}`} />
                  <span>到期销毁与合规会签</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setActiveMainMenu('config-workflow');
                    triggerToast('进入保障时效监督工作流配置', 'info');
                  }}
                  className={`w-[calc(100%-24px)] flex items-center gap-3 mx-3 py-2 px-4 font-medium rounded-xl transition-all border-l-4 cursor-pointer text-left ${
                    activeMainMenu === 'config-workflow'
                      ? 'bg-[#EEF2FF] text-[#4F46E5] border-l-[#4F46E5] font-bold shadow-xs'
                      : 'text-slate-600 hover:bg-slate-100/80 hover:text-slate-900 border-l-transparent'
                  }`}
                >
                  <Briefcase className={`w-4 h-4 shrink-0 ${activeMainMenu === 'config-workflow' ? 'text-[#4F46E5]' : 'text-slate-400'}`} />
                  <span>工作流配置</span>
                </button>
              </div>
            )}
          </div>
          )}

          {/* 6. 档案统计 (isStatsGroupOpen) */}
          {visibleMenus.stats && (
          <div className="space-y-1">
            <button 
              type="button"
              onClick={() => setIsStatsGroupOpen(!isStatsGroupOpen)}
              className="w-[calc(100%-24px)] flex items-center justify-between mx-3 py-2 px-4 text-sm font-extrabold text-blue-800 bg-indigo-50/50 rounded-lg uppercase tracking-wider hover:text-indigo-900 hover:bg-indigo-50 transition-all cursor-pointer text-left"
            >
              <span className="flex items-center gap-2">
                <Activity className="w-3.5 h-3.5 text-indigo-700 shrink-0" />
                <span>档案统计</span>
              </span>
              {isStatsGroupOpen ? <ChevronDown className="w-3.5 h-3.5 text-indigo-700" /> : <ChevronRight className="w-3.5 h-3.5 text-slate-400" />}
            </button>

            {isStatsGroupOpen && (
              <div className="space-y-1 mt-1 pl-1">
                <button
                  type="button"
                  onClick={() => {
                    setActiveMainMenu('dashboard');
                    triggerToast('进入档案统计仪表盘', 'info');
                  }}
                  className={`w-[calc(100%-24px)] flex items-center gap-3 mx-3 py-2.5 px-4 font-medium rounded-xl transition-all border-l-4 cursor-pointer text-left ${
                    activeMainMenu === 'dashboard'
                      ? 'bg-[#EEF2FF] text-[#4F46E5] border-l-[#4F46E5] font-bold shadow-xs'
                      : 'text-slate-600 hover:bg-slate-100/80 hover:text-slate-900 border-l-transparent'
                  }`}
                >
                  <Grid className={`w-4 h-4 shrink-0 ${activeMainMenu === 'dashboard' ? 'text-[#4F46E5]' : 'text-indigo-400'}`} />
                  <span>档案统计仪表盘</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setActiveMainMenu('search-stats');
                    triggerToast('进入多维度大盘查询与统计分析', 'info');
                  }}
                  className={`w-[calc(100%-24px)] flex items-center gap-3 mx-3 py-2 px-4 font-medium rounded-xl transition-all border-l-4 cursor-pointer text-left ${
                    activeMainMenu === 'search-stats'
                      ? 'bg-[#EEF2FF] text-[#4F46E5] border-l-[#4F46E5] font-bold shadow-xs'
                      : 'text-slate-600 hover:bg-slate-100/80 hover:text-slate-900 border-l-transparent'
                  }`}
                >
                  <Search className={`w-4 h-4 shrink-0 ${activeMainMenu === 'search-stats' ? 'text-indigo-600' : 'text-indigo-500'}`} />
                  <span>查询统计分析 (三模式)</span>
                </button>
              </div>
            )}
          </div>
          )}



          {/* 9. 系统设置 (isSystemGroupOpen) */}
          {visibleMenus.system && (
          <div className="space-y-1">
            <button 
              type="button"
              onClick={() => setIsSystemGroupOpen(!isSystemGroupOpen)}
              className="w-[calc(100%-24px)] flex items-center justify-between mx-3 py-2 px-4 text-sm font-bold text-slate-400 uppercase tracking-wider hover:text-slate-700 cursor-pointer text-left"
            >
              <span className="flex items-center gap-1.5">
                <Shield className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                <span>系统设置</span>
              </span>
              {isSystemGroupOpen ? <ChevronDown className="w-3.5 h-3.5 text-indigo-500" /> : <ChevronRight className="w-3.5 h-3.5 text-slate-400" />}
            </button>

            {isSystemGroupOpen && (
              <div className="space-y-1 mt-1 pl-1">
                <button
                  type="button"
                  onClick={() => setActiveMainMenu('sys-org')}
                  className={`w-[calc(100%-24px)] flex items-center gap-3 mx-3 py-2 px-4 font-medium rounded-xl transition-all border-l-4 cursor-pointer text-left ${
                    activeMainMenu === 'sys-org'
                      ? 'bg-[#EEF2FF] text-[#4F46E5] border-l-[#4F46E5] font-bold shadow-xs'
                      : 'text-slate-600 hover:bg-slate-100/80 hover:text-slate-900 border-l-transparent'
                  }`}
                >
                  <Users className={`w-4 h-4 shrink-0 ${activeMainMenu === 'sys-org' ? 'text-[#4F46E5]' : 'text-indigo-500'}`} />
                  <span>组织部门管理</span>
                </button>

                <button
                  type="button"
                  onClick={() => setActiveMainMenu('sys-user')}
                  className={`w-[calc(100%-24px)] flex items-center gap-3 mx-3 py-2 px-4 font-medium rounded-xl transition-all border-l-4 cursor-pointer text-left ${
                    activeMainMenu === 'sys-user'
                      ? 'bg-[#EEF2FF] text-[#4F46E5] border-l-[#4F46E5] font-bold shadow-xs'
                      : 'text-slate-600 hover:bg-slate-100/80 hover:text-slate-900 border-l-transparent'
                  }`}
                >
                  <Shield className={`w-4 h-4 shrink-0 ${activeMainMenu === 'sys-user' ? 'text-indigo-650' : 'text-amber-500'}`} />
                  <span>人员角色授权</span>
                </button>

                <button
                  type="button"
                  onClick={() => setActiveMainMenu('sys-log')}
                  className={`w-[calc(100%-24px)] flex items-center gap-3 mx-3 py-2 px-4 font-medium rounded-xl transition-all border-l-4 cursor-pointer text-left ${
                    activeMainMenu === 'sys-log'
                      ? 'bg-[#EEF2FF] text-[#4F46E5] border-l-[#4F46E5] font-bold shadow-xs'
                      : 'text-slate-600 hover:bg-slate-100/80 hover:text-slate-955 hover:text-slate-900 border-l-transparent'
                  }`}
                >
                  <Fingerprint className={`w-4 h-4 shrink-0 ${activeMainMenu === 'sys-log' ? 'text-indigo-650' : 'text-amber-600'}`} />
                  <span>安全审计日志</span>
                </button>
              </div>
            )}
          </div>
          )}
        </nav>

        {/* BOTTOM SAFETY LOCKOUT CONTROLLER */}
        <div className="p-4 border-t border-slate-200 bg-[#F1F5F9]/50 select-none">
          <button
            type="button"
            onClick={() => {
              triggerToast('已安全锁定并退出国税电子物理账单协同控制台。', 'warning');
              setActiveMainMenu('sys-org'); // defaults back safely
            }}
            className="w-full py-2.5 px-3 bg-white border border-slate-250 text-slate-700 hover:bg-rose-50 hover:text-rose-600 hover:border-rose-200 rounded-xl font-bold flex items-center justify-center gap-2 transition-all shadow-xs cursor-pointer text-xs"
          >
            <Shield className="w-4 h-4" />
            <span>安全退出控制台</span>
          </button>
        </div>
      </aside>

      {/* RIGHT CONTENT PANEL WORKSPACE */}
      <div className="flex-1 min-w-0 flex flex-col h-screen overflow-y-auto">

        {/* Main Header (Dynamic title matching current routing/tabs) */}
        <header className="bg-white/95 backdrop-blur-md border-b border-slate-200/80 px-6 py-4 flex items-center justify-between text-slate-800 shrink-0 sticky top-0 z-40 select-none shadow-xs">
          <div className="flex items-center gap-3">
            <button 
              onClick={() => setMobileSidebarOpen(prev => !prev)}
              className="md:hidden p-1.5 hover:bg-slate-100 rounded text-slate-500 hover:text-slate-800 transition-colors cursor-pointer"
              id="mobile-sidebar-toggle"
            >
              <Menu className="w-5 h-5" />
            </button>
            
            <div className="inline-flex p-2 bg-indigo-50 border border-indigo-100 text-indigo-600 rounded-xl select-none">
              <Award className="w-5 h-5 text-indigo-600" />
            </div>
            <div>
              <span className="text-xs font-bold text-indigo-600 block tracking-wider uppercase select-none">
                {activeMainMenu === 'dashboard' && '档案统计分析'}
                {activeMainMenu === 'view-finance' && '财务类视图'}
                {activeMainMenu === 'view-project' && '项目全景视图'}
                {activeMainMenu === 'view-time' && '时间主线视图'}
                {activeMainMenu === 'archive-offline' && '离线传输・核心包解压'}
                {activeMainMenu === 'archive-rcv' && '全局引擎・多端业务聚合'}
                {activeMainMenu === 'wf-control' && '审批管理・移动办公同步'}
                {activeMainMenu === 'borrow-manage' && '借阅管控・精细查阅台账'}
                {activeMainMenu === 'return-manage' && '还件管控・状态催缴核销'}
                {activeMainMenu === 'search-stats' && '决策分析・综合经营大盘'}
                {activeMainMenu === 'smart-data' && '清洗引擎・插数计算工具'}
                {activeMainMenu === 'order-special' && '专项借单・多介质物理卡链'}
                {activeMainMenu === 'digital-warehouse' && '虚拟库房・密集实体与存储HSM'}
                {activeMainMenu !== 'dashboard' && activeMainMenu !== 'view-finance' && activeMainMenu !== 'view-project' && activeMainMenu !== 'view-time' &&
                 activeMainMenu !== 'archive-offline' && activeMainMenu !== 'archive-rcv' && 
                 activeMainMenu !== 'wf-control' && activeMainMenu !== 'borrow-manage' && 
                 activeMainMenu !== 'return-manage' && activeMainMenu !== 'search-stats' && 
                 activeMainMenu !== 'smart-data' && activeMainMenu !== 'order-special' && 
                 activeMainMenu !== 'digital-warehouse' && '国税电子档案合规子系统'}
              </span>
              <h1 className="text-sm md:text-base font-bold tracking-tight text-slate-900">
                {activeMainMenu === 'dashboard' && '全宗数字化资产运行大屏与合规审计看板'}
                {activeMainMenu === 'view-finance' && '电子会计档案“四性”全生命周期质检明细台账 (财务维)'}
                {activeMainMenu === 'view-project' && '电子会计档案“四性”全生命周期质检明细台账 (项目维)'}
                {activeMainMenu === 'view-time' && '电子会计档案“四性”全生命周期质检明细台账 (时间维)'}
                {activeMainMenu === 'archive-offline' && '档案离线接收与本地数据包解析导入'}
                {activeMainMenu === 'archive-rcv' && '前端业务系统分离聚拢：解耦异构系统 (OA/费控/ERP) 主键匹配与 SIP 组装'}
                {activeMainMenu === 'wf-control' && '档案使用审批全流程管控（对接协同办公系统实时同步）'}
                {activeMainMenu === 'borrow-manage' && '标准化电子会计凭证借阅清单与多维条件定位'}
                {activeMainMenu === 'return-manage' && '档案归还多维度核对与超期自动催缴督办网'}
                {activeMainMenu === 'search-stats' && '多维档案查阅与经营周期全要素数据统计分析 (三模式)'}
                {activeMainMenu === 'smart-data' && '电子会计凭证特殊字符清洗与分册插卷计算模块'}
                {activeMainMenu === 'order-special' && '借调单专项生命周期精细化管理 (纸质实体与电子介质)'}
                {activeMainMenu === 'digital-warehouse' && '实体库房与电子多介质生命周期闭环自适应微控 (密集架+HSM+销毁审批)'}
                {activeMainMenu === 'config-fanzong' && '全宗管理：会计全宗一元化底座定义仪表盘'}
                {activeMainMenu === 'config-directory' && '目录设置：多维业财矩阵档案编目与查阅体系'}
                {activeMainMenu === 'config-workflow' && '多维电子证据链防篡改审计工作流组件'}
                {activeMainMenu === 'sys-org' && '组织部门：企业行政层架与部门 Authority 定界'}
                {activeMainMenu === 'sys-user' ? '人员角色：系统主管/审计/录入员 ACE 细粒度授权' : ''}
                {activeMainMenu === 'sys-log' ? '安全审计日志：全通道不可逆区块链验存留痕' : ''}
              </h1>
            </div>
          </div>
 
          <div className="flex items-center gap-4 text-xs font-sans">
            <div className="hidden xl:flex items-center gap-2 bg-slate-100 px-3 py-1.5 rounded-xl border border-slate-200 text-slate-500">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              <span>密链盾安全防御已载入</span>
            </div>
 
            {/* HIGHLY INTERACTIVE AND POLISHED AVATAR PORTAL WITH FONDS SWITCHER */}
            <div 
              id="avatar-fonds-selector-portal"
              className="flex items-center gap-3 bg-white border border-slate-200 p-1.5 pl-3.5 pr-2.5 rounded-2xl select-none transition-all hover:bg-slate-50 hover:border-slate-300 shadow-xs"
            >
              {/* Left Column: Switcher with Dropdown arrow */}
              <div className="flex flex-col text-right">
                <span className="text-[9px] text-slate-500 uppercase tracking-wider font-extrabold block mb-0.5">主全宗（公司实体）</span>
                <div className="relative flex items-center gap-1">
                  <select 
                    value={currentFanzongCode}
                    onChange={(e) => {
                      const val = e.target.value;
                      setCurrentFanzongCode(val);
                      
                      // Automatically trigger tree node selection of matching Fonds to auto-filter the table
                      const matchingNode = treeData.find(node => node.type === 'fonds' && node.code === val);
                      if (matchingNode) {
                        setSelectedNode(matchingNode);
                      }
                      triggerToast(`业务全宗已切换，当前执照：${fanzongs.find(f => f.code === val)?.name || val}`, 'success');
                    }}
                    className="bg-transparent text-slate-800 font-extrabold text-[11px] focus:outline-none cursor-pointer pr-4 appearance-none font-sans max-w-[140px] md:max-w-[200px] truncate"
                  >
                    {fanzongs.map(f => (
                      <option key={f.code} value={f.code} className="bg-white text-slate-800 font-semibold text-xs">
                        {f.code} {f.name.split('（')[1]?.split('）')[0] || f.name} {f.status === 'inactive' ? '[挂起]' : ''}
                      </option>
                    ))}
                  </select>
                  {/* Absolute chevron pointer to keep it beautifully aligned */}
                  <ChevronDown className="w-3.5 h-3.5 text-slate-500 absolute right-0 pointer-events-none" />
                </div>
              </div>
 
              {/* Vertical divider line */}
              <div className="h-6 w-px bg-slate-200" />
 
              {/* Right Column: User Avatar and Badge */}
              <div className="flex items-center gap-2">
                <div className="relative">
                  <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-indigo-600 to-indigo-500 flex items-center justify-center text-white font-bold text-xs shadow border border-indigo-400/20 select-none">
                    AD
                  </div>
                  <span className="absolute -bottom-0.5 -right-0.5 w-2 h-2.5 rounded-full bg-emerald-500 border-2 border-slate-50 animate-pulse" />
                </div>
                <div className="hidden md:flex flex-col text-left">
                  <span className="font-bold text-slate-800 text-xs">admin</span>
                  <span className="text-[10px] text-slate-550 leading-none">安全主管</span>
                </div>
              </div>
            </div>
          </div>
        </header>

        {/* CONTAINER WORK AREA */}
        <main className="flex-1 w-full p-4 sm:p-5 overflow-y-auto">
          {/* 1. DYNAMIC MAIN DASHBOARD ANALYTICS VIEW */}
          {activeMainMenu === 'dashboard' && (
            <div className="space-y-6 animate-in fade-in duration-200">
              {/* Reactive KPI stats metrics bound specifically to current fonds */}
              <StatsDashboard records={currentFondsRecords} />

              {/* Dynamic SVG analytical charts & details */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                
                {/* Chart 1: Accounting category distribution */}
                <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs flex flex-col space-y-4">
                  <div>
                    <h3 className="text-sm font-bold text-slate-800 flex items-center gap-1.5">
                      <Layers className="w-4 h-4 text-blue-600" />
                      <span>当前全宗会计凭证部门与门类构成</span>
                    </h3>
                    <p className="text-[11px] text-slate-500">
                      按凭证主管分类统计已归目的纸电融合档案，体现资产数字化比重。
                    </p>
                  </div>

                  <div className="flex-1 flex flex-col items-center justify-center p-3">
                    {(() => {
                      const ledgerCount = currentFondsRecords.filter(r => r.archiveType === '会计账簿').length;
                      const voucherCount = currentFondsRecords.filter(r => r.archiveType === '记账凭证').length;
                      const reportCount = currentFondsRecords.filter(r => r.archiveType === '财务报告').length;
                      const total = ledgerCount + voucherCount + reportCount;

                      if (total === 0) {
                        return (
                          <div className="text-center py-8 text-slate-400 font-medium text-xs">
                            该全宗当前没有归入凭证
                          </div>
                        );
                      }

                      const radius = 45;
                      const strokeWidth = 12;
                      const circum = 2 * Math.PI * radius; // ~282.74

                      const voucherPct = voucherCount / total;
                      const ledgerPct = ledgerCount / total;
                      const reportPct = reportCount / total;

                      const dashVoucher = circum * voucherPct;
                      const dashLedger = circum * ledgerPct;
                      const dashReport = circum * reportPct;

                      return (
                        <div className="w-full flex flex-col sm:flex-row items-center justify-around gap-4">
                          <div className="relative w-32 h-32 flex items-center justify-center shrink-0">
                            <svg className="w-28 h-28 -rotate-90 text-slate-100" viewBox="0 0 120 120">
                              <circle cx="60" cy="60" r={radius} fill="transparent" stroke="currentColor" strokeWidth={strokeWidth} />
                              <circle 
                                cx="60" cy="60" r={radius} fill="transparent" 
                                stroke="#1e90ff" strokeWidth={strokeWidth} 
                                strokeDasharray={`${dashVoucher} ${circum}`}
                              />
                              <circle 
                                cx="60" cy="60" r={radius} fill="transparent" 
                                stroke="#f39c12" strokeWidth={strokeWidth} 
                                strokeDasharray={`${dashLedger} ${circum}`}
                                strokeDashoffset={-dashVoucher}
                              />
                              <circle 
                                cx="60" cy="60" r={radius} fill="transparent" 
                                stroke="#9b59b6" strokeWidth={strokeWidth} 
                                strokeDasharray={`${dashReport} ${circum}`}
                                strokeDashoffset={-(dashVoucher + dashLedger)}
                              />
                            </svg>
                            <div className="absolute text-center select-none">
                              <strong className="text-xl font-mono font-bold text-slate-800">{total}</strong>
                              <span className="block text-[9px] text-slate-400 font-bold uppercase">挂接件数</span>
                            </div>
                          </div>

                          <div className="space-y-2 text-xs text-slate-600 flex-1 w-full sm:w-auto">
                            <div className="flex items-center justify-between">
                              <span className="flex items-center gap-1.5 font-bold">
                                <span className="w-2 rounded-full h-2 bg-[#1e90ff] shrink-0" />
                                <span>记账凭证</span>
                              </span>
                              <strong className="font-mono text-slate-800">{voucherCount}件 ({(voucherPct * 100).toFixed(0)}%)</strong>
                            </div>
                            <div className="flex items-center justify-between">
                              <span className="flex items-center gap-1.5 font-bold">
                                <span className="w-2 rounded-full h-2 bg-[#f39c12] shrink-0" />
                                <span>会计账簿</span>
                              </span>
                              <strong className="font-mono text-slate-800">{ledgerCount}件 ({(ledgerPct * 100).toFixed(0)}%)</strong>
                            </div>
                            <div className="flex items-center justify-between">
                              <span className="flex items-center gap-1.5 font-bold">
                                <span className="w-2 rounded-full h-2 bg-[#9b59b6] shrink-0" />
                                <span>财务报告</span>
                              </span>
                              <strong className="font-mono text-slate-800">{reportCount}件 ({(reportPct * 100).toFixed(0)}%)</strong>
                            </div>
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                </div>

                {/* Chart 2: Four Properties compliance radar metrics */}
                <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs flex flex-col space-y-4">
                  <div>
                    <h3 className="text-sm font-bold text-slate-800 flex items-center gap-1.5">
                      <Shield className="w-4 h-4 text-emerald-600" />
                      <span>会计电子档案“四性”高合规检测率</span>
                    </h3>
                    <p className="text-[11px] text-slate-500">
                      根据 GB/T 39719-2020 标准，验证真实、完整、可用与法律效力安全性。
                    </p>
                  </div>

                  <div className="flex-1 space-y-3 pt-1">
                    {(() => {
                      const total = currentFondsRecords.length;
                      if (total === 0) {
                        return <div className="text-slate-400 text-xs py-10 text-center font-medium">暂无核检数据</div>;
                      }

                      const realPass = currentFondsRecords.filter(r => r.checks.real).length;
                      const completePass = currentFondsRecords.filter(r => r.checks.complete).length;
                      const usablePass = currentFondsRecords.filter(r => r.checks.usable).length;
                      const safePass = currentFondsRecords.filter(r => r.checks.safe).length;

                      const items = [
                        { label: '真实性 (数字CA签章有效性)', val: Math.round((realPass / total) * 100), color: 'bg-blue-500', text: 'text-blue-600' },
                        { label: '完整性 (哈希防篡改闭环率)', val: Math.round((completePass / total) * 100), color: 'bg-emerald-500', text: 'text-emerald-600' },
                        { label: '可用性 (OFD-A/PDF标准兼容性)', val: Math.round((usablePass / total) * 100), color: 'bg-amber-500', text: 'text-amber-600' },
                        { label: '安全性 (权限控制与水印审计)', val: Math.round((safePass / total) * 100), color: 'bg-purple-500', text: 'text-purple-600' },
                      ];

                      return items.map((itm, index) => (
                        <div key={index} className="space-y-1">
                          <div className="flex items-center justify-between text-xs font-semibold">
                            <span className="text-slate-600">{itm.label}</span>
                            <span className={`${itm.text} font-mono font-bold`}>{itm.val}%</span>
                          </div>
                          <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
                            <div className={`${itm.color} h-full rounded-full transition-all duration-500`} style={{ width: `${itm.val}%` }} />
                          </div>
                        </div>
                      ));
                    })()}
                  </div>
                </div>

                {/* Chart 3: Corporate Physical Location and Preservation Indicators */}
                <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs flex flex-col space-y-4">
                  <div>
                    <h3 className="text-sm font-bold text-slate-800 flex items-center gap-1.5">
                      <Building2 className="w-4 h-4 text-teal-600" />
                      <span>全宗实体存放与数据对接物理底座</span>
                    </h3>
                    <p className="text-[11px] text-slate-500">
                      当前公司实体的会计核销账套保管基准配置与同步。
                    </p>
                  </div>

                  {(() => {
                    const activeFondsInfo = fanzongs.find(f => f.code === currentFanzongCode);
                    if (!activeFondsInfo) {
                      return <div className="text-slate-400 text-xs py-8 text-center">未核实到全宗信息</div>;
                    }

                    return (
                      <div className="flex-1 space-y-2.5 divide-y divide-slate-100 text-xs">
                        <div className="flex items-center justify-between py-1 pt-1">
                          <span className="text-slate-500">全宗主体</span>
                          <strong className="text-slate-800">{activeFondsInfo.name}</strong>
                        </div>
                        <div className="flex items-center justify-between py-1">
                          <span className="text-slate-500">标准档号前缀</span>
                          <span className="font-mono bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded border border-blue-100 font-bold text-[11px]">
                            {activeFondsInfo.code}
                          </span>
                        </div>
                        <div className="flex items-center justify-between py-1">
                          <span className="text-slate-500">主链同步源</span>
                          <strong className="text-slate-700">{activeFondsInfo.syncSource}</strong>
                        </div>
                        <div className="flex flex-col gap-0.5 py-1">
                          <span className="text-slate-500">物理档案柜定位</span>
                          <strong className="text-slate-705 leading-tight">{activeFondsInfo.address}</strong>
                        </div>
                      </div>
                    );
                  })()}
                </div>

              </div>

              {/* Dynamic summary list for quick oversight */}
              <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs space-y-4">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div>
                    <h3 className="text-sm font-bold text-slate-800">
                      本全宗当前档案合规速查清单
                    </h3>
                    <p className="text-[11px] text-slate-500">
                      显示隶属于当前全宗公司的会计资产，可切换顶栏头像切换至其他公司。
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setActiveMainMenu('view-finance');
                      triggerToast('已经进入财务类明细工作台', 'info');
                    }}
                    className="px-3 py-1.5 border border-slate-200 hover:border-slate-350 text-slate-700 text-xs rounded-xl font-semibold hover:bg-slate-50 flex items-center gap-1 transition-colors cursor-pointer"
                  >
                    <span>进入明细工作台</span>
                    <Compass className="w-3.5 h-3.5 text-blue-500" />
                  </button>
                </div>

                {currentFondsRecords.length === 0 ? (
                  <div className="py-12 text-center text-slate-400 text-xs border border-dashed rounded-xl border-slate-200 bg-slate-50/20">
                    本全宗当前无录入的凭证包，请在顶栏头像切换至 <b>第一全宗</b> 或 <b>第二全宗</b> 展开数据监管件。
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs text-left text-slate-500 divide-y divide-slate-100">
                      <thead>
                        <tr className="text-[11px] text-slate-400 select-none">
                          <th className="py-2 font-bold md:pl-2">系统档号</th>
                          <th className="py-2 font-bold">记账凭证号</th>
                          <th className="py-2 font-bold">档案门类</th>
                          <th className="py-2 font-bold">归目属部</th>
                          <th className="py-2 font-bold text-right pr-6">记账金额 (元)</th>
                          <th className="py-2 font-bold">四性检测结果</th>
                          <th className="py-2 font-bold text-center">状态</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {currentFondsRecords.map(r => (
                          <tr key={r.id} className="hover:bg-slate-50/50">
                            <td className="py-3 font-mono font-bold text-slate-800 md:pl-2">{r.archiveCode}</td>
                            <td className="py-3">
                              <span className="font-bold bg-blue-50 text-blue-705 border border-blue-100 px-1.5 py-0.5 rounded text-[11px]">
                                {r.voucherNo}
                              </span>
                            </td>
                            <td className="py-3">
                              <span className="font-bold text-slate-700">{r.archiveType}</span>
                            </td>
                            <td className="py-3 text-slate-600">{r.department}</td>
                            <td className="py-3 font-mono font-bold text-slate-800 text-right pr-6">
                              {r.amount > 0 ? `¥ ${r.amount.toLocaleString('zh-CN', { minimumFractionDigits: 2 })}` : '0.00'}
                            </td>
                            <td className="py-3">
                              <div className="flex items-center gap-1">
                                <span className={`px-1.5 py-0.5 font-bold rounded-sm text-[9px] border ${r.checks.real ? 'bg-emerald-50 border-emerald-250 text-emerald-800' : 'bg-rose-50 border-rose-250 text-rose-800'}`}>真</span>
                                <span className={`px-1.5 py-0.5 font-bold rounded-sm text-[9px] border ${r.checks.complete ? 'bg-emerald-50 border-emerald-250 text-emerald-800' : 'bg-rose-50 border-rose-250 text-rose-800'}`}>完</span>
                                <span className={`px-1.5 py-0.5 font-bold rounded-sm text-[9px] border ${r.checks.usable ? 'bg-emerald-50 border-emerald-250 text-emerald-800' : 'bg-amber-100 border-amber-250 text-amber-800'}`}>用</span>
                                <span className={`px-1.5 py-0.5 font-bold rounded-sm text-[9px] border ${r.checks.safe ? 'bg-emerald-50 border-emerald-250 text-emerald-800' : 'bg-rose-50 border-rose-250 text-rose-800'}`}>安</span>
                              </div>
                            </td>
                            <td className="py-3 text-center">
                              <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${r.status === '已组卷' ? 'bg-slate-100 text-slate-500' : 'bg-amber-50 text-amber-700'}`}>
                                {r.status}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* 2. ARCHIVES DETAIL WORKBENCH GRID AREA */}
          {['view-finance', 'view-project', 'view-time'].includes(activeMainMenu) ? (
            <div className="space-y-4 animate-in fade-in duration-200">
              {/* Stats dashboard removed from here to separate views completely */}

              {/* Master action bar and layout grid split */}
              <div className="flex-1 grid grid-cols-1 md:grid-cols-12 gap-5 items-stretch min-h-0">
                

          {/* Sidebar Area: Categorized China Accounting Ledger Tree */}
          <aside className="hidden md:block md:col-span-3 h-[calc(100vh-140px)] sticky top-0 overflow-hidden">
            <AdvancedWorkbenchSidebar 
              treeData={treeData} 
              onNodeSelect={setSelectedNode} 
              selectedNode={selectedNode}
              onAddCategory={handleAddNewCategory}
              activeView={activeMainMenu.replace('view-', '') as 'finance' | 'project' | 'time'}
            />
          </aside>

          {/* Mobile tree navigation popup drawer */}
          {mobileSidebarOpen && (
            <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs z-50 flex justify-start md:hidden animate-in fade-in duration-200">
              <div className="bg-white w-[290px] h-full shadow-2xl relative flex flex-col animate-in slide-in-from-left duration-200">
                <button 
                  onClick={() => setMobileSidebarOpen(false)}
                  className="absolute right-3 top-3 p-1 bg-slate-100 text-slate-500 hover:text-slate-800 rounded-full cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
                <div className="flex-1 overflow-y-auto pt-6">
                  <AdvancedWorkbenchSidebar 
                    treeData={treeData} 
                    onNodeSelect={(node) => {
                      setSelectedNode(node);
                      setMobileSidebarOpen(false); // Close drawer
                    }} 
                    selectedNode={selectedNode}
                    onAddCategory={handleAddNewCategory}
                    activeView={activeMainMenu.replace('view-', '') as 'finance' | 'project' | 'time'}
                  />
                </div>
              </div>
            </div>
          )}

          {/* Core main archives list workspace & toolbar */}
          <div className="md:col-span-9 bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm flex flex-col min-h-[500px]">
            
            {/* Action Bar Header */}
            <div className="bg-slate-50 border-b border-slate-100 p-4 flex flex-col lg:flex-row gap-4 items-center justify-between shrink-0">
              
              {/* Batch Actions Group */}
              <div className="flex flex-wrap items-center gap-2 w-full lg:w-auto">
                <button 
                  type="button"
                  onClick={() => setIsUploadOpen(true)}
                  className="px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs rounded-xl shadow-sm hover:shadow flex items-center gap-1.5 transition-colors cursor-pointer"
                  id="action-smart-upload"
                >
                  <Upload className="w-3.5 h-3.5" />
                  <span>智能导入 (XML/OFD/PDF)</span>
                </button>

                <button 
                  type="button"
                  onClick={handleRunFourPropertiesCheck}
                  disabled={isCheckingBatch}
                  className={`px-3.5 py-2 text-white font-semibold text-xs rounded-xl shadow-sm hover:shadow flex items-center gap-1.5 transition-colors cursor-pointer ${
                    isCheckingBatch ? 'bg-emerald-400' : 'bg-emerald-600 hover:bg-emerald-700'
                  }`}
                  id="action-four-props"
                >
                  <ShieldCheck className="w-3.5 h-3.5 shrink-0" />
                  <span>{isCheckingBatch ? '四性验证引擎中...' : '一键“四性检测”'}</span>
                </button>

                <button 
                  type="button"
                  onClick={handleAutoGroup}
                  className="px-3.5 py-2 bg-amber-500 hover:bg-amber-600 text-white font-semibold text-xs rounded-xl shadow-sm hover:shadow flex items-center gap-1.5 transition-colors cursor-pointer"
                  id="action-auto-assembly"
                >
                  <FolderPlus className="w-3.5 h-3.5" />
                  <span>一键自动组卷</span>
                </button>

                <button 
                  type="button"
                  onClick={handleAssignVerifyCode}
                  className="px-3.5 py-2 bg-slate-800 hover:bg-slate-900 text-white font-semibold text-xs rounded-xl shadow-sm hover:shadow flex items-center gap-1.5 transition-colors cursor-pointer"
                  id="action-verify-code"
                >
                  <Notebook className="w-3.5 h-3.5" />
                  <span>赋予/校验档号</span>
                </button>

                {/* Directory Settings Aggregated Actions */}
                <div className="flex items-center gap-2 border-l border-slate-200 ml-1 pl-3">
                  <button className="px-3 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-semibold text-xs rounded-xl flex items-center gap-1.5 transition-colors cursor-pointer border border-indigo-200">
                    <Link2 className="w-3.5 h-3.5" />
                    <span>智能关联勾对</span>
                  </button>
                  <button className="px-3 py-2 bg-white hover:bg-slate-50 text-slate-700 font-semibold text-xs rounded-xl flex items-center gap-1.5 transition-colors cursor-pointer border border-slate-300 shadow-sm">
                    <CheckSquare className="w-3.5 h-3.5 shrink-0 text-slate-500" />
                    <span>跨维度检查</span>
                  </button>
                  <button className="hidden md:flex px-3 py-2 bg-white hover:bg-slate-50 text-slate-700 font-semibold text-xs rounded-xl items-center gap-1.5 transition-colors cursor-pointer border border-slate-300 shadow-sm">
                    <Layers className="w-3.5 h-3.5 shrink-0 text-slate-500" />
                    <span>批量导出全卷清单</span>
                  </button>
                </div>
              </div>

              {/* Cascade Search inputs */}
              <div className="relative w-full lg:w-72">
                <input
                  type="text"
                  placeholder="全文检索：凭证号/系统档号/内容/发票目..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className="w-full bg-white border border-slate-200 py-1.5 pl-8 pr-4 rounded-xl text-xs text-slate-700 placeholder-slate-400 focus:outline-none focus:border-blue-500"
                />
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
              </div>
            </div>

            {/* Sub-filtering label if category active */}
            {selectedNode && (
              <div className="bg-blue-50/50 p-2.5 px-4 border-b border-blue-150 text-xs text-blue-700 flex items-center justify-between shrink-0">
                <span className="flex items-center gap-1.5">
                  <Filter className="w-3.5 h-3.5 text-blue-600" />
                  <span>当前过滤类目：<strong>{selectedNode.label}</strong> (代码 : {selectedNode.code || '无'})</span>
                </span>
                <button 
                  onClick={() => setSelectedNode(null)} 
                  className="text-blue-500 hover:text-blue-800 font-bold border border-blue-200 bg-white px-2 py-0.5 rounded text-[10px] cursor-pointer"
                >
                  清除过滤栏
                </button>
              </div>
            )}

            {/* Aggregate Dashboard OR List Table container */}
            <div className="flex-1 overflow-x-auto min-h-0">
              {selectedNode?.id === 'time-2026-05' ? (
                <div className="p-6 space-y-6 animate-in fade-in duration-200">
                  <div className="mb-2 flex items-center justify-between">
                    <h3 className="text-xl font-extrabold text-slate-800 flex items-center gap-2">
                      <Grid className="w-6 h-6 text-indigo-500" />
                      2026年 05月 档案数字化上架进度
                    </h3>
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                    {[
                      { title: '会计凭证', total: 1250, done: 1250, icon: <FileInput className="w-6 h-6 text-blue-600" />, bg: 'bg-blue-100', bar: 'bg-blue-500' },
                      { title: '会计账簿', total: 45, done: 42, icon: <Briefcase className="w-6 h-6 text-amber-600" />, bg: 'bg-amber-100', bar: 'bg-amber-500' },
                      { title: '财务报表', total: 12, done: 12, icon: <FileSpreadsheet className="w-6 h-6 text-emerald-600" />, bg: 'bg-emerald-100', bar: 'bg-emerald-500' },
                      { title: '其他会计资料', total: 320, done: 156, icon: <Layers className="w-6 h-6 text-slate-600" />, bg: 'bg-slate-200', bar: 'bg-slate-500' }
                    ].map((item, idx) => (
                      <div key={idx} className="p-5 border border-slate-200 rounded-xl bg-slate-50/80 hover:bg-slate-50 hover:shadow-md transition-all flex flex-col gap-4">
                        <div className="flex justify-between items-start">
                          <div className={`p-3 rounded-xl ${item.bg}`}>
                            {item.icon}
                          </div>
                          <span className="text-sm font-bold text-slate-500 bg-white border border-slate-200 px-2 py-1 rounded-lg shadow-xs">{((item.done / item.total) * 100).toFixed(0)}% 完成</span>
                        </div>
                        <div>
                          <h4 className="font-bold text-slate-800 text-lg mb-1">{item.title}</h4>
                          <p className="text-xs text-slate-500 font-medium tracking-wide">已上架 {item.done} / 总计 {item.total}</p>
                        </div>
                        <div className="w-full bg-slate-200 rounded-full h-2.5 mt-2 overflow-hidden shadow-inner">
                          <div className={`${item.bar} h-full rounded-full`} style={{ width: `${(item.done / item.total) * 100}%` }}></div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <table className="w-full min-w-[1250px] text-left border-collapse table-auto" id="archives-main-table">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-100 text-slate-400 text-[11px] font-extrabold uppercase tracking-wider select-none">
                    <th className="p-3.5 w-10 text-center whitespace-nowrap">
                      <input 
                        type="checkbox"
                        checked={filteredRecords.length > 0 && selectedRecordIds.size === filteredRecords.length}
                        onChange={toggleSelectAll}
                        className="rounded accent-blue-600 cursor-pointer"
                      />
                    </th>
                    <th className="p-3.5 whitespace-nowrap">系统档号</th>
                    <th className="p-3.5 whitespace-nowrap">记账凭证号</th>
                    <th className="p-3.5 whitespace-nowrap">档案类别</th>
                    <th className="p-3.5 text-right whitespace-nowrap">发生项金额 (RMB)</th>
                    <th className="p-3.5 text-center whitespace-nowrap">项目年度</th>
                    <th className="p-3.5 text-center whitespace-nowrap">保管期限</th>
                    <th className="p-3.5 whitespace-nowrap w-[320px]">全生命周期“四性”质检状况</th>
                    <th className="p-3.5 text-center whitespace-nowrap">组卷状态</th>
                    <th className="p-3.5 text-center w-28 whitespace-nowrap">操作</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs">
                  {filteredRecords.map((row) => {
                    const isChecked = selectedRecordIds.has(row.id);
                    const isSucceedFour = row.checks.real && row.checks.complete && row.checks.usable && row.checks.safe;

                    return (
                      <tr 
                        key={row.id}
                        id={`archive-row-${row.id}`}
                        onClick={() => handleOpenDrawer(row)}
                        className={`hover:bg-slate-50/70 transition-colors cursor-pointer ${
                          isChecked ? 'bg-blue-50/15' : ''
                        }`}
                      >
                        {/* Checkbox column */}
                        <td className="p-3.5 text-center whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                          <input 
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => toggleRowSelect(row.id)}
                            className="rounded accent-blue-600 cursor-pointer animate-in fade-in"
                          />
                        </td>

                        {/* Standard code */}
                        <td className="p-3.5 font-mono font-bold text-slate-800 select-all tracking-tight whitespace-nowrap">
                          {row.archiveCode}
                        </td>

                        {/* Voucher No */}
                        <td className="p-3.5 whitespace-nowrap">
                          <span className="font-bold bg-slate-100 text-slate-700 px-2 py-0.5 rounded">
                            {row.voucherNo}
                          </span>
                        </td>

                        {/* Classification Group */}
                        <td className="p-3.5 whitespace-nowrap">
                          <span className={`px-2 py-0.5 rounded-full font-bold text-[10.5px] ${
                            row.archiveType === '记账凭证' 
                              ? 'bg-blue-50 text-blue-700' 
                              : row.archiveType === '会计账簿'
                                ? 'bg-amber-50 text-amber-700 border border-amber-200'
                                : 'bg-purple-50 text-purple-700'
                          }`}>
                            {row.archiveType}
                          </span>
                        </td>

                        {/* RMB Amount */}
                        <td className="p-3.5 text-right font-mono font-bold text-slate-900 whitespace-nowrap">
                          ¥ {row.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                        </td>

                        {/* Year/Month */}
                        <td className="p-3.5 text-center text-slate-500 font-mono whitespace-nowrap">
                          {row.year}年{row.month ? `${row.month}月` : ''}
                        </td>

                        {/* Retention Period code */}
                        <td className="p-3.5 text-center whitespace-nowrap">
                          <span className={`px-2 py-0.5 rounded font-bold text-[10px] ${
                            row.retention === '永久' 
                              ? 'bg-rose-50 text-rose-700 border border-rose-200' 
                              : 'bg-slate-100 text-slate-600'
                          }`}>
                            {row.retention}
                          </span>
                        </td>

                        {/* Status Checker Badges */}
                        <td className="p-3.5 max-w-[320px] whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                          <div className="flex gap-1">
                            {/* Real Check */}
                            <button 
                              title="真实性检测 (签章验证)"
                              onClick={() => {
                                handleOpenDrawer(row);
                                setActiveFileIndex(1); // switch file target
                              }}
                              className={`px-1.5 py-0.5 rounded font-bold text-[10px] flex items-center gap-0.5 pointer-events-auto border transition-colors cursor-pointer ${
                                row.checks.real 
                                  ? 'bg-emerald-50 border-emerald-200 text-emerald-800 hover:bg-emerald-100' 
                                  : 'bg-red-50 border-red-200 text-red-800 hover:bg-red-100'
                              }`}
                            >
                              <span>真</span>
                              <span className="text-[8px] opacity-75">(CA)</span>
                            </button>

                            {/* Complete checksum check */}
                            <button 
                              title="完整性校验 (数字摘要SHA256核算)"
                              className={`px-1.5 py-0.5 rounded font-bold text-[10px] flex items-center gap-0.5 border cursor-pointer ${
                                row.checks.complete 
                                  ? 'bg-emerald-50 border-emerald-200 text-emerald-800 hover:bg-emerald-100' 
                                  : 'bg-red-50 border-red-200 text-red-800'
                              }`}
                              onClick={() => handleOpenDrawer(row)}
                            >
                              <span>完</span>
                              <span className="text-[8px] opacity-75">(哈希)</span>
                            </button>

                            {/* Usability checker standard check */}
                            <button 
                              title="可用度检测 (格式规范/矢量中嵌入等)"
                              className={`px-1.5 py-0.5 rounded font-bold text-[10px] flex items-center gap-0.5 border transition-all cursor-pointer ${
                                row.checks.usable 
                                  ? 'bg-emerald-50 border-emerald-200 text-emerald-800' 
                                  : 'bg-amber-100 border-amber-300 text-amber-800 animate-pulse'
                              }`}
                              onClick={() => {
                                handleOpenDrawer(row);
                                const ofdIdx = row.components.findIndex(c => c.contentType === 'ofd');
                                if (ofdIdx >= 0) setActiveFileIndex(ofdIdx);
                              }}
                            >
                              <span>可用</span>
                              <span className="text-[8px] opacity-75">({row.checks.usable ? 'OK' : '缺字体'})</span>
                            </button>

                            {/* Security Control Check */}
                            <button 
                              title="安全性核验 (白名单，敏感字过滤)"
                              className={`px-1.5 py-0.5 rounded font-bold text-[10px] flex items-center gap-0.5 border cursor-pointer ${
                                row.checks.safe 
                                  ? 'bg-emerald-50 border-emerald-200 text-emerald-800' 
                                  : 'bg-red-50 border-red-200 text-red-800'
                              }`}
                              onClick={() => handleOpenDrawer(row)}
                            >
                              <span>安</span>
                              <span className="text-[8px] opacity-75">(控)</span>
                            </button>
                          </div>
                        </td>

                        {/* Volume group status */}
                        <td className="p-3.5 text-center whitespace-nowrap">
                          <span className={`px-2 py-0.5 rounded text-[11px] font-bold ${
                            row.status === '已组卷' 
                              ? 'bg-slate-150 text-slate-500 border border-slate-200' 
                              : 'bg-amber-50 text-amber-700 border border-amber-200'
                          }`}>
                            {row.status}
                          </span>
                          {row.volumeCode && (
                            <span className="block font-mono text-[9px] text-slate-400 mt-0.5 tracking-tight">
                              {row.volumeCode}
                            </span>
                          )}
                        </td>

                        {/* Main Actions Column */}
                        <td className="p-3.5 text-center whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center justify-center gap-1.5">
                            <button 
                              type="button"
                              onClick={() => handleOpenDrawer(row)}
                              className="text-blue-600 hover:text-blue-800 font-bold hover:underline py-1.5 cursor-pointer text-xs"
                            >
                              查看/解析
                            </button>
                            <button 
                              type="button"
                              onClick={(e) => handleDeleteRecord(row.id, e)}
                              className="text-red-500 hover:text-red-700 p-1 rounded hover:bg-red-50 cursor-pointer"
                              title="彻底销毁凭证"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}

                  {filteredRecords.length === 0 && (
                    <tr>
                      <td colSpan={10} className="p-12 text-center text-slate-400">
                        <p className="font-bold">未抓取到相符的电子会计档案元数据</p>
                        <p className="text-[11px] mt-1 text-slate-300">请更改左侧侧目录类目节点或在全文检索框中输入新关键词。</p>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
              )}
            </div>

            {/* Pagination footer bar */}
            <div className="bg-slate-50 p-3 px-4 border-t border-slate-100 flex items-center justify-between text-slate-400 text-xs shrink-0 select-none">
              <span className="font-sans">共抓取到 <strong className="text-slate-700">{filteredRecords.length}</strong> 件符合特征的财务凭证 (全省通入库库源级)</span>
              <span className="font-mono text-[10px]">Version Cluster: Alfresco_V8_Enterprise</span>
            </div>
          </div>
        </div>
      </div>
    ) : activeMainMenu === 'archive-offline' ? (
      <ArchiveOfflineReceive />
    ) : activeMainMenu === 'archive-rcv' ? (
      <ArchiveReceiveCenter />
    ) : activeMainMenu === 'wf-control' ? (
      <div className="space-y-6 animate-in fade-in duration-200">
        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs">
          <h2 className="text-base font-bold text-slate-900 border-l-4 border-blue-600 pl-3 mb-2 font-sans">档案使用审批全流程管控（对接移动办公系统实时同步）</h2>
          <p className="text-xs text-slate-500 mb-6">与飞书/钉钉、OA审批流实时打通，根据审批结果秒级生成限时电子借阅沙箱或控制钥匙出库。</p>
          
          <div className="mb-8 bg-slate-50 p-6 rounded-2xl border border-slate-150">
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-6 select-none">企业审批流实时生命状态</h3>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 relative">
              <div className="flex flex-col items-center text-center p-3">
                <div className="w-8 h-8 rounded-full bg-emerald-100 text-emerald-700 font-bold text-xs flex items-center justify-center border border-emerald-300 z-10 shrink-0">1</div>
                <span className="text-xs font-bold text-slate-800 mt-2">发起申请单</span>
                <span className="text-[10px] text-slate-400 mt-0.5">多维元属性填报</span>
              </div>
              <div className="flex flex-col items-center text-center p-3">
                <div className="w-8 h-8 rounded-full bg-blue-600 text-white font-bold text-xs flex items-center justify-center z-10 shrink-0 border-4 border-blue-100 shadow-sm animate-pulse">2</div>
                <span className="text-xs font-bold text-blue-600 mt-2">财务科室/主管初审</span>
                <span className="text-[10px] text-slate-400 mt-0.5">OA系统同步处理中</span>
              </div>
              <div className="flex flex-col items-center text-center p-3">
                <div className="w-8 h-8 rounded-full bg-slate-100 text-slate-400 font-bold text-xs flex items-center justify-center border border-slate-200 z-10 shrink-0">3</div>
                <span className="text-xs font-medium text-slate-500 mt-2">档案主管/经理终核</span>
                <span className="text-[10px] text-slate-400 mt-0.5">授权时效周期评估</span>
              </div>
              <div className="flex flex-col items-center text-center p-3">
                <div className="w-8 h-8 rounded-full bg-slate-100 text-slate-400 font-bold text-xs flex items-center justify-center border border-slate-200 z-10 shrink-0">4</div>
                <span className="text-xs font-medium text-slate-500 mt-2">系统放行（颁发时限令牌）</span>
                <span className="text-[10px] text-slate-400 mt-0.5">物理货柜出库权限</span>
              </div>
            </div>
          </div>

          <div className="overflow-x-auto border border-slate-150 rounded-xl">
            <table className="w-full text-left border-collapse table-auto">
              <thead>
                <tr className="bg-slate-50 text-slate-400 text-[11px] font-extrabold uppercase tracking-wider border-b border-slate-100 select-none">
                  <th className="p-3.5">系统审批单号</th>
                  <th className="p-3.5">拟借阅申请人</th>
                  <th className="p-3.5">借调原因及范围</th>
                  <th className="p-3.5">最新OA状态</th>
                  <th className="p-3.5 text-center">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs text-slate-800">
                {wfTableData.map(row => (
                  <tr key={row.id} className="hover:bg-slate-50/60 transition-colors">
                    <td className="p-3.5 font-mono text-slate-600 font-bold">{row.orderId}</td>
                    <td className="p-3.5 font-bold text-slate-700">{row.borrower}</td>
                    <td className="p-3.5 text-slate-500 select-all">{row.reason}</td>
                    <td className="p-3.5">
                      <span className={`px-2 py-0.5 rounded-full font-bold text-[10.5px] border ${
                        row.status === '审批通过' 
                          ? 'bg-emerald-50 text-emerald-800 border-emerald-200' 
                          : 'bg-blue-50 text-blue-800 border-blue-200 animate-pulse'
                      }`}>
                        {row.status}
                      </span>
                    </td>
                    <td className="p-3.5 text-center">
                      <button 
                        type="button" 
                        onClick={() => {
                          const updated = wfTableData.map(item => {
                            if (item.id === row.id) return { ...item, status: '审批通过' };
                            return item;
                          });
                          setWfTableData(updated);
                          triggerToast(`审批单 [${row.orderId}] 初审判定放行！已自动下发企业级密钥证书分发模块。`, 'success');
                        }}
                        disabled={row.status === '审批通过'}
                        className={`px-3 py-1.5 font-bold text-xs rounded-xl ${
                          row.status === '审批通过' 
                            ? 'text-slate-400 bg-slate-100 cursor-not-allowed' 
                            : 'text-blue-600 bg-blue-50 hover:bg-blue-100 transition-colors cursor-pointer'
                        }`}
                      >
                        快速同意过审
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    ) : activeMainMenu === 'borrow-manage' ? (
      <div className="space-y-6 animate-in fade-in duration-200">
        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs">
          <h2 className="text-base font-bold text-slate-900 border-l-4 border-amber-500 pl-3 mb-2 font-sans">标准化电子会计凭证借阅清单与多维条件定位</h2>
          <p className="text-xs text-slate-500 mb-6">可按照凭证号特征、责任主体及所属账期等因子精准匹配案卷，并对多次瑣细的同卷借阅记录实施智能化合并归纳展示。</p>
          
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 bg-slate-50 p-4 rounded-xl border border-slate-200 mb-6">
            <div className="space-y-1">
              <label className="block text-[11px] font-bold text-slate-600">关联会计凭证号</label>
              <input 
                type="text" 
                placeholder="例如：记-001" 
                className="w-full text-xs p-2 bg-white border border-slate-300 rounded-lg focus:outline-none"
              />
            </div>
            <div className="space-y-1">
              <label className="block text-[11px] font-bold text-slate-600">借阅主体 / 部门名称</label>
              <input 
                type="text" 
                placeholder="例如：上海财务部" 
                className="w-full text-xs p-2 bg-white border border-slate-300 rounded-lg focus:outline-none"
              />
            </div>
            <div className="space-y-1">
              <label className="block text-[11px] font-bold text-slate-600">账套会计核算年度</label>
              <select className="w-full text-xs p-2 bg-white border border-slate-300 rounded-lg focus:outline-none">
                <option value="all">不限年度元数据库归并</option>
                <option value="2026">2026 财税账期</option>
                <option value="2025">2025 财税账期</option>
              </select>
            </div>
            <div className="flex items-end gap-2">
              <button 
                type="button"
                onClick={() => triggerToast('穿透分析启动：已过滤得到集团财务部最新的账册流转状态...', 'success')}
                className="flex-1 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-lg shadow-inner transition-colors cursor-pointer"
              >
                精准组合查询
              </button>
              <button 
                type="button"
                onClick={() => {
                  triggerToast('合并处理引擎生效：系统已扫描同目录多条借单，成功将 3 卷同箱案卷判定为同一保管位，已就地实施合并审核！', 'success');
                }}
                className="py-2 px-3 bg-amber-500 hover:bg-amber-600 text-white font-bold text-xs rounded-lg transition-colors cursor-pointer"
                title="智能判定并归整同一卷号下的多次借阅"
              >
                合并重复卷
              </button>
            </div>
          </div>

          <div className="overflow-x-auto border border-slate-150 rounded-xl">
            <table className="w-full text-left border-collapse table-auto">
              <thead>
                <tr className="bg-slate-50 text-slate-400 text-[11px] font-extrabold uppercase tracking-wider border-b border-slate-100 select-none">
                  <th className="p-3.5">检索流水号</th>
                  <th className="p-3.5">档案上架录入时间</th>
                  <th className="p-3.5">授权放出时间</th>
                  <th className="p-3.5">现借阅承办人</th>
                  <th className="p-3.5">经办所属业务部门</th>
                  <th className="p-3.5">覆盖核销凭证范围</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs text-slate-800">
                {borrowListState.map(row => (
                  <tr key={row.id} className="hover:bg-slate-50/60 transition-colors">
                    <td className="p-3.5 font-mono font-bold text-slate-500">#{row.id}</td>
                    <td className="p-3.5 text-slate-500 font-mono">{row.onShelfTime}</td>
                    <td className="p-3.5 text-slate-800 font-mono font-medium">{row.borrowTime}</td>
                    <td className="p-3.5 font-bold text-slate-800">{row.person}</td>
                    <td className="p-3.5 font-bold text-slate-600">{row.dept}</td>
                    <td className="p-3.5">
                      <span className="font-mono text-blue-600 font-bold bg-blue-50/80 px-2.5 py-0.5 rounded border border-blue-100 select-all">
                        {row.vouchers}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    ) : activeMainMenu === 'return-manage' ? (
      <div className="space-y-6 animate-in fade-in duration-200">
        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-slate-100 pb-4 mb-4">
            <div>
              <h2 className="text-base font-bold text-slate-900 flex items-center gap-2 font-sans">
                <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                <span>档案归还多维度核对与超期自动催缴督办网</span>
              </h2>
              <p className="text-xs text-slate-500 mt-1 font-sans">控制未返还借单明细，核查数字水印和实体装订原况。支持一键穿透下达催还信文。</p>
            </div>
            <div className="flex flex-wrap gap-2 text-xs font-sans">
              <button 
                type="button"
                onClick={() => {
                  if (selectedReturnIds.size === 0) {
                    triggerToast('请先在下方表格中勾选要核对归还的流水项！', 'warning');
                    return;
                  }
                  const retSize = selectedReturnIds.size;
                  setReturnTableData(prev => prev.filter(r => !selectedReturnIds.has(r.id)));
                  setSelectedReturnIds(new Set());
                  triggerToast(`核实合格！所勾选 ${retSize} 册实物凭证已退归实体库，销除占位标记。`, 'success');
                }}
                className="px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl shadow-xs flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <Check className="w-3.5 h-3.5" />
                逐一核对并单条归还
              </button>
              <button 
                type="button"
                onClick={() => {
                  if (selectedReturnIds.size === 0) {
                    triggerToast('请先勾选批量核销的案卷目录节点！', 'warning');
                    return;
                  }
                  const totalSz = selectedReturnIds.size;
                  setReturnTableData([]);
                  setSelectedReturnIds(new Set());
                  triggerToast(`多批次一键归库：${totalSz} 件外调档案密签锁已全部释放。`, 'success');
                }}
                className="px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl shadow-xs flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <Files className="w-3.5 h-3.5" />
                多批次档案批量归还处理
              </button>
              <button 
                type="button"
                onClick={() => {
                  const overdueCount = returnTableData.filter(r => r.overdueDays > 0).length;
                  if (overdueCount === 0) {
                    triggerToast('目前检测到所有出库借单均为履约安全期，无需催还发函。', 'info');
                    return;
                  }
                  triggerToast(`催退成功！已向 [${overdueCount}] 位超期财务经办人下达警示督办。`, 'warning');
                }}
                className="px-3 py-2 bg-red-600 hover:bg-red-700 text-white font-bold rounded-xl shadow-xs flex items-center gap-1.5 transition-all cursor-pointer"
              >
                <Bell className="w-3.5 h-3.5" />
                针对超期未还件一键催还
              </button>
            </div>
          </div>

          <div className="overflow-x-auto border border-slate-150 rounded-xl">
            <table className="w-full text-left border-collapse table-auto text-xs font-sans">
              <thead>
                <tr className="bg-slate-50 text-slate-400 text-[11px] font-extrabold uppercase tracking-wider border-b border-slate-100 select-none">
                  <th className="p-3.5 w-12 text-center">
                    <input 
                      type="checkbox" 
                      className="rounded accent-blue-600 cursor-pointer"
                      checked={returnTableData.length > 0 && selectedReturnIds.size === returnTableData.length}
                      onChange={() => {
                        if (selectedReturnIds.size === returnTableData.length) {
                          setSelectedReturnIds(new Set());
                        } else {
                          setSelectedReturnIds(new Set(returnTableData.map(r => r.id)));
                        }
                      }}
                    />
                  </th>
                  <th className="p-3.5">借阅档案档号</th>
                  <th className="p-3.5">规定最晚还期</th>
                  <th className="p-3.5">已累积超期</th>
                  <th className="p-3.5">授权控制现状</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs text-slate-800">
                {returnTableData.map(row => (
                  <tr key={row.id} className={`hover:bg-slate-50/60 transition-colors ${row.overdueDays > 0 ? 'bg-amber-50/20' : ''}`}>
                    <td className="p-3.5 text-center">
                      <input 
                        type="checkbox"
                        checked={selectedReturnIds.has(row.id)}
                        onChange={() => {
                          const copy = new Set(selectedReturnIds);
                          if (copy.has(row.id)) copy.delete(row.id);
                          else copy.add(row.id);
                          setSelectedReturnIds(copy);
                        }}
                        className="rounded accent-blue-600 cursor-pointer"
                      />
                    </td>
                    <td className="p-3.5 font-mono font-bold text-slate-800">{row.code}</td>
                    <td className="p-3.5 font-mono text-slate-500">{row.deadline}</td>
                    <td className="p-3.5 text-red-600 font-extrabold font-mono">
                      {row.overdueDays > 0 ? `${row.overdueDays} 天超期` : '按期安全内'}
                    </td>
                    <td className="p-3.5">
                      <span className={`px-2 py-0.5 rounded font-bold text-[10.5px] border ${
                        row.overdueDays > 0 
                          ? 'bg-rose-50 text-rose-700 border-rose-150' 
                          : 'bg-amber-50 text-amber-700 border-amber-150'
                      }`}>
                        {row.status}
                      </span>
                    </td>
                  </tr>
                ))}
                {returnTableData.length === 0 && (
                  <tr>
                    <td colSpan={5} className="p-12 text-center text-slate-400">
                      <CheckCircle2 className="w-8 h-8 text-emerald-500 mx-auto mb-2" />
                      <p className="font-bold">所有外派调档凭证已全部回仓锁销归账。</p>
                      <p className="text-[11px] mt-1 text-slate-300 font-sans">安全合规等级：完美级别，未触发任何期满留档滞阻。</p>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    ) : activeMainMenu === 'search-stats' ? (
      <div className="space-y-6 animate-in fade-in duration-200">
        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs">
          <h2 className="text-base font-bold text-slate-900 border-l-4 border-blue-600 pl-3 mb-2 font-sans">多维档案查阅与经营周期全要素数据统计分析 (三模式)</h2>
          <p className="text-xs text-slate-500 mb-6 font-sans">整合集团内按年度凭证类型、多借阅人合并核对、财务部门大密度合并三个核心维度的交叉统计查询面板。</p>

          <div className="border border-slate-200 rounded-xl overflow-hidden bg-white">
            <div className="bg-slate-50 border-b border-slate-200 flex flex-wrap text-xs font-bold text-slate-500 select-none">
              <button 
                type="button" 
                onClick={() => setTypeQueryFilter('all')} 
                className={`px-4 py-3 border-r border-slate-200 transition-colors cursor-pointer ${typeQueryFilter === 'all' ? 'bg-white text-blue-600 border-b-2 border-b-blue-600' : 'hover:bg-slate-100 hover:text-slate-800'}`}
              >
                1. 凭证类型已装案卷检索
              </button>
              <button 
                type="button" 
                onClick={() => {
                  setTypeQueryFilter('unreturned');
                  triggerToast('进入人员多次借单合并穿透中心');
                }}
                className={`px-4 py-3 border-r border-slate-200 transition-colors cursor-pointer ${typeQueryFilter === 'unreturned' ? 'bg-white text-blue-600 border-b-2 border-b-blue-600' : 'hover:bg-slate-100 hover:text-slate-800'}`}
              >
                2. 人员借阅与部门合并归宗
              </button>
            </div>

            <div className="p-5 space-y-4">
              {typeQueryFilter === 'all' ? (
                <div className="space-y-4">
                  <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                    <div className="space-y-1 font-sans">
                      <span className="text-xs font-bold text-slate-800 block">全省装订案卷大盘比对状态</span>
                      <span className="text-[11px] text-slate-400">系统内数据已经与 Alfresco 电子证据链、AD-LDAP 集中权限角色完全核对。</span>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs font-sans">
                    <div className="border border-slate-150 p-3 rounded-lg bg-slate-50/50">
                      <div className="font-bold text-slate-500">2026财年凭证总览</div>
                      <div className="text-xl font-bold font-mono text-blue-600 mt-1">456 卷</div>
                      <div className="text-[10px] text-slate-400 mt-1">A、B全宗单位联合对账良好</div>
                    </div>
                    <div className="border border-slate-150 p-3 rounded-lg bg-slate-50/50">
                      <div className="font-bold text-slate-500">2025财年已归档</div>
                      <div className="text-xl font-bold font-mono text-emerald-600 mt-1">1,204 卷</div>
                      <div className="text-[10px] text-slate-400 mt-1">已转交常态微缩胶片异地灾备</div>
                    </div>
                    <div className="border border-slate-150 p-3 rounded-lg bg-slate-50/50">
                      <div className="font-bold text-slate-500">未完结外派借调件</div>
                      <div className="text-xl font-bold font-mono text-amber-600 mt-1">12 份</div>
                      <div className="text-[10px] text-slate-400 mt-1">涉及实体原件押回核对中</div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="bg-slate-50 p-5 rounded-xl border border-slate-200 space-y-4 font-sans">
                    <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider">同一借阅人多次/多部门借阅记录合并处理</h3>
                    
                    <div className="flex flex-wrap items-center gap-4 border-b border-slate-150 pb-4">
                      <div className="flex items-center gap-2 text-xs">
                        <span className="text-slate-600 font-medium">目标经手人:</span>
                        <select 
                          value={statsModePerson}
                          onChange={(e) => setStatsModePerson(e.target.value)}
                          className="p-1.5 bg-white border border-slate-300 rounded-lg outline-none cursor-pointer focus:ring-1 focus:ring-blue-500"
                        >
                          <option value="张三">张三 (上海财务部)</option>
                          <option value="李四">李四 (北京核算组)</option>
                        </select>
                      </div>
                      <button 
                        type="button"
                        onClick={() => triggerToast(`多次合并已生成：经办人 ${statsModePerson} 持有的关联借单，已一并标记为待归宗归仓！`, 'success')}
                        className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl transition-all cursor-pointer shadow-xs"
                      >
                        合并名下记录并预提
                      </button>
                    </div>

                    <div className="flex flex-wrap items-center gap-4 pt-2">
                      <div className="flex items-center gap-2 text-xs">
                        <span className="text-slate-600 font-medium">所属单位部门:</span>
                        <select 
                          value={statsModeDept}
                          onChange={(e) => setStatsModeDept(e.target.value)}
                          className="p-1.5 bg-white border border-slate-300 rounded-lg outline-none cursor-pointer focus:ring-1 focus:ring-blue-500"
                        >
                          <option value="上海财务部">上海财务部 (5个关联借单)</option>
                          <option value="北京核算组">北京核算组 (2个关联借单)</option>
                        </select>
                      </div>
                      <button 
                        type="button"
                        onClick={() => triggerToast(`部门合并移交：[${statsModeDept}] 所有现存的物理/数字凭据经办，已被智能合并完成。`, 'warning')}
                        className="px-4 py-1.5 bg-amber-500 hover:bg-amber-600 text-white font-bold text-xs rounded-xl transition-all cursor-pointer shadow-xs"
                      >
                        按部门批量合并结算
                      </button>
                    </div>
                  </div>

                  <div className="bg-teal-50 border border-teal-200 text-teal-850 p-4 rounded-xl flex items-center gap-3 font-sans">
                    <Award className="w-5 h-5 text-teal-600 shrink-0" />
                    <div className="text-xs">
                      <h4 className="font-bold">全维度大盘数据统计分析成果：</h4>
                      <p className="mt-1 leading-relaxed opacity-90">
                        截至目前累计完成装订案卷数 832 册，全省健康入库率 98%。通过多维度并案审查，为建立常态合规、降低集团历史单单审计追回风险指明精确数据导向！
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    ) : activeMainMenu === 'smart-data' ? (
      <div className="space-y-6 animate-in fade-in duration-200">
        {/* Special Character Cleaner Sandbox Block */}
        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs font-sans">
          <div className="flex flex-col md:flex-row md:items-center justify-between border-b border-slate-150 pb-4 mb-5">
            <div>
              <h2 className="text-base font-bold text-slate-900 border-l-4 border-emerald-500 pl-3">
                多状态凭证数据清洗与智能插卷控制台
              </h2>
              <p className="text-xs text-slate-500 mt-1">
                针对由上游各型ERP不端格式汇入的繁复字符与乱码，提供工业级标准消噪解译、多段自然数插卷以及凭证册并案管理。
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 mb-6">
            {/* Left element: Cleaner Tryout sandbox */}
            <div className="lg:col-span-4 bg-slate-50 border border-slate-200 p-5 rounded-xl flex flex-col justify-between">
              <div>
                <h3 className="text-xs font-bold text-slate-800 flex items-center gap-1.5 border-b border-slate-200 pb-2 mb-3">
                  <span className="w-2 h-2 rounded-full bg-emerald-500" />
                  <span>不规范凭证消噪流沙箱</span>
                </h3>
                <p className="text-[11px] text-slate-500 leading-relaxed mb-4">
                  测试会计不规则空白、特殊破折号及换行的自动消除规则，获得清洗后的标本档号值。
                </p>

                <div className="space-y-3 bg-white p-3 rounded-lg border border-slate-150 font-mono text-[11px] mb-4">
                  <div className="bg-slate-50 p-2 rounded flex justify-between items-center">
                    <div>
                      <span className="block text-[9px] text-slate-400">原始格式：</span>
                      <code className="text-slate-500 line-through">银 [2026] -- 05_004号</code>
                    </div>
                    <div className="text-right">
                      <span className="block text-[9px] text-emerald-600">标准件号:</span>
                      <strong className="text-emerald-700">银-202605-004</strong>
                    </div>
                  </div>

                  <div className="space-y-2 pt-2 border-t border-slate-100">
                    <label className="block text-[11px] font-bold text-slate-600">输入需要转换的污染号</label>
                    <input 
                      type="text" 
                      value={customVoucherToClean}
                      onChange={(e) => setCustomVoucherToClean(e.target.value)}
                      className="w-full text-xs p-2 bg-white border border-slate-250 rounded focus:outline-none"
                    />
                    <button 
                      type="button"
                      onClick={() => {
                        let clean = customVoucherToClean;
                        clean = clean.replace(/\s+/g, '').replace(/\[|\]/g, '-').replace(/_|-+/g, '-').replace(/号/g, '').replace(/\#+/g, '').replace(/\/+/g, '-');
                        if (!clean.includes('-')) clean = `记-${clean}`;
                        setCleanedVoucherOutput(clean);
                        triggerToast(`单件验证通过！已生成标准件: ${clean}`, 'success');
                      }}
                      className="w-full py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg cursor-pointer text-xs"
                    >
                      消噪重编
                    </button>
                    {cleanedVoucherOutput && (
                      <div className="mt-2 text-center bg-emerald-50 text-emerald-800 p-2 rounded-lg text-[10.5px] font-bold">
                        解析转换值: <span className="font-mono underline">{cleanedVoucherOutput}</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Right element: Table list and Actions */}
            <div className="lg:col-span-8 bg-white border border-slate-200 p-5 rounded-xl flex flex-col justify-between">
              <div>
                <h3 className="text-xs font-bold text-slate-800 flex items-center gap-1.5 border-b border-slate-200 pb-2 mb-4">
                  <span className="w-2 h-2 rounded-full bg-blue-500" />
                  <span>批次清洗规整与插册规则管理面板</span>
                </h3>

                {/* Toolbar */}
                <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between bg-slate-50 border border-slate-150 p-4 rounded-xl mb-4 text-xs">
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        const updated = cleanTableData.map(item => {
                          let clean = item.rawVoucher;
                          clean = clean.replace(/\s+/g, '').replace(/\[|\]/g, '-').replace(/_|-+/g, '-').replace(/号/g, '').replace(/\#+/g, '').replace(/\/+/g, '-').replace(/\(.*\)/, '');
                          return { ...item, cleanVoucher: clean, status: '已上架' };
                        });
                        setCleanTableData(updated);
                        triggerToast('批量智能清洗消噪重塑完毕！所有异常占位符已自适应转换。', 'success');
                      }}
                      className="px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl shadow-xs transition-colors cursor-pointer flex items-center gap-1.5"
                    >
                      <Upload className="w-3.5 h-3.5" />
                      <span>批量清洗格式</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setIsInsertSegmentModalOpen(true)}
                      className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl shadow-xs transition-colors cursor-pointer flex items-center gap-1.5"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>执行智能插卷设置</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        triggerToast('快速自检通过！符合国家档案局第79号令记账凭证全生命周期管理规范。', 'success');
                      }}
                      className="px-3.5 py-2 border border-slate-300 text-slate-600 hover:bg-slate-100 font-bold rounded-xl transition-colors cursor-pointer flex items-center gap-1.5"
                    >
                      <Compass className="w-3.5 h-3.5" />
                      <span>快速规则自检</span>
                    </button>
                  </div>

                  <div className="relative">
                    <input
                      type="text"
                      placeholder="标准档号模糊查询..."
                      value={cleanSearchQuery}
                      onChange={(e) => setCleanSearchQuery(e.target.value)}
                      className="bg-white border border-slate-300 py-1.5 pl-8 pr-3 rounded-xl text-xs text-slate-705 w-full sm:w-56 placeholder-slate-400 focus:outline-none focus:border-blue-500 font-sans"
                    />
                    <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
                  </div>
                </div>

                {/* Table */}
                <div className="overflow-x-auto border border-slate-150 rounded-xl">
                  <table className="w-full text-left border-collapse text-xs font-sans">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-150 text-slate-400 font-bold text-[10.5px] uppercase select-none">
                        <th className="p-3 w-12 text-center">No.</th>
                        <th className="p-3 text-slate-500">采集原始不规范内容</th>
                        <th className="p-3">智能清洗后标准凭证号</th>
                        <th className="p-3">系统级生成档号</th>
                        <th className="p-3">卷号模式</th>
                        <th className="p-3 text-center">状态</th>
                        <th className="p-3 text-center">操作</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-[11.5px] text-slate-700">
                      {cleanTableData
                        .filter(item => {
                          if (!cleanSearchQuery) return true;
                          return (
                            item.cleanVoucher.toLowerCase().includes(cleanSearchQuery.toLowerCase()) ||
                            item.archiveCode.toLowerCase().includes(cleanSearchQuery.toLowerCase())
                          );
                        })
                        .map((row, index) => {
                          return (
                            <tr key={row.id} className="hover:bg-slate-50/50 transition-all">
                              <td className="p-3 text-center text-slate-400 font-mono font-medium">{index + 1}</td>
                              <td className="p-3 font-medium text-slate-500 select-all truncate max-w-[180px]" title={row.rawVoucher}>{row.rawVoucher}</td>
                              <td className="p-3 font-mono font-bold text-emerald-600">{row.cleanVoucher}</td>
                              <td className="p-3 font-mono text-slate-800 font-medium">{row.archiveCode}</td>
                              <td className="p-3">
                                {row.isSegment ? (
                                  <span className="px-2 py-0.5 bg-amber-50 text-amber-700 border border-amber-200 rounded-md text-[10px] font-bold">
                                    多段自然数插卷
                                  </span>
                                ) : (
                                  <span className="px-2 py-0.5 bg-slate-100 text-slate-600 rounded-md text-[10px] font-medium">
                                    标准连续自然数
                                  </span>
                                )}
                              </td>
                              <td className="p-3 text-center">
                                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                  row.status === 'New' 
                                    ? 'bg-slate-100 text-slate-500' 
                                    : row.status === '质检中'
                                      ? 'bg-amber-100/80 text-amber-800'
                                      : row.status === '已上架'
                                        ? 'bg-emerald-50 text-emerald-800' 
                                        : 'bg-red-50 text-red-700'
                                }`}>
                                  {row.status}
                                </span>
                              </td>
                              <td className="p-3 text-center">
                                <div className="flex gap-2 justify-center">
                                  <button
                                    type="button"
                                    onClick={() => triggerToast(`即时核验 ${row.cleanVoucher} 的影像链。`, 'success')}
                                    className="text-blue-600 hover:text-blue-800 hover:underline font-bold text-[11px]"
                                  >
                                    查看影像
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setCleanTableData(prev => prev.map(item => {
                                        if (item.id === row.id) {
                                          return { ...item, cleanVoucher: item.rawVoucher.split(' ').filter(Boolean)[0] || '记-待定', status: '质检中' };
                                        }
                                        return item;
                                      }));
                                      triggerToast(`已重置流水件 [ID: ${row.id}] 回溯原始状态。`, 'warning');
                                    }}
                                    className="text-amber-600 hover:text-amber-850 hover:underline font-bold text-[11px]"
                                  >
                                    重置流水
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Modal dialog */}
        {isInsertSegmentModalOpen && (
          <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs z-50 flex items-center justify-center animate-in fade-in duration-200 font-sans">
            <div className="bg-white rounded-2xl w-full max-w-lg border border-slate-200 p-6 shadow-2xl relative space-y-4">
              <div className="border-b border-slate-100 pb-2.5">
                <h3 className="font-bold text-slate-900 text-sm">设置特殊业务场景下的多段自然数段（插卷管理）</h3>
                <p className="text-[11px] text-slate-400 mt-0.5">主档缺件/单独装册时，定义自然数附件物理切分</p>
              </div>

              <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl flex items-start gap-2.5 text-[11px] text-amber-800 leading-normal">
                <Info className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <span>本规则专门适配附件过多单独装盒、凭证与附件分离、跨卷盒拼盒、缺号等非连续自然数场景。</span>
              </div>

              <div className="space-y-4 text-xs">
                <div>
                  <label className="block font-bold text-slate-600 mb-1.5">基础目标案卷号</label>
                  <input
                    type="text"
                    disabled
                    value={insertSegmentBaseVoucher}
                    className="w-full bg-slate-50 border border-slate-200 p-2.5 rounded-lg text-slate-450 font-mono font-bold focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-600 mb-1.5">拟切分自然数段 <span className="text-rose-500">*</span></label>
                  <input
                    type="text"
                    value={insertSegmentVal}
                    onChange={(e) => setInsertSegmentVal(e.target.value)}
                    placeholder="例如：004-1, 004-2 (英文逗号)"
                    className="w-full bg-white border border-slate-250 p-2.5 rounded-lg font-mono text-slate-800 font-bold focus:outline-none focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-600 mb-1.5">数据映射规则</label>
                  <select
                    value={insertSegmentRule}
                    onChange={(e) => setInsertSegmentRule(e.target.value)}
                    className="w-full bg-white border border-slate-250 p-2.5 rounded-lg focus:outline-none focus:border-blue-500"
                  >
                    <option value="1">保持卷号整体连续性，不重写基准件号</option>
                    <option value="2">强制切分，与附件装盒深度绑定</option>
                  </select>
                </div>
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2.5 text-xs">
                <button
                  type="button"
                  onClick={() => setIsInsertSegmentModalOpen(false)}
                  className="px-3.5 py-1.5 border border-slate-250 text-slate-600 font-semibold rounded-lg hover:bg-slate-50 cursor-pointer"
                >
                  取消
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setIsInsertSegmentModalOpen(false);
                    const newId = String(cleanTableData.length + 1);
                    setCleanTableData([
                      ...cleanTableData,
                      {
                        id: newId,
                        rawVoucher: `分册插入 [${insertSegmentVal}]`,
                        cleanVoucher: `银-202605-${insertSegmentVal.split(',')[0]}`,
                        archiveCode: '1728-2-004-SEC',
                        isSegment: true,
                        status: 'New'
                      }
                    ]);
                    triggerToast('多段自然数段插卷规则计算完成！库房格位动态刷新。', 'success');
                  }}
                  className="px-4.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg cursor-pointer"
                >
                  确认执行
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    ) : activeMainMenu === 'order-special' ? (
      <div className="space-y-6 animate-in fade-in duration-200">
        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs font-sans">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-slate-100 pb-4 mb-4">
            <div>
              <h2 className="text-base font-bold text-slate-900">借调单专项生命周期精细化管理室</h2>
              <p className="text-xs text-slate-500 mt-1">纸电并存模式全链出入库跟班，具备仓储临位自动折叠及手工比查保障能力。</p>
            </div>
            <div>
              <span className="px-3 py-1 bg-blue-50 border border-blue-200 rounded-full font-bold text-xs text-blue-700 inline-flex items-center gap-1.5 select-none text-[11px]">
                <Activity className="w-3.5 h-3.5" />
                介质追随集群正常投运
              </span>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between py-3 px-4 bg-slate-50 rounded-xl border border-slate-150 mb-4 text-xs gap-3">
            <div className="flex items-center gap-2">
              <span className="font-bold text-slate-600">当前借单介质通道：</span>
              <div className="inline-flex rounded-lg border border-slate-300 p-0.5 bg-white">
                <button 
                  type="button" 
                  onClick={() => {
                    setMediaPort('elec');
                    triggerToast('已定位至：数电会计电子原件密钥租代专区');
                  }}
                  className={`px-3 py-1.5 font-bold rounded-lg transition-all text-[11px] cursor-pointer ${mediaPort === 'elec' ? 'bg-blue-600 text-white' : 'text-slate-500 hover:text-slate-800'}`}
                >
                  电子档案借阅端
                </button>
                <button 
                  type="button" 
                  onClick={() => {
                    setMediaPort('phys');
                    triggerToast('已定位至：物理保管箱、实体回单货架查档专区');
                  }}
                  className={`px-3 py-1.5 font-bold rounded-lg transition-all text-[11px] cursor-pointer ${mediaPort === 'phys' ? 'bg-amber-500 text-white' : 'text-slate-500 hover:text-slate-800'}`}
                >
                  实体物理介质端
                </button>
              </div>
            </div>
            <span className="text-[10px] text-slate-400 font-mono">Blockchain Cluster: sha256_ledger_main</span>
          </div>

          <div className="overflow-x-auto border border-slate-150 rounded-xl">
            <table className="w-full text-left border-collapse table-auto">
              <thead>
                <tr className="bg-slate-50 text-slate-400 text-[11px] font-extrabold uppercase tracking-wider border-b border-slate-100 select-none">
                  <th className="p-3.5">审阅单编号</th>
                  <th className="p-3.5">拟调阅人员</th>
                  <th className="p-3.5">档案类型</th>
                  <th className="p-3.5 w-64 text-center">卷册特征归并 (同保管区间重叠)</th>
                  <th className="p-3.5 w-40 text-center">生命周期节点 (取/审/结)</th>
                  <th className="p-3.5 text-center w-52">人机互动操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs text-slate-800">
                {specialOrders.map(row => (
                  <tr key={row.id} className="hover:bg-slate-50/60 transition-colors">
                    <td className="p-3.5 font-mono font-bold text-slate-700">{row.orderNum}</td>
                    <td className="p-3.5 font-bold text-slate-800">{row.borrower}</td>
                    <td className="p-3.5 font-bold text-slate-600">
                      <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-700">{row.category}</span>
                    </td>
                    <td className="p-3.5">
                      <span className="block p-1.5 px-3 bg-emerald-50 text-emerald-800 font-bold border border-dashed border-emerald-300 rounded text-center text-[10.5px]">
                        {row.sameUnit}
                      </span>
                    </td>
                    <td className="p-3.5">
                      <div className="flex items-center justify-center gap-1.5 select-none">
                        <span className={`w-6 h-6 rounded-full flex items-center justify-center font-extrabold font-mono text-[10px] ${row.stepActive >= 1 ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-400'}`}>取</span>
                        <div className={`h-0.5 w-4 ${row.stepActive >= 2 ? 'bg-blue-600' : 'bg-slate-200'}`} />
                        <span className={`w-6 h-6 rounded-full flex items-center justify-center font-extrabold font-mono text-[10px] ${row.stepActive >= 2 ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-400'}`}>审</span>
                        <div className={`h-0.5 w-4 ${row.stepActive >= 3 ? 'bg-blue-600' : 'bg-slate-200'}`} />
                        <span className={`w-6 h-6 rounded-full flex items-center justify-center font-extrabold font-mono text-[10px] ${row.stepActive >= 3 ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-400'}`}>结</span>
                      </div>
                    </td>
                    <td className="p-3.5 text-center">
                      <div className="flex items-center justify-center gap-3">
                        <button 
                          type="button" 
                          onClick={() => triggerToast(`智能提取：匹配到该申请项内包括 20 项原始发票密级包件，包含 GBT-18894 标准。`, 'success')}
                          className="hover:underline text-blue-600 font-bold hover:text-blue-800 cursor-pointer text-xs"
                        >
                          智能化信息提取
                        </button>
                        <button 
                          type="button" 
                          onClick={() => {
                            const updated = specialOrders.map(o => {
                              if (o.id === row.id) return { ...o, stepActive: 3 };
                              return o;
                            });
                            setSpecialOrders(updated);
                            triggerToast(`借单 [${row.orderNum}] 实物比对与电子原件手工复核完结，状态变更为妥协核销状态！`, 'success');
                          }}
                          className="hover:underline text-emerald-600 font-bold hover:text-emerald-800 cursor-pointer text-xs"
                        >
                          手工审核附件
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    ) : activeMainMenu === 'config-fanzong' ? (
      <div className="animate-in fade-in duration-200">
        <FanzongManager 
          fondsList={fanzongs} 
          setFondsList={setFanzongs} 
          currentFanzongCode={currentFanzongCode}
          setCurrentFanzongCode={(code) => {
            setCurrentFanzongCode(code);
            const node = treeData.find(n => n.type === 'fonds' && n.code === code);
            if (node) setSelectedNode(node);
          }}
          triggerToast={triggerToast} 
        />
      </div>

    ) : activeMainMenu === 'config-workflow' ? (
      <div className="animate-in fade-in duration-200">
        <WorkflowConfigPanel triggerToast={triggerToast} />
      </div>
    ) : activeMainMenu === 'sys-org' ? (
      <div className="animate-in fade-in duration-200">
        <OrgManagePanel triggerToast={triggerToast} />
      </div>
    ) : activeMainMenu === 'sys-user' ? (
      <div className="animate-in fade-in duration-200">
        <UserRolePanel triggerToast={triggerToast} />
      </div>
    ) : activeMainMenu === 'digital-warehouse' ? (
      <div className="animate-in fade-in duration-200">
        <DigitalWarehousePanel triggerToast={triggerToast} />
      </div>
    ) : (
      <div className="animate-in fade-in duration-200">
        <AuditLogsPanel records={records} triggerToast={triggerToast} />
      </div>
    )}
  </main>
</div>

      {/* Slide Out Right Hand Drawer Panel for Document Inspector Evidence block */}
      {drawerVisible && activeRecord && (
        <div 
          id="inspector-drawer-overlay animate-in fade-in" 
          className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs z-50 flex justify-end"
          onClick={handleCloseDrawer}
        >
          <div 
            id="inspector-drawer-panel" 
            className="bg-white w-full max-w-[72vw] h-full shadow-2xl flex flex-col p-6 space-y-5 overflow-hidden animate-in slide-in-from-right duration-300"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Drawer Header */}
            <div className="flex items-start justify-between border-b border-slate-150 pb-3 shrink-0">
              <div>
                <span className="text-[10px] bg-slate-100 p-1 px-2 rounded-md font-mono font-bold text-slate-500 select-all uppercase">
                  NODE REF: WORKSPACE://{activeRecord.id}
                </span>
                <h3 className="text-base font-bold text-slate-950 mt-1.5 flex items-center gap-2">
                  <Database className="w-4.5 h-4.5 text-blue-600" />
                  <span>电子凭属组件元数据详情与四型核对链</span>
                </h3>
              </div>
              <button 
                type="button" 
                onClick={handleCloseDrawer} 
                className="p-1.5 hover:bg-slate-100 rounded-full text-slate-400 hover:text-slate-800 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Scrolling drawer content */}
            <div className="flex-1 overflow-y-auto space-y-6 pr-2">
              
              {/* Descriptions table */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4 bg-slate-50 p-4 rounded-xl border border-slate-200 text-xs">
                <div>
                  <span className="text-slate-400 block line-height-none">系统档号</span>
                  <span className="font-mono font-bold text-slate-800 block mt-1 break-all select-all">{activeRecord.archiveCode}</span>
                </div>
                <div>
                  <span className="text-slate-400 block">凭证字号</span>
                  <span className="font-bold text-slate-800 block mt-1">{activeRecord.voucherNo}</span>
                </div>
                <div>
                  <span className="text-slate-400 block">记账总金额</span>
                  <span className="font-mono font-bold text-blue-600 block mt-1">¥ {activeRecord.amount.toLocaleString()}</span>
                </div>
                <div>
                  <span className="text-slate-400 block">长期哈希校验区块链存证密码</span>
                  <code className="text-[9.5px] font-mono text-slate-500 block truncate mt-1 bg-white p-1 rounded" title={activeRecord.components[0]?.hash}>
                    {activeRecord.components[0]?.hash || 'e3b0c44298fc1c149afb...'}
                  </code>
                </div>
              </div>

              {/* Live Preview interactive widget */}
              <InteractivePreview 
                record={activeRecord} 
                activeFileIndex={activeFileIndex} 
                onActiveFileChange={setActiveFileIndex}
                onRepairUsability={handleRepairUsability}
              />

              {/* Life-cycle Timeline Logs */}
              <div className="bg-slate-50/50 p-5 rounded-xl border border-slate-200">
                <AuditTimeline logs={activeRecord.auditLogs} />
              </div>
            </div>

            {/* Bottom actions inside drawer */}
            <div className="border-t border-slate-150 pt-3 shrink-0 flex justify-end gap-2 text-xs">
              <button 
                type="button" 
                onClick={handleCloseDrawer} 
                className="px-4 py-2 border border-slate-200 hover:bg-slate-50 rounded-xl font-bold cursor-pointer text-slate-700"
              >
                关闭查看
              </button>
              <button 
                type="button" 
                disabled={activeRecord.checks.real && activeRecord.checks.complete && activeRecord.checks.usable && activeRecord.checks.safe}
                onClick={() => {
                  if (!activeRecord.checks.usable) {
                    handleRepairUsability(activeRecord.id);
                  } else {
                    triggerToast("该凭证所有四性核验已通过，无须自检修复。", "info");
                  }
                }}
                className={`px-4 py-2 text-white font-bold rounded-xl shadow-xs cursor-pointer ${
                  activeRecord.checks.real && activeRecord.checks.complete && activeRecord.checks.usable && activeRecord.checks.safe
                    ? 'bg-slate-300 cursor-not-allowed'
                    : 'bg-indigo-600 hover:bg-indigo-705'
                }`}
              >
                一键自动修复本凭证
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Smart Ingestion & OCR File Upload Modal */}
      <UploadModal 
        isOpen={isUploadOpen} 
        onClose={() => setIsUploadOpen(false)} 
        onUploadSuccess={handleUploadSuccess}
      />

      {/* Menu Settings Dialog */}
      {isMenuSettingsOpen && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs z-[100] flex items-center justify-center animate-in fade-in duration-200 font-sans">
          <div className="bg-white rounded-2xl w-full max-w-sm border border-slate-200 p-6 shadow-2xl relative space-y-5">
            <div className="flex justify-between items-center border-b border-slate-100 pb-3">
              <h3 className="font-bold text-slate-800 flex items-center gap-2 text-base">
                <Settings className="w-5 h-5 text-indigo-600" />
                自定义显示菜单
              </h3>
              <button 
                onClick={() => setIsMenuSettingsOpen(false)}
                className="text-slate-500 hover:text-slate-800 bg-slate-100 hover:bg-slate-200 px-2 py-1 rounded-lg text-xs font-bold transition-colors cursor-pointer"
              >
                关闭
              </button>
            </div>
            
            <div className="space-y-2.5">
              {Object.entries({
                rcv: '档案接收',
                arrange: '档案整理',
                preserve: '档案保存',
                util: '档案利用',
                disposal: '档案处置',
                stats: '档案统计',
                archiveSettings: '档案设置',
                system: '系统设置'
              }).map(([key, label]) => (
                <label key={key} className="flex items-center gap-3 p-3 bg-slate-50 border border-slate-200 rounded-xl cursor-pointer hover:border-indigo-200 transition-colors select-none">
                  <div className="relative flex items-center">
                    <input 
                      type="checkbox" 
                      className="sr-only"
                      checked={visibleMenus[key]}
                      onChange={() => toggleMenuVisibility(key)}
                    />
                    <div className={`w-10 h-6 rounded-full transition-colors ${visibleMenus[key] ? 'bg-indigo-600' : 'bg-slate-300'}`}>
                      <div className={`absolute left-0.5 top-0.5 bg-white w-5 h-5 rounded-full transition-transform shadow-sm ${visibleMenus[key] ? 'translate-x-4' : 'translate-x-0'}`} />
                    </div>
                  </div>
                  <span className="text-sm font-bold text-slate-700">{label}</span>
                </label>
              ))}
            </div>
            
            <div className="pt-2">
              <button 
                onClick={() => setIsMenuSettingsOpen(false)}
                className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2.5 rounded-xl transition-colors cursor-pointer"
              >
                确认设置
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
