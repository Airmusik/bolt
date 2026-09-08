import { cn } from '@/lib/utils';

type ElevenDriveWordmarkProps = {
  className?: string;
  decorative?: boolean;
};

export function ElevenDriveWordmark({ className, decorative = false }: ElevenDriveWordmarkProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 780 200"
      className={cn('block', className)}
      role={decorative ? undefined : 'img'}
      aria-hidden={decorative || undefined}
      aria-label={decorative ? undefined : '11Drive'}
    >
      <g className="site-wordmark-eleven" fill="currentColor">
        <path d="M28 38 75 18v164H28V70L0 82V44l28-6Zm86 0 47-20v164h-47V70L86 82V44l28-6Z" />
      </g>
      <g className="site-wordmark-drive" fill="currentColor">
        <path fillRule="evenodd" d="M190 18h83c102 0 153 32 153 82s-51 82-153 82h-83V18Zm49 41v82h37c61 0 96-14 96-41s-35-41-96-41h-37Z" />
        <circle cx="304" cy="100" r="31" fill="none" stroke="currentColor" strokeWidth="12" />
        <circle cx="304" cy="100" r="8" />
        <path d="m300 105-19 27-10-8 20-28 9 9Zm8 0 19 27 10-8-20-28-9 9Zm-4-17 29-1-1-12-29 1 1 12Z" />
        <path d="M448 66h42v18c9-14 22-21 40-21h8v39h-14c-21 0-31 10-31 30v50h-45V66Zm103 0h45v116h-45V66Zm0-48h45v36h-45V18Zm54 48h48l25 73 25-73h48l-47 116h-52L605 66Zm171-4c43 0 70 28 70 64v14H756c4 10 13 15 27 15 13 0 24-4 34-12l22 25c-15 12-34 18-58 18-45 0-72-25-72-62 0-36 27-62 67-62Zm-20 53h47c-2-13-10-20-23-20-13 0-21 7-24 20Z" transform="translate(-66)" />
      </g>
    </svg>
  );
}
