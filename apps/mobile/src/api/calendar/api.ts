import type { components } from '@xeprime/types';
import { getApiClient, type QueryParams } from '@xeprime/api-client';

type Schemas = components['schemas'];

/** Một hàng của resource timeline — tương ứng một xe. */
export type CalendarResource = Schemas['CalendarResourceDto'];

/**
 * Một thanh event trên lịch.
 *
 * `startAt`/`endAt` là ISO-8601 **UTC** đúng như backend trả. Đổi sang giờ Asia/Ho_Chi_Minh chỉ
 * xảy ra lúc hiển thị — giữ UTC ở tầng dữ liệu để phép tính vị trí không phụ thuộc múi giờ của
 * thiết bị.
 */
export type CalendarEvent = Schemas['CalendarEventDto'];

export type CalendarAvailability = Schemas['CalendarAvailabilityDto'];
export type CalendarAvailabilityDay = Schemas['CalendarAvailabilityDayDto'];
export type CalendarDailyPrice = Schemas['CalendarDailyPriceDto'];

export type VehicleBlock = Schemas['VehicleBlockDto'];
export type CreateVehicleBlockInput = Schemas['CreateVehicleBlockDto'];
export type UpdateVehicleBlockInput = Schemas['UpdateVehicleBlockDto'];

export type VehicleDailyPrice = Schemas['VehicleDailyPriceDto'];
export type SaveDailyPricesInput = Schemas['SaveDailyPricesDto'];

export type BulkDayPreview = Schemas['BulkDayPreviewDto'];
export type BulkDayVehicle = Schemas['BulkDayVehicleDto'];
export type BulkDayBlockResult = Schemas['BulkDayBlockResultDto'];
export type BulkDayPriceResult = Schemas['BulkDayPriceResultDto'];
export type BulkDayBlockInput = Schemas['BulkDayBlockDto'];
export type BulkDayPriceInput = Schemas['BulkDayPriceDto'];

export type Holiday = Schemas['HolidayDto'];
export type HolidayList = Schemas['HolidayListDto'];

/** Khớp `CALENDAR_SORT_VALUES` ở backend DTO. */
export type CalendarSort = 'next_booking' | 'name' | 'price_asc' | 'price_desc';

/**
 * Thứ tự hàng xe — MÃ, khớp `CALENDAR_SORT_VALUES` của backend. Mặc định `next_booking`.
 *
 * Cố ý KHÔNG mang nhãn: mã lên API là dữ liệu, còn chữ hiện ra đổi theo ngôn ngữ. Thanh công cụ
 * tra nhãn ở `Calendar.toolbar.sort.<value>`.
 */
export const CALENDAR_SORT_VALUES = [
  'next_booking',
  'name',
  'price_asc',
  'price_desc',
] as const satisfies readonly CalendarSort[];

/** Bộ lọc lưới lịch — trạng thái của MÀN HÌNH; web đặt nó trên URL, app đặt ở state + route param. */
export interface CalendarFilters {
  /** ISO date `YYYY-MM-DD` của ngày đầu khoảng. */
  from: string;
  /** Số ngày hiển thị. */
  days: number;
  vehicleType: string | null;
  q: string | null;
  /** Chỉ ảnh hưởng `resources` — các query khác không mang nó. */
  sort: CalendarSort;
}

/**
 * Serialize bộ lọc thành query CHUNG cho resources/events/availability/daily-prices.
 *
 * `tenantId` KHÔNG bao giờ đi trên query — backend lấy từ membership (CLAUDE.md mục 6, lằn ranh
 * 1). Thấy chỗ nào thêm nó vào đây thì đó là lỗ bảo mật, không phải tính năng.
 */
export function calendarRangeParams(input: {
  startAt: string;
  endAt: string;
  vehicleType?: string | null;
  q?: string | null;
  branchId?: string | undefined;
}): QueryParams {
  return {
    startAt: input.startAt,
    endAt: input.endAt,
    vehicleType: input.vehicleType ?? null,
    q: input.q ?? null,
    branchId: input.branchId ?? null,
  };
}

/*
 * KHÔNG khai `/calendar/quote` ở đây.
 *
 * Nó đã có ở `src/api/bookings/api.ts` (`bookingsApi.quote`), là bản mà luồng đặt hộ thật sự
 * gọi. Hai khai báo cho một endpoint nghĩa là hai kiểu tham số cho một hợp đồng — đúng cái bẫy
 * ADR 0031 nói tới, chỉ khác là lần này ở trong CÙNG một app.
 */

const one = (id: string) => `/vehicle-blocks/${encodeURIComponent(id)}`;

