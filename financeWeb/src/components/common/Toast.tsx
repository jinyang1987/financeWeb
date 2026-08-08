import React, { useEffect } from 'react';
import { CheckCircle2, AlertTriangle, Info } from 'lucide-react';

type ToastType = 'success' | 'info' | 'warning';

interface ToastProps {
  message: string;
  type?: ToastType;
  onClose: () => void;
  duration?: number;
}

const Toast: React.FC<ToastProps> = ({ message, type = 'success', onClose, duration = 4500 }) => {
  useEffect(() => {
    const timer = setTimeout(onClose, duration);
    return () => clearTimeout(timer);
  }, [onClose, duration]);

  return (
    <div className="fixed bottom-6 right-6 z-[9999] bg-white border border-slate-200 shadow-xl rounded-2xl p-3.5 flex items-center gap-2.5 animate-in slide-in-from-right-5 fade-in duration-200 max-w-sm">
      {type === 'success' && <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />}
      {type === 'warning' && <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />}
      {type === 'info' && <Info className="w-4 h-4 text-sky-600 shrink-0" />}
      <span>{message}</span>
    </div>
  );
};

export default Toast;

