/** Only complementary marketplace roles can start a connection. */
export function canRequestConnection(requesterRole?: string | null, recipientRole?: string | null): boolean {
  return (requesterRole === 'driver' && recipientRole === 'owner')
    || (requesterRole === 'owner' && recipientRole === 'driver');
}

export const CONNECTION_ROLE_MESSAGE = 'Connections are only between a driver and a car owner.';
