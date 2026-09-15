import type { components } from '@xeprime/types';
import { getApiClient } from '@xeprime/api-client';

type Schemas = components['schemas'];

/** Shape lấy từ contract OpenAPI (ADR 0007) — KHÔNG viết tay lại DTO của backend. */
export type MyShop = Schemas['MyShopDto'];
export type ShopProfile = Schemas['TenantProfileDto'];
export type ShopDefaultBranch = Schemas['DefaultBranchDto'];
export type ShopLatestApproval = Schemas['LatestApprovalDto'];
export type RegisterShopInput = Schemas['RegisterShopDto'];
export type UpdateShopProfileInput = Schemas['UpdateTenantProfileDto'];
/** Gian hàng nhìn từ phiên hiện tại (`GET /tenants/current`) — tóm tắt, không phải hồ sơ. */
export type CurrentTenant = Schemas['CurrentTenantDto'];

/**
 * Gian hàng của TÔI — đăng ký (SHP-01), hồ sơ và gửi duyệt (SHP-02).
 *
 * Không endpoint nào ở đây nhận `tenantId`: backend lấy từ membership của phiên
 * (CLAUDE.md mục 5). `register` là ngoại lệ duy nhất không cần tenant scope — nó dành cho người
 * CHƯA thuộc gian hàng nào, và service từ chối nếu họ đã có.
 *
 * Client KHÔNG bao giờ đặt `status`/`approved_public`: trạng thái duyệt do backend quyết định,
 * `submitReview` chỉ là yêu cầu chuyển trạng thái.
 */
export type PaymentSettings = Schemas['PaymentSettingsDto'];
export type UpdatePaymentSettingsInput = Schemas['UpdatePaymentSettingsDto'];

export const tenantsApi = {
  register(body: RegisterShopInput): Promise<MyShop> {
    return getApiClient().post<MyShop>('/tenants', body);
  },

  current(): Promise<CurrentTenant> {
    return getApiClient().get<CurrentTenant>('/tenants/current');
  },

  myShop(): Promise<MyShop> {
    return getApiClient().get<MyShop>('/tenants/current/shop');
  },

  updateProfile(body: UpdateShopProfileInput): Promise<MyShop> {
    return getApiClient().patch<MyShop>('/tenants/current/profile', body);
  },

  submitReview(): Promise<MyShop> {
    return getApiClient().post<MyShop>('/tenants/current/submit-review', {});
  },

  /**
   * Công tắc THU CỌC qua XePrime (Phase 6 — ADR 0032 điều 2).
   *
   * Khác chính sách thuê của gian hàng: ở đó là cọc/thế chấp GIỮA gian hàng và khách (tài sản,
   * giấy tờ), ở đây là khoản `D` XePrime THU HỘ trước chuyến. Hai khái niệm tiền khác nhau.
   */
  paymentSettings(): Promise<PaymentSettings> {
    return getApiClient().get<PaymentSettings>('/shop/payment-settings');
  },

  updatePaymentSettings(body: UpdatePaymentSettingsInput): Promise<PaymentSettings> {
    return getApiClient().patch<PaymentSettings>('/shop/payment-settings', body);
  },
};
