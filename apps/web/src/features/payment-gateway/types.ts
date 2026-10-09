import type { components } from '@xeprime/types';

/** Type sinh từ OpenAPI (ADR 0007) — không viết tay DTO. */
type Schemas = components['schemas'];

export type PaymentGatewayMethods = Schemas['PaymentGatewayMethodsDto'];
export type PaymentGatewayMethod = Schemas['PaymentGatewayMethodDto'];
export type PaymentOrder = Schemas['PaymentOrderDto'];
export type StartGatewayCheckoutInput = Schemas['StartGatewayCheckoutDto'];

/**
 * Bề mặt của người trả — hai site gọi hai endpoint khác nhau cho cùng một khái niệm (khách: tiền giữ
 * chỗ · đối tác: hoá đơn gói). Không phải một quyền: server tự gác bằng realm + phạm vi.
 */
export const PAYMENT_SURFACE = {
  CUSTOMER: 'customer',
  PARTNER: 'partner',
} as const;

export type PaymentSurface = (typeof PAYMENT_SURFACE)[keyof typeof PAYMENT_SURFACE];

/** Khoản đang trả — quyết định bề mặt và endpoint mở phiên. */
export type GatewayTarget =
  | { readonly kind: 'trip'; readonly tripId: string }
  | { readonly kind: 'invoice'; readonly invoiceId: string };

export function surfaceOf(target: GatewayTarget): PaymentSurface {
  return target.kind === 'trip' ? PAYMENT_SURFACE.CUSTOMER : PAYMENT_SURFACE.PARTNER;
}
