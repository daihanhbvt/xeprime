'use client';

import { useCurrentUser } from '@/hooks/use-current-user';
import { PlatformDashboardView } from '@/features/platform-dashboard/components/PlatformDashboardView';
import { DashboardView } from './DashboardView';

/**
 * `/manage` là dashboard chung: có `platformRole` → dashboard nền tảng, còn lại → dashboard
 * gian hàng (cùng predicate scope với AppShell/nav). `useCurrentUser` đã được AppShell nạp
 * và cache nên không flash; user null thì AppShell đã chặn từ ngoài.
 */
export function ManageHome() {
  const { data: user } = useCurrentUser();
  return user?.platformRole ? <PlatformDashboardView /> : <DashboardView />;
}
