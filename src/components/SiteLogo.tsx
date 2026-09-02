import { Car } from 'lucide-react';
import { useSiteSettings } from '@/lib/siteSettings';
import { cn } from '@/lib/utils';

export function SiteLogo({ size = 'md', className }: { size?: 'md' | 'lg' | number; className?: string }) {
  const { settings } = useSiteSettings();
  const dimensions = size === 'lg' ? 'h-10 w-10' : 'h-9 w-9';
  const style = typeof size === 'number' ? { width: size, height: size } : undefined;

  if (settings.site_logo_url) {
    return (
      <span style={style} className={cn('flex shrink-0 items-center justify-center overflow-hidden rounded-xl bg-white ring-1 ring-ink-100', dimensions, className)}>
        <img src={settings.site_logo_url} alt={`${settings.site_name} logo`} className="h-full w-full object-contain" />
      </span>
    );
  }

  return (
    <span style={style} className={cn('flex shrink-0 items-center justify-center rounded-xl bg-brand-600 text-white', dimensions, className)}>
      <Car className={size === 'lg' ? 'h-6 w-6' : 'h-5 w-5'} />
    </span>
  );
}
