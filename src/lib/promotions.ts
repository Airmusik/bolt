export interface PromotionSettings {
  id: boolean; enabled: boolean; listing_price: number; profile_price: number;
  duration_days: number; payment_method: string; payment_instructions: string; terms: string;
}
export interface PromotionRequest {
  id: string; user_id: string; kind: 'listing' | 'profile'; vehicle_id: string | null;
  status: 'awaiting_payment' | 'pending' | 'active' | 'rejected' | 'cancelled' | 'expired';
  amount: number; duration_days: number; payment_method: string; payment_instructions: string; terms: string;
  payment_reference: string | null; admin_note: string | null; starts_at: string | null; expires_at: string | null; created_at: string;
  member?: { full_name: string; role: string }; vehicle?: { make: string; model: string };
}
export const promotionStatus = (r: PromotionRequest) => r.status === 'active' && r.expires_at && new Date(r.expires_at).getTime() <= Date.now() ? 'expired' : r.status;
export const promotionTitle = (r: PromotionRequest) => r.kind === 'profile' ? 'Profile promotion' : r.vehicle ? `${r.vehicle.make} ${r.vehicle.model}` : 'Listing promotion';
export const promotionError = (error: unknown) => (error as { message?: string })?.message || 'Something went wrong. Check your connection and try again.';

export function promotionProgress(request: PromotionRequest, visible = true) {
  const status = promotionStatus(request);
  const states = {
    awaiting_payment: { label: 'Payment needed', tone: 'badge-warning', help: 'Follow the saved payment instructions, then enter the transaction reference from your receipt. No payment has been taken by this website.' },
    pending: { label: 'Payment being checked', tone: 'badge-warning', help: 'Your payment reference was sent to admin. Do not pay again. The promotion starts only after payment is confirmed.' },
    active: { label: visible ? 'Promotion running' : 'Promotion active · not currently showing', tone: visible ? 'badge-success' : 'badge-warning', help: visible ? 'Your promotion can appear in eligible search results. Search filters, approval and availability still apply.' : 'The promotion dates remain in effect, but it is not currently eligible to appear. Check availability and approval, or ask support for help.' },
    expired: { label: 'Promotion ended', tone: 'badge-neutral', help: 'The paid placement has ended. Your car or profile can still appear normally if eligible. You can request another promotion.' },
    rejected: { label: 'Not approved', tone: 'badge-danger', help: 'Read the admin note below. If you have paid, contact support before making another payment.' },
    cancelled: { label: 'Cancelled', tone: 'badge-neutral', help: 'This request is closed and is not being promoted. Contact support if you paid or need help with a refund.' },
  };
  return states[status];
}
export const isCurrentPromotion = (request: PromotionRequest) => ['awaiting_payment', 'pending', 'active'].includes(promotionStatus(request));
