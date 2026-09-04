export type Role = 'owner' | 'driver' | 'admin';

export type VerificationStatus = 'unverified' | 'pending' | 'approved' | 'rejected';
export type ListingApprovalStatus = 'pending' | 'approved' | 'rejected';

export interface Profile {
  document_listing_visibility?: 'public' | 'private' | 'deleted';
  platform_history_approved?: boolean;
  platform_history_submitted?: boolean;
  platform_history_valid_until?: string | null;
  sponsored?: boolean;
  id: string;
  email: string | null;
  role: Role;
  full_name: string;
  phone: string | null;
  avatar_url: string | null;
  avatar_pending_url: string | null;
  avatar_upload_status: 'none' | 'pending' | 'approved' | 'rejected';
  avatar_rejection_reason: string | null;
  bio: string | null;
  location: string | null;
  preferred_locations: string[];
  availability: string;
  languages: string[];
  age: number | null;
  driving_experience_years: number;
  platforms_worked: string[];
  id_number: string | null;
  licence_number: string | null;
  licence_expiry: string | null;
  psv_badge_expiry: string | null;
  good_conduct_expiry: string | null;
  is_verified: boolean;
  verification_status: VerificationStatus;
  is_suspended: boolean;
  suspension_reason: string | null;
  suspended_at: string | null;
  rating: number;
  rating_count: number;
  contracts_completed: number;
  onboarding_completed: boolean;
  last_seen_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface Vehicle {
  document_listing_visibility?: 'public' | 'private' | 'deleted';
  sponsored?: boolean;
  deleted_at?: string | null;
  id: string;
  owner_id: string;
  plate_prefix?: string | null;
  make: string;
  model: string;
  year: number;
  transmission: 'automatic' | 'manual';
  fuel_type: 'petrol' | 'diesel' | 'hybrid' | 'electric';
  location: string;
  registered_platforms: ('uber' | 'bolt' | 'little' | 'faras' | 'other')[];
  weekly_target: number | null;
  monthly_target: number | null;
  deposit: number;
  driver_experience: string | null;
  minimum_driver_experience_years: number;
  requirements: string | null;
  availability: string;
  insurance_type: 'third_party' | 'comprehensive' | 'none';
  insurance_expiry: string | null;
  status: 'active' | 'closed';
  approval_status: ListingApprovalStatus;
  approval_note: string | null;
  approved_at: string | null;
  approved_by: string | null;
  featured: boolean;
  available_from: string | null;
  created_at: string;
  updated_at: string;
}

export interface VehiclePhoto {
  id: string;
  vehicle_id: string;
  photo_url: string;
  position: number;
  approved: boolean;
  rejected: boolean;
  rejection_reason: string | null;
  created_at: string;
}

export interface VehicleIssue {
  id: string;
  vehicle_id: string;
  description: string;
  severity: 'minor' | 'moderate' | 'major';
  created_at: string;
}

export interface VehicleWithRelations extends Vehicle {
  owner?: Profile;
  photos?: VehiclePhoto[];
  issues?: VehicleIssue[];
  favorite_id?: string;
}

export interface DocumentRow {
  id: string;
  user_id: string;
  type: string;
  file_url: string;
  label: string | null;
  expiry_date: string | null;
  verified: boolean;
  rejected: boolean;
  rejection_reason: string | null;
  created_at: string;
}

export interface PlatformHistory {
  review_status?: 'draft' | 'pending' | 'approved' | 'rejected';
  submitted_at?: string | null;
  reviewed_at?: string | null;
  expires_at?: string | null;
  rejection_reason?: string | null;
  id: string;
  driver_id: string;
  platform: 'uber' | 'bolt' | 'little' | 'faras' | 'other';
  months_active: number;
  trips: number;
  rating: number | null;
  proof_url: string | null;
  approved: boolean;
  created_at: string;
}

export interface ContactMessage {
  id: string;
  user_id: string | null;
  name: string;
  email: string;
  message: string;
  status: 'new' | 'open' | 'resolved';
  created_at: string;
  updated_at: string;
  resolved_at: string | null;
  user?: Profile;
  entries?: ContactMessageEntry[];
}

export interface ContactMessageEntry {
  delivered_at?: string | null;
  read_at?: string | null;
  unsent_at?: string | null;
  id: string;
  contact_message_id: string;
  sender_id: string | null;
  sender_role: 'guest' | 'user' | 'admin';
  body: string | null;
  attachment_path: string | null;
  attachment_name: string | null;
  attachment_type: string | null;
  attachment_size: number | null;
  created_at: string;
  sender?: Profile;
}

export interface TrustPassport {
  account_created_at: string;
  contracts_completed: number;
  rating: number;
  rating_count: number;
  approved_evidence: number;
  approved_platform_history: number;
  trust_level: 'new' | 'building' | 'established';
  account_standing: 'good' | 'restricted';
}

export type ApplicationStatus = 'pending' | 'accepted' | 'rejected' | 'withdrawn' | 'completed';

export interface Application {
  id: string;
  vehicle_id: string;
  driver_id: string;
  owner_id: string;
  status: ApplicationStatus;
  message: string | null;
  created_at: string;
  updated_at: string;
}

export interface Conversation {
  id: string;
  application_id: string | null;
  connection_id: string | null;
  vehicle_id: string | null;
  driver_id: string | null;
  owner_id: string | null;
  admin_id: string | null;
  last_message_at: string | null;
  closed_at: string | null;
  closed_by: string | null;
  support_reopened_at: string | null;
  support_reopened_by: string | null;
  support_resolved_at: string | null;
  admin_closed_at: string | null;
  admin_closed_by: string | null;
  support_reopened_from_member_end: boolean;
  created_at: string;
  vehicle?: Vehicle;
  driver?: Profile;
  owner?: Profile;
  admin?: Profile;
  connection?: { status: ConnectionStatus } | null;
  application?: { status: ApplicationStatus } | null;
}

export interface Message {
  delivered_at?: string | null;
  id: string;
  conversation_id: string;
  sender_id: string;
  content: string | null;
  type: 'text' | 'image' | 'file' | 'system';
  read: boolean;
  created_at: string;
  sender?: Profile;
}

export interface Review {
  id: string;
  application_id: string;
  reviewer_id: string;
  reviewee_id: string;
  rating: number;
  content: string | null;
  created_at: string;
  reviewer?: Profile;
}

export interface Notification {
  id: string;
  user_id: string;
  type: string;
  title: string;
  body: string | null;
  data: Record<string, unknown> | null;
  read: boolean;
  created_at: string;
}

export interface Report {
  id: string;
  reporter_id: string;
  reported_id: string | null;
  target_type: 'user' | 'listing' | 'conversation' | 'review';
  target_id: string | null;
  reason: string;
  description: string | null;
  status: 'open' | 'reviewing' | 'resolved' | 'dismissed';
  created_at: string;
}

export interface UserWarning {
  id: string;
  user_id: string;
  report_id: string;
  admin_id: string;
  message: string;
  report_reason: string;
  report_description: string | null;
  created_at: string;
}

export interface Favorite {
  id: string;
  user_id: string;
  vehicle_id: string;
  created_at: string;
}

export type ConnectionStatus = 'pending' | 'accepted' | 'rejected' | 'withdrawn' | 'expired' | 'ended';

export interface Connection {
  id: string;
  requester_id: string;
  recipient_id: string;
  vehicle_id: string | null;
  status: ConnectionStatus;
  message: string | null;
  created_at: string;
  updated_at: string;
  requester?: Profile;
  recipient?: Profile;
  vehicle?: Vehicle;
  conversation_id?: string;
}