/**
 * API lịch xe (CAL-01…03) — CÙNG endpoint với web, không có biến thể "mobile".
 *
 * Chỉ auth mới có hai bản (cookie ↔ Bearer, ADR 0002/0017); mọi API nghiệp vụ dùng chung. Các
 * endpoint LIST cố ý nhẹ (chỉ đủ vẽ lưới) — chi tiết một event tải khi người dùng mở nó.
 */
export const calendarApi = {
  resources(query: QueryParams): Promise<CalendarResource[]> {
    return getApiClient().get<CalendarResource[]>('/calendar/resources', query);
  },

  events(query: QueryParams): Promise<CalendarEvent[]> {
    return getApiClient().get<CalendarEvent[]>('/calendar/events', query);
  },

  /** Hàng "Xe còn trống" — backend đếm trên toàn đội xe đã lọc, không phụ thuộc hàng đang render. */
  availability(query: QueryParams): Promise<CalendarAvailability> {
    return getApiClient().get<CalendarAvailability>('/calendar/availability', query);
  },

  /** Dấu "giá riêng" cho mọi xe đang lọc trong khoảng xem — MỘT request cho cả lưới. */
  dailyPrices(query: QueryParams): Promise<CalendarDailyPrice[]> {
    return getApiClient().get<CalendarDailyPrice[]>('/calendar/daily-prices', query);
  },

  block(id: string): Promise<VehicleBlock> {
    return getApiClient().get<VehicleBlock>(one(id));
  },

  createBlock(body: CreateVehicleBlockInput): Promise<VehicleBlock> {
    return getApiClient().post<VehicleBlock>('/vehicle-blocks', body);
  },

  updateBlock(id: string, body: UpdateVehicleBlockInput): Promise<VehicleBlock> {
    return getApiClient().patch<VehicleBlock>(one(id), body);
  },

  deleteBlock(id: string): Promise<void> {
    return getApiClient().delete<void>(one(id));
  },

  vehicleDailyPrices(vehicleId: string, from: string, to: string): Promise<VehicleDailyPrice[]> {
    return getApiClient().get<VehicleDailyPrice[]>(
      `/vehicles/${encodeURIComponent(vehicleId)}/daily-prices`,
      { from, to },
    );
  },

  saveVehicleDailyPrices(
    vehicleId: string,
    body: SaveDailyPricesInput,
  ): Promise<VehicleDailyPrice[]> {
    return getApiClient().put<VehicleDailyPrice[]>(
      `/vehicles/${encodeURIComponent(vehicleId)}/daily-prices`,
      body,
    );
  },

  /** Khôi phục giá mặc định cho [from, to] — DELETE nhận khoảng qua query (không có body). */
  deleteVehicleDailyPrices(
    vehicleId: string,
    from: string,
    to: string,
  ): Promise<{ deleted: number }> {
    const range = `from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`;
    return getApiClient().delete<{ deleted: number }>(
      `/vehicles/${encodeURIComponent(vehicleId)}/daily-prices?${range}`,
    );
  },

  /**
   * Ngày lễ giao với khoảng đang xem. Endpoint công khai, KHÔNG mang tenant — bảng nguồn không
   * có `tenant_id` vì ngày lễ là dữ kiện của quốc gia, không phải dữ liệu của gian hàng.
   */
  holidays(from: string, to: string): Promise<HolidayList> {
    return getApiClient().get<HolidayList>('/holidays', { from, to });
  },

  /**
   * Tập xe bị ảnh hưởng + giá niêm yết + ngày bận. MỘT endpoint cho cả hai tấm trượt (khoá và
   * giá) vì chúng hỏi cùng một câu; tách đôi chỉ tạo thêm một chỗ để hai bên lệch nhau.
   */
  bulkDayPreview(query: QueryParams): Promise<BulkDayPreview> {
    return getApiClient().get<BulkDayPreview>('/calendar/bulk-day/preview', query);
  },

  bulkBlockDay(body: BulkDayBlockInput): Promise<BulkDayBlockResult> {
    return getApiClient().post<BulkDayBlockResult>('/calendar/bulk-day/blocks', body);
  },

  releaseBulkBlockBatch(batchId: string): Promise<{ released: number }> {
    return getApiClient().delete<{ released: number }>(
      `/calendar/bulk-day/blocks/${encodeURIComponent(batchId)}`,
    );
  },

  bulkPriceDay(body: BulkDayPriceInput): Promise<BulkDayPriceResult> {
    return getApiClient().put<BulkDayPriceResult>('/calendar/bulk-day/prices', body);
  },

  bulkRestoreDayPrices(body: BulkDayPriceInput): Promise<BulkDayPriceResult> {
    return getApiClient().post<BulkDayPriceResult>('/calendar/bulk-day/prices/restore', body);
  },
};
