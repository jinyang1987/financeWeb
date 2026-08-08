﻿﻿﻿﻿﻿﻿﻿import React from 'react';
import { CheckCircle2, AlertTriangle, Info } from 'lucide-react';
import { useAppStore } from '../../stores/appStore';

export const ToastNotification: React.FC = () => {
  const toast = useAppStore((state) => state.toast);

  if (!toast) return null;

  const typeStyles: Record<string, string> = {
    success: 'bg-emerald-50 border-emerald-200 text-emerald-800',
    warning: 'bg-amber-50 border-amber-200 text-amber-800',
    info: 'bg-sky-50 border-sky-200 text-sky-800',
  };

  const typeIcons: Record<string, React.ReactNode> = {
    success: <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />,
    warning: <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />,
    info: <Info className="w-4 h-4 text-sky-600 shrink-0" />,
  };

  return (
    <div
      id="custom-toast-pill"
      className={`fixed top-4 left-1/2 -translate-x-1/2 z-50 p-4 rounded-xl shadow-xl flex items-center gap-2.5 max-w-lg border text-xs font-bold transition-all animate-bounce ${typeStyles[toast.type] || typeStyles.info}`}
    >
      {typeIcons[toast.type] || typeIcons.info}
      <span>{toast.message}</span>
    </div>
  );
};

