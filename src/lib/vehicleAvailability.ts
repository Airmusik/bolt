import type { Vehicle } from './types';

export function isVehicleLive(vehicle: Pick<Vehicle, 'status' | 'availability' | 'approval_status' | 'deleted_at' | 'document_listing_visibility'>): boolean {
  return vehicle.status === 'active' && vehicle.availability === 'available'
    && vehicle.approval_status === 'approved' && !vehicle.deleted_at
    && (!vehicle.document_listing_visibility || vehicle.document_listing_visibility === 'public');
}

export const ACCEPT_CAR_CONNECTION_MESSAGE = 'The driver and this car will be on a connection. This listing becomes not live; the owner’s other live cars can still receive requests. The driver must end this connection before taking another car.';
export const END_CAR_CONNECTION_MESSAGE = 'This chat will become read-only and its complete history will remain saved. The driver becomes available again. The car stays not live until its owner sets it live. Other cars and connections are not affected.';
