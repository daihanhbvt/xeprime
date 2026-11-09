import type { components } from '@xeprime/types';

/** Type màn "Gói của tôi" lấy từ contract OpenAPI (ADR 0007) - không viết tay DTO. */
type Schemas = components['schemas'];

export type MySubscription = Schemas['MySubscriptionDto'];
/** Một kỳ gói đang hiệu lực - tối đa một mỗi phạm vi loại xe (ADR 0065). */
export type CurrentPlan = Schemas['CurrentPlanDto'];
/** Hạn mức THEO LOẠI xe - nguồn chính của màn gói (ADR 0065). */
export type VehicleTypeQuota = Schemas['VehicleTypeQuotaDto'];
export type TenantPlan = Schemas['TenantPlanDto'];
export type SubscriptionInvoice = Schemas['SubscriptionInvoiceDto'];
/**
 * Phong bì của `GET /subscription/invoices/pending` (ADR 0040 · ADR 0065).
 *
 * Hook mở phong bì ngay tại biên (`fetchPendingInvoices`) để phần còn lại của web chỉ thấy
 * `SubscriptionInvoice[]` - tối đa một mỗi phạm vi loại xe; alias này tồn tại để biên đó vẫn đọc
 * type TỪ CONTRACT, không phải một generic viết tay (ADR 0007).
 */
export type PendingSubscriptionInvoice = Schemas['PendingSubscriptionInvoiceDto'];
export type PurchaseSubscriptionInput = Schemas['PurchaseSubscriptionDto'];
/** `POST /subscription/purchase` - một gói + lựa chọn xe giữ lại khi vượt suất (ADR 0085). */
export type PurchaseSubscriptionRequest = Schemas['PurchaseSubscriptionRequestDto'];
/** Một nhóm suất sẽ vượt sau lượt mua + các xe đang chiếm suất của nhóm (ADR 0085). */
export type PlanSlotOverflow = Schemas['PlanSlotOverflowDto'];
export type PlanSlotVehicle = Schemas['PlanSlotVehicleDto'];
/** Phiếu thanh toán gộp nhiều gói (ADR 0083). */
export type SubscriptionCheckout = Schemas['SubscriptionCheckoutDto'];
export type CreateSubscriptionCheckoutInput = Schemas['CreateSubscriptionCheckoutDto'];
/** Xem trước một lượt mua - loại lượt mua, kỳ dự kiến, kỳ sẽ kết thúc (ADR 0084). */
export type SubscriptionPurchasePreview = Schemas['SubscriptionPurchasePreviewDto'];
export type SubscriptionPurchasePreviewItem = Schemas['SubscriptionPurchasePreviewItemDto'];
export type SlotUsage = Schemas['SlotUsageDto'];
export type PaymentInfo = Schemas['PaymentInfoDto'];
