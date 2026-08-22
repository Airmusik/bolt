import { createContext } from 'react';

export type ToastType = 'success' | 'error' | 'info';
export type ToastFn = (message: string, type?: ToastType) => void;

export const ToastContext = createContext<{ toast: ToastFn } | undefined>(undefined);
