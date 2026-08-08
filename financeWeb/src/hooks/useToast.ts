import { useCallback } from 'react';
import { useAppStore } from '../stores/appStore';

export interface ToastState {
  message: string;
  type: 'success' | 'info' | 'warning';
}

export function useToast() {
  const toast = useAppStore((state) => state.toast);
  const triggerToast = useAppStore((state) => state.triggerToast);

  const dismissToast = useCallback(() => {
    useAppStore.setState({ toast: null });
  }, []);

  return {
    toast,
    triggerToast,
    dismissToast,
  };
}
