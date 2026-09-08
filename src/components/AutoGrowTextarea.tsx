import { forwardRef, useImperativeHandle, useLayoutEffect, useRef } from 'react';
import type { TextareaHTMLAttributes } from 'react';

type Props = TextareaHTMLAttributes<HTMLTextAreaElement> & { maxHeight?: number };

export const AutoGrowTextarea = forwardRef<HTMLTextAreaElement, Props>(function AutoGrowTextarea(
  { maxHeight = 160, className = '', rows = 1, value, ...props },
  forwardedRef,
) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useImperativeHandle(forwardedRef, () => ref.current as HTMLTextAreaElement);
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    element.style.height = 'auto';
    element.style.height = `${Math.min(element.scrollHeight, maxHeight)}px`;
    element.style.overflowY = element.scrollHeight > maxHeight ? 'auto' : 'hidden';
  }, [value, maxHeight]);
  return <textarea ref={ref} rows={rows} value={value} className={`${className} resize-none`} {...props} />;
});
