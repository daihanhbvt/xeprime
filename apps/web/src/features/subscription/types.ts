import type { components } from '@xeprime/types';

/** Type màn "Gói của tôi" lấy từ contract OpenAPI (ADR 0007) — không viết tay DTO. */
type Schemas = components['schemas'];

export type MySubscription = Schemas['MySubscriptionDto'];
export type TenantPlan = Schemas['TenantPlanDto'];
export type SubscriptionInvoice = Schemas['SubscriptionInvoiceDto'];
/**
 * Phong bì của `GET /subscription/invoices/pending` — `invoice` CÓ THỂ null (ADR 0040).
 *
 * Hook mở phong bì ngay tại biên (`fetchPendingInvoice`) để phần còn lại của web chỉ thấy
 * `SubscriptionInvoice | null`; alias này tồn tại để biên đó vẫn đọc type TỪ CONTRACT, không
 * phải một generic viết tay (ADR 0007).
 */
export type PendingSubscriptionInvoice = Schemas['PendingSubscriptionInvoiceDto'];
export type PurchaseSubscriptionInput = Schemas['PurchaseSubscriptionDto'];
export type SlotUsage = Schemas['SlotUsageDto'];
export type PaymentInfo = Schemas['PaymentInfoDto'];
