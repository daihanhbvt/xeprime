import type { components } from '@xeprime/types';

type Schemas = components['schemas'];

/** Tờ khai một kỳ nhìn từ ADMIN — Phase 8. */
export type TaxPeriodSummary = Schemas['TaxPeriodSummaryDto'];
export type TaxRow = Schemas['TaxRowDto'];
export type TaxRowPage = Schemas['TaxRowPageDto'];
/** "Thuế đã khấu trừ trong kỳ" nhìn từ CHỦ XE. */
export type TenantTaxSummary = Schemas['TenantTaxSummaryDto'];

/** Bỏ trống `status` = mọi trạng thái của kỳ. */
export interface TaxRowFilters {
  period?: string;
  status?: string | null;
  tenantId?: string | null;
  page?: number;
}
