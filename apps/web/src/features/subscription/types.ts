import type { components } from '@xeprime/types';

/** Type màn "Gói của tôi" lấy từ contract OpenAPI (ADR 0007) — không viết tay DTO. */
type Schemas = components['schemas'];

export type MySubscription = Schemas['MySubscriptionDto'];
export type TenantPlan = Schemas['TenantPlanDto'];
export type SubscriptionInvoice = Schemas['SubscriptionInvoiceDto'];
export type PurchaseSubscriptionInput = Schemas['PurchaseSubscriptionDto'];
export type SlotUsage = Schemas['SlotUsageDto'];
export type PaymentInfo = Schemas['PaymentInfoDto'];
