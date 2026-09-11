import { cn } from '@/lib/utils';
import { siteWordmarkParts, siteWordmarkWidth } from '@/lib/siteWordmark';
import { ElevenDriveWordmark } from './ElevenDriveWordmark';

type Props = { name: string; colours?: string; animation?: string; className?: string; decorative?: boolean };

export function SiteWordmark({ name: value, colours = 'split', animation = 'off', className, decorative = false }: Props) {
  const { name, first, second } = siteWordmarkParts(value);
  const colourMode = ['split', 'reverse', 'base', 'action'].includes(colours) ? colours : 'split';
  const motion = ['off', 'pulse', 'float'].includes(animation) ? animation : 'off';
  const classes = cn('site-wordmark max-w-full font-display font-extrabold', `site-wordmark-colours--${colourMode}`, `site-wordmark--${motion}`, className);
  // Preserve the existing custom lettering exactly for the current brand.
  if (name === '11Drive') return <ElevenDriveWordmark decorative={decorative} className={classes} />;
  const width = siteWordmarkWidth(name);
  return <svg xmlns="http://www.w3.org/2000/svg" viewBox={`0 0 ${width} 200`} preserveAspectRatio="xMinYMid meet" className={classes} role={decorative ? undefined : 'img'} aria-hidden={decorative || undefined} aria-label={decorative ? undefined : name}>
    <g className="site-wordmark-drive" fill="currentColor">
      <g className="site-wordmark-steering-wheel">
        <circle cx="62" cy="102" r="43" fill="none" stroke="currentColor" strokeWidth="13" />
        <circle cx="62" cy="102" r="10" />
        <path d="M56 105 30 139 40 147 66 112ZM68 105 94 139 84 147 58 112ZM57 67H67V96H57Z" />
      </g>
    </g>
    <text x="135" y="155" fontSize="160" fontWeight="800" textLength={width - 150} lengthAdjust="spacingAndGlyphs" xmlSpace="preserve" fill="currentColor"><tspan className="site-wordmark-eleven">{first}</tspan><tspan className="site-wordmark-drive">{second}</tspan></text>
  </svg>;
}
