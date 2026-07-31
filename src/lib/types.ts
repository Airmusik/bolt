export type Role = 'owner' | 'driver' | 'admin';

export type VerificationStatus = 'unverified' | 'pending' | 'approved' | 'rejected';

export interface Profile {
  id: string;
  role: Role;
  full_name: string;
  phone: string | null;
  avatar_url: string | null;
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
  created_at: string;
  updated_at: string;
}

export interface Vehicle {
  id: string;
  owner_id: string;
  make: string;
  model: string;
  year: number;
  transmission: 'automatic' | 'manual';
  fuel_type: 'petrol' | 'diesel' | 'hybrid' | 'electric';
  location: string;
  weekly_target: number | null;
  monthly_target: number | null;
  deposit: number;
  driver_experience: string | null;
  requirements: string | null;
  availability: string;
  insurance_type: 'third_party' | 'comprehensive' | 'none';
  insurance_expiry: string | null;
  status: 'active' | 'closed';
  featured: boolean;
  created_at: string;
  updated_at: string;
}

export interface VehiclePhoto {
  id: string;
  vehicle_id: string;
  photo_url: string;
  position: number;
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
  id: string;
  driver_id: string;
  platform: 'uber' | 'bolt' | 'little' | 'faras' | 'other';
  months_active: number;
  trips: number;
  rating: number | null;
  proof_url: string | null;
  created_at: string;
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
  created_at: string;
  vehicle?: Vehicle;
  driver?: Profile;
  owner?: Profile;
  admin?: Profile;
}

export interface Message {
  id: string;
  conversation_id: string;
  sender_id: string;
  content: string | null;
  type: 'text' | 'image' | 'file' | 'system';
  read: boolean;
  created_at: string;
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
  data: any;
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

export interface Favorite {
  id: string;
  user_id: string;
  vehicle_id: string;
  created_at: string;
}

export type ConnectionStatus = 'pending' | 'accepted' | 'rejected' | 'withdrawn';

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
