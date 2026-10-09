import { apiGet } from '@/services/api-client';
import type { PlatformDashboardOverview, PlatformDashboardSummary } from './types';

export const fetchPlatformSummary = (): Promise<PlatformDashboardSummary> =>
  apiGet<PlatformDashboardSummary>('/platform/dashboard/summary');

/**
 * KPI tháng (so cùng kỳ), xu hướng 30 ngày, phễu kích hoạt đối tác. Khối cần quyền riêng (GMV cần
 * quyền xem đơn, doanh thu nền tảng cần quyền tiền) về `null` khi thiếu quyền — server quyết.
 */
export const fetchPlatformOverview = (): Promise<PlatformDashboardOverview> =>
  apiGet<PlatformDashboardOverview>('/platform/dashboard/overview');
