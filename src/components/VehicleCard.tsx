import { PromotionLink as Link, PromotionBadge } from './PromotionLink';
import { MapPin, Fuel, Settings2, Wallet, ShieldCheck, AlertTriangle } from 'lucide-react';
import type { VehicleWithRelations } from '@/lib/types';
import { formatKES, formatDate, timeAgo, expiryStatus, titleCase, cn } from '@/lib/utils';
import { Avatar } from './Avatar';
import { ProfileName } from './ProfileName';
import { Rating } from './Rating';
import { ModeratedImage } from './ModeratedImage';

interface Props {
  vehicle: VehicleWithRelations;
  showOwner?: boolean;
  showApprovalStatus?: boolean;
}

export function VehicleCard({ vehicle, showOwner = true, showApprovalStatus = false }: Props) {
  const photo = vehicle.photos?.[0]?.photo_url;
  const insStatus = expiryStatus(vehicle.insurance_expiry);
  const issuesCount = vehicle.issues?.length ?? 0;
  const platformLabels: Record<VehicleWithRelations['registered_platforms'][number], string> = {
    uber: 'Uber ready', bolt: 'Bolt ready', little: 'Little Cab ready', faras: 'Faras ready', other: 'Other platform',
  };

  return (
    <div className="card card-hover group overflow-hidden">
    <Link
      ownerId={vehicle.owner_id}
      to={`/vehicles/${vehicle.id}`}
      className="block"
    >
      <div className="relative aspect-[16/10] overflow-hidden bg-ink-100">
        {photo ? (
          <ModeratedImage
            src={photo}
            alt={`${vehicle.make} ${vehicle.model}`}
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
            loading="lazy"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-ink-300">
            <span className="text-sm">No photo</span>
          </div>
        )}
        <div className="absolute left-3 top-3 flex flex-wrap gap-1.5">
          {showApprovalStatus && vehicle.document_listing_visibility && vehicle.document_listing_visibility !== 'public' && <span className="badge-danger">{vehicle.document_listing_visibility === 'private' ? 'Private · document renewal needed' : 'Removed from discovery'}</span>}
          {showApprovalStatus && vehicle.approval_status === 'pending' && <span className="badge-warning">Pending admin approval</span>}
          {showApprovalStatus && vehicle.approval_status === 'approved' && <span className="badge-success">Approved</span>}
          {showApprovalStatus && vehicle.approval_status === 'rejected' && <span className="badge-danger">Changes required</span>}
          <PromotionBadge kind="listing" id={vehicle.id} ownerId={vehicle.owner_id} featured={vehicle.featured} />
          {vehicle.availability === 'available' && <span className="badge-brand">Available</span>}
          {vehicle.availability !== 'available' && <span className="badge-neutral">Taken</span>}
        </div>
        {issuesCount > 0 && (
          <div className="absolute bottom-3 left-3 flex items-center gap-1 rounded-full bg-amber-50/95 px-2 py-1 text-xs font-medium text-amber-700 ring-1 ring-amber-200">
            <AlertTriangle className="h-3 w-3" /> {issuesCount} known issue{issuesCount > 1 ? 's' : ''}
          </div>
        )}
      </div>

        <div className="p-4">
        {showApprovalStatus && vehicle.approval_status === 'rejected' && vehicle.approval_note && (
          <div className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">Admin note: {vehicle.approval_note}</div>
        )}
        <div className="flex items-start justify-between gap-2">
          <div>
            <h3 className="font-display text-base font-bold text-ink-900">
              {vehicle.make} {vehicle.model}
            </h3>
            <p className="text-xs text-ink-500">{vehicle.year} · {titleCase(vehicle.transmission)} · {titleCase(vehicle.fuel_type)}</p>
          </div>
          {vehicle.weekly_target != null && (
            <div className="text-right">
              <p className="text-sm font-bold text-ink-900">{formatKES(vehicle.weekly_target)}</p>
              <p className="text-[10px] text-ink-400">per week</p>
            </div>
          )}
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-ink-500">
          <span className="inline-flex items-center gap-1"><MapPin className="h-3.5 w-3.5" /> {vehicle.location}</span>
          <span className="inline-flex items-center gap-1"><Fuel className="h-3.5 w-3.5" /> {titleCase(vehicle.fuel_type)}</span>
          <span className="inline-flex items-center gap-1"><Settings2 className="h-3.5 w-3.5" /> {titleCase(vehicle.transmission)}</span>
          {vehicle.deposit > 0 && (
            <span className="inline-flex items-center gap-1"><Wallet className="h-3.5 w-3.5" /> {formatKES(vehicle.deposit)} deposit</span>
          )}
        </div>

        {vehicle.registered_platforms?.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {vehicle.registered_platforms.map((platform) => (
              <span key={platform} className="rounded-full bg-violet-50 px-2.5 py-1 text-[11px] font-semibold text-violet-700 ring-1 ring-violet-100 dark:bg-violet-950/30 dark:text-violet-300 dark:ring-violet-900">
                {platformLabels[platform]}
              </span>
            ))}
          </div>
        )}

        <div className="mt-3 flex items-center gap-2 border-t border-ink-100 pt-3">
          <ShieldCheck className={cn(
            'h-3.5 w-3.5',
            insStatus === 'valid' && 'text-brand-600',
            insStatus === 'soon' && 'text-amber-500',
            insStatus === 'expired' && 'text-danger',
            insStatus === 'none' && 'text-ink-300'
          )} />
          <span className="text-xs text-ink-500">
            {titleCase(vehicle.insurance_type)} insurance
            {vehicle.insurance_expiry ? ` · exp ${formatDate(vehicle.insurance_expiry)}` : ''}
          </span>
        </div>

      </div>
    </Link>
    <div className="px-4 pb-4">
        {showOwner && vehicle.owner ? (
          <div className="mt-3 flex items-center justify-between border-t border-ink-100 pt-3">
            <div className="flex items-center gap-2">
              <Avatar name={vehicle.owner.full_name} src={vehicle.owner.avatar_url} size={28} />
              <div>
                <p className="text-xs font-medium text-ink-800"><ProfileName id={vehicle.owner.id} name={vehicle.owner.full_name} /></p>
                <p className="flex items-center gap-1 text-[10px] text-success"><ShieldCheck className="h-3 w-3" /> Listing approved by admin</p>
                <Rating value={vehicle.owner.rating} size={11} count={vehicle.owner.rating_count} showValue />
              </div>
            </div>
            <span className="shrink-0 text-[10px] text-ink-400">Listed {timeAgo(vehicle.created_at)}</span>
          </div>
        ) : (
          <p className="mt-3 border-t border-ink-100 pt-3 text-right text-[10px] text-ink-400">Listed {timeAgo(vehicle.created_at)}</p>
        )}
      </div>
    </div>
  );
}
