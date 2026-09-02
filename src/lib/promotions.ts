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
