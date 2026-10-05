import { PlatformDashboardView } from '@/features/platform-dashboard/components/PlatformDashboardView';

/** Tổng quan nền tảng — trước ADR 0051 là nhánh `platformRole` của trang gốc `/manage`. */
export default function AdminDashboardPage() {
  return <PlatformDashboardView />;
}
