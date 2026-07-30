import { useEffect, useState } from 'react';

export function TypedText({
  text,
  speed = 110,
  className,
  cursorClassName,
}: {
  text: string;
  speed?: number;
  className?: string;
  cursorClassName?: string;
}) {
  const [shown, setShown] = useState('');
  const [done, setDone] = useState(false);

  useEffect(() => {
    let i = 0;
    const id = setInterval(() => {
      i++;
      setShown(text.slice(0, i));
      if (i >= text.length) {
        clearInterval(id);
        setDone(true);
      }
    }, speed);
    return () => clearInterval(id);
  }, [text, speed]);

  return (
    <span className={className}>
      {shown}
      <span className={done ? `animate-blink ${cursorClassName || ''}` : cursorClassName}>|</span>
    </span>
  );
}
