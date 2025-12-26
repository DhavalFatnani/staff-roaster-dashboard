'use client';

import { useState, useCallback } from 'react';
import { ModalType } from '@/components/Modal';

interface AlertOptions {
  title?: string;
  type?: ModalType;
}

interface ConfirmOptions extends AlertOptions {
  confirmText?: string;
  cancelText?: string;
  confirmButtonStyle?: 'default' | 'danger';
  onConfirm?: () => void | Promise<void>;
}

export function useModal() {
  const [alertState, setAlertState] = useState<{
    isOpen: boolean;
    message: string;
    title?: string;
    type?: ModalType;
  }>({
    isOpen: false,
    message: '',
    type: 'info'
  });

  const [confirmState, setConfirmState] = useState<{
    isOpen: boolean;
    message: string;
    title?: string;
    type?: ModalType;
    confirmText?: string;
    cancelText?: string;
    confirmButtonStyle?: 'default' | 'danger';
    onConfirm?: () => void | Promise<void>;
  }>({
    isOpen: false,
    message: '',
    type: 'warning'
  });

  const [isLoading, setIsLoading] = useState(false);

  const showAlert = useCallback((message: string, options?: AlertOptions) => {
    setAlertState({
      isOpen: true,
      message,
      title: options?.title,
      type: options?.type || 'info'
    });
  }, []);

  const showConfirm = useCallback((message: string, options?: ConfirmOptions): Promise<boolean> => {
    return new Promise((resolve) => {
      setConfirmState({
        isOpen: true,
        message,
        title: options?.title,
        type: options?.type || 'warning',
        confirmText: options?.confirmText,
        cancelText: options?.cancelText,
        confirmButtonStyle: options?.confirmButtonStyle,
        onConfirm: async () => {
          if (options?.onConfirm) {
            setIsLoading(true);
            try {
              await options.onConfirm();
              resolve(true);
            } catch (error) {
              console.error('Confirm action failed:', error);
              resolve(false);
            } finally {
              setIsLoading(false);
              setConfirmState(prev => ({ ...prev, isOpen: false }));
            }
          } else {
            resolve(true);
            setConfirmState(prev => ({ ...prev, isOpen: false }));
          }
        }
      });
    });
  }, []);

  const closeAlert = useCallback(() => {
    setAlertState(prev => ({ ...prev, isOpen: false }));
  }, []);

  const closeConfirm = useCallback((confirmed: boolean) => {
    if (!confirmed && confirmState.onConfirm) {
      // If cancelled, we still need to resolve the promise
      // We'll handle this in the component
    }
    setConfirmState(prev => ({ ...prev, isOpen: false, onConfirm: undefined }));
  }, [confirmState.onConfirm]);

  const handleConfirm = useCallback(async () => {
    if (confirmState.onConfirm) {
      setIsLoading(true);
      try {
        await confirmState.onConfirm();
        setConfirmState(prev => ({ ...prev, isOpen: false, onConfirm: undefined }));
      } catch (error) {
        console.error('Confirm action failed:', error);
      } finally {
        setIsLoading(false);
      }
    } else {
      setConfirmState(prev => ({ ...prev, isOpen: false }));
    }
  }, [confirmState.onConfirm]);

  return {
    alert: showAlert,
    confirm: showConfirm,
    closeAlert,
    closeConfirm,
    handleConfirm,
    alertState,
    confirmState,
    isLoading
  };
}

