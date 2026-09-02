export type DashboardTab = 'overview' | 'drivers' | 'vehicles' | 'cars' | 'applications' | 'connections' | 'chats';
export type MemberRole = 'owner' | 'driver';

export function dashboardDestination(tab: DashboardTab) {
  if (tab === 'overview') return '/dashboard';
  if (tab === 'chats') return '/chat';
  return `/dashboard?tab=${tab}`;
}

export function getDashboardTabs(role: MemberRole) {
  const tabs: { id: DashboardTab; label: string; shortLabel: string }[] = [
    { id: 'overview', label: 'Overview', shortLabel: 'Overview' },
    ...(role === 'owner'
      ? [{ id: 'drivers' as const, label: 'Available drivers', shortLabel: 'Drivers' }, { id: 'vehicles' as const, label: 'My vehicles', shortLabel: 'Vehicles' }]
      : [{ id: 'cars' as const, label: 'Available cars', shortLabel: 'Cars' }]),
    { id: 'applications', label: role === 'owner' ? 'Applications' : 'My applications', shortLabel: 'Applications' },
    { id: 'connections', label: 'Connections', shortLabel: 'Connections' },
    { id: 'chats', label: 'Chats', shortLabel: 'Chats' },
  ];
  return tabs;
}

export function dashboardTabFromSearch(role: MemberRole, search: string): DashboardTab {
  const requested = new URLSearchParams(search).get('tab');
  return getDashboardTabs(role).find((tab) => tab.id === requested)?.id || 'overview';
}

export function activeDashboardTab(role: MemberRole, pathname: string, search: string): DashboardTab | null {
  if (pathname === '/dashboard') return dashboardTabFromSearch(role, search);
  if (pathname === '/chat' || pathname.startsWith('/chat/')) return 'chats';
  if (pathname.startsWith('/vehicles/')) return role === 'owner' ? 'vehicles' : 'cars';
  if (pathname === '/browse-cars' && role === 'driver') return 'cars';
  if (pathname === '/browse-drivers' && role === 'owner') return 'drivers';
  return null;
}
