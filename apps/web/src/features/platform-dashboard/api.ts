import { apiGet } from '@/services/api-client';
import type { PlatformDashboardSummary } from './types';

export const fetchPlatformSummary = (): Promise<PlatformDashboardSummary> =>
  apiGet<PlatformDashboardSummary>('/platform/dashboard/summary');
