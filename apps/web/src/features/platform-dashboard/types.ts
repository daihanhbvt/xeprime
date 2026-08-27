import type { components } from '@xeprime/types';

/** Type dashboard nền tảng lấy từ contract OpenAPI (ADR 0007). */
type Schemas = components['schemas'];

export type PlatformDashboardSummary = Schemas['PlatformDashboardSummaryDto'];
export type PlatformRecentTenant = Schemas['PlatformRecentTenantDto'];
