import type { components } from '@xeprime/types';
import { getApiClient, type QueryParams } from '@xeprime/api-client';

/** Type Tổng quan partner lấy từ contract OpenAPI (ADR 0007) — không khai tay. */
type Schemas = components['schemas'];

export type PartnerOverview = Schemas['PartnerDashboardOverviewDto'];
export type PartnerOverviewToday = Schemas['PartnerDashboardTodayDto'];
export type PartnerOverviewRequests = Schemas['PartnerDashboardRequestsDto'];
export type PartnerOverviewAgenda = Schemas['PartnerDashboardAgendaDto'];
export type PartnerAgendaItem = Schemas['PartnerDashboardAgendaItemDto'];
export type PartnerOverviewMonth = Schemas['PartnerDashboardMonthDto'];
export type PartnerTrendPoint = Schemas['PartnerDashboardTrendPointDto'];
export type PartnerOverviewMarket = Schemas['PartnerDashboardMarketDto'];

/**
 * Tham số của `GET /dashboard/overview` — dùng CHUNG cho request và query key (key lệch request
 * một trường là hai bản cache cho cùng một câu hỏi). `null` để tham số vắng hẳn khỏi URL.
 * Bản native của `partnerOverviewParams` bên web (ADR 0031 — mỗi app một bản).
 */
export const partnerOverviewParams = (branchId?: string): QueryParams => ({
  branchId: branchId ?? null,
});

export const dashboardApi = {
  /**
   * Việc giao/nhận, yêu cầu chờ duyệt, lịch 7 ngày, tháng này so cùng kỳ, xe trên chợ, uy tín —
   * cả hai tuyến. Tiền KHÔNG ở đây: tuyến gói đọc sổ thu chi, chủ xe đọc sổ ví. Khối thiếu quyền
   * về `null` — nơi hiển thị ẩn khối đó, không vẽ số 0. Tenant scope do server lấy từ phiên.
   */
  overview(branchId?: string): Promise<PartnerOverview> {
    return getApiClient().get<PartnerOverview>('/dashboard/overview', partnerOverviewParams(branchId));
  },
};
