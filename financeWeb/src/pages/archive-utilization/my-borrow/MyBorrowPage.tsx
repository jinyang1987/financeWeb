/**
 * @license SPDX-License-Identifier: Apache-2.0
 *
 * MyBorrowPage — 我的借阅（借阅全生命周期·用户侧入口）
 *
 * 三个 Tab：
 *   借阅车  — 统一结算：逐行勾选电子权限/实体外借方式，一张申请单发起
 *   我的申请 — 审批进度跟踪 / 履约状态 / 撤销申请
 *   在线调阅 — 已授权电子档案（倒计时 + 水印预览 + 权限颗粒度控制）
 *
 * 黑名单熔断：名下有逾期未还实体档案 → 锁定新建借阅。
 */

import React, { useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import { ShoppingCart, ClipboardList, MonitorPlay, ShieldAlert } from 'lucide-react';
import { useBorrowStore, myOrders, activeElectronicGrants, isBorrowerBlacklisted } from '../../../stores/borrowStore';
import { useAuthStore } from '../../../stores/authStore';
import { todayStr } from '../../../utils/borrowEngine';
import BorrowCartCheckout from './BorrowCartCheckout';
import MyBorrowOrders from './MyBorrowOrders';
import BorrowReadingRoom from './BorrowReadingRoom';

type TabKey = 'cart' | 'orders' | 'reading';

const MyBorrowPage: React.FC = () => {
  const location = useLocation();
  const orders = useBorrowStore((s) => s.orders);
  const cart = useBorrowStore((s) => s.cart);
  const currentUser = useAuthStore((s) => s.currentUser);

  const tab: TabKey = useMemo(() => {
    const t = new URLSearchParams(location.search).get('tab');
    if (t === 'cart' || t === 'orders' || t === 'reading') return t;
    return cart.length > 0 ? 'cart' : 'orders';
  }, [location.search, cart.length]);

  const blacklisted = currentUser ? isBorrowerBlacklisted(currentUser.id, orders, todayStr()) : false;
  const myOrderCount = currentUser ? myOrders(orders, currentUser.id).length : 0;
  const grantCount = currentUser ? activeElectronicGrants(orders, currentUser.id).length : 0;

  const [activeTab, setActiveTab] = React.useState<TabKey>(tab);
  React.useEffect(() => setActiveTab(tab), [tab]);

  const TABS: { key: TabKey; label: string; Icon: typeof ShoppingCart; badge?: number }[] = [
    { key: 'cart', label: '借阅车', Icon: ShoppingCart, badge: cart.length || undefined },
    { key: 'orders', label: '我的申请', Icon: ClipboardList, badge: myOrderCount || undefined },
    { key: 'reading', label: '在线调阅', Icon: MonitorPlay, badge: grantCount || undefined },
  ];

  return (
    <div className="flex flex-col h-full bg-slate-50">
      {/* 页头 + Tab */}
      <div className="px-6 pt-4 pb-0 bg-white border-b border-slate-200 shrink-0">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3">
            <ShoppingCart className="w-5 h-5 text-slate-600" />
            <h1 className="text-base font-bold text-slate-800">我的借阅</h1>
          </div>
          {currentUser && (
            <span className="text-xs text-slate-400">{currentUser.name} · {currentUser.dept} · 工号 {currentUser.empNo}</span>
          )}
        </div>

        {blacklisted && (
          <div className="mb-3 flex items-start gap-2.5 px-4 py-3 bg-red-50 border border-red-200 rounded-xl">
            <ShieldAlert className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
            <div>
              <p className="text-xs font-bold text-red-700">借阅权限已熔断</p>
              <p className="text-[11px] text-red-600 mt-0.5 leading-relaxed">
                您名下有逾期未还的实体档案，系统已从底层锁定「新建借阅单」功能。
                请立即归还逾期档案，归还核销后权限自动恢复。逾期信息已每日抄送您的直属主管。
              </p>
            </div>
          </div>
        )}

        <div className="flex items-center gap-1">
          {TABS.map(({ key, label, Icon, badge }) => (
            <button
              key={key}
              type="button"
              onClick={() => setActiveTab(key)}
              className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium rounded-t-xl transition-all cursor-pointer border-b-2 ${
                activeTab === key
                  ? 'bg-slate-50 text-sky-700 border-sky-600'
                  : 'text-slate-500 border-transparent hover:text-slate-700 hover:bg-slate-50'
              }`}
            >
              <Icon className="w-4 h-4" />
              {label}
              {badge !== undefined && (
                <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${activeTab === key ? 'bg-sky-600 text-white' : 'bg-slate-200 text-slate-600'}`}>
                  {badge}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Tab 内容 */}
      <div className="flex-1 overflow-hidden min-h-0">
        {activeTab === 'cart' && <BorrowCartCheckout blacklisted={blacklisted} onSubmitted={() => setActiveTab('orders')} />}
        {activeTab === 'orders' && <MyBorrowOrders />}
        {activeTab === 'reading' && <BorrowReadingRoom />}
      </div>
    </div>
  );
};

export default MyBorrowPage;

