import {
  apiDelete,
  apiGet,
  apiPatch,
  apiPost,
  apiPut,
  type QueryParams,
} from '@/services/api-client';
import type {
  CalendarAvailability,
  CalendarDailyPrice,
  CalendarEvent,
  CalendarQuote,
  CalendarResource,
  BulkDayBlockInput,
  BulkDayBlockResult,
  BulkDayPreview,
  BulkDayPriceInput,
  BulkDayPriceResult,
  CreateVehicleBlockInput,
  HolidayList,
  SaveDailyPricesInput,
  UpdateVehicleBlockInput,
  VehicleBlock,
  VehicleDailyPrice,
} from './types/calendar.types';

/**
 * API lịch xe. Các endpoint LIST của lịch cố ý nhẹ (chỉ đủ để vẽ lưới) — chi tiết một event
 * chỉ tải khi người dùng mở nó (đơn: `/bookings/:id` · khoá: `/vehicle-blocks/:id` ·
 * bảo dưỡng: records của xe).
 */
export const fetchCalendarResources = (query: QueryParams): Promise<CalendarResource[]> =>
  apiGet<CalendarResource[]>('/calendar/resources', query);

export const fetchCalendarEvents = (query: QueryParams): Promise<CalendarEvent[]> =>
  apiGet<CalendarEvent[]>('/calendar/events', query);

/** Hàng "Xe còn trống" — backend đếm trên toàn đội xe đã lọc, không phụ thuộc hàng đang render. */
export const fetchCalendarAvailability = (query: QueryParams): Promise<CalendarAvailability> =>
  apiGet<CalendarAvailability>('/calendar/availability', query);

/** Dấu "giá riêng" cho mọi xe đang lọc trong khoảng xem — MỘT request cho cả lưới. */
export const fetchCalendarDailyPrices = (query: QueryParams): Promise<CalendarDailyPrice[]> =>
  apiGet<CalendarDailyPrice[]>('/calendar/daily-prices', query);

/**
 * Báo giá NỘI BỘ cho luồng "Đặt xe" trên lịch — cùng PricingService với báo giá công khai
 * (gồm cả giá riêng theo ngày) nhưng scope theo tenant, xe chưa lên chợ vẫn báo được.
 * Xe chưa cấu hình giá → 400, luồng rơi về nhập tiền tay.
 */
/**
 * Báo giá nội bộ cho đơn sắp lập. Hai hình thái, đúng hai mô hình giá: dịch vụ theo NGÀY gửi
 * khoảng nhận–trả; THUÊ DÀI HẠN gửi `packageMonths` và không gửi ngày (ADR 0011).
 */
export type CalendarQuoteParams =
  | { vehicleId: string; serviceType: 'long_term'; packageMonths: number }
  | {
      vehicleId: string;
      pickupAt: string;
      returnAt: string;
      serviceType?: string;
      routeType?: string;
    };

export const fetchCalendarQuote = (query: CalendarQuoteParams): Promise<CalendarQuote> =>
  apiGet<CalendarQuote>('/calendar/quote', query);

// ── Khoá xe (blocked_range) ────────────────────────────────────────────────

export const fetchVehicleBlock = (id: string): Promise<VehicleBlock> =>
  apiGet<VehicleBlock>(`/vehicle-blocks/${id}`);

export const createVehicleBlock = (body: CreateVehicleBlockInput): Promise<VehicleBlock> =>
  apiPost<VehicleBlock>('/vehicle-blocks', body);

export const updateVehicleBlock = (
  id: string,
  body: UpdateVehicleBlockInput,
): Promise<VehicleBlock> => apiPatch<VehicleBlock>(`/vehicle-blocks/${id}`, body);

export const deleteVehicleBlock = (id: string): Promise<void> =>
  apiDelete<void>(`/vehicle-blocks/${id}`);

// ── Giá riêng theo ngày của MỘT xe ─────────────────────────────────────────

export const fetchVehicleDailyPrices = (
  vehicleId: string,
  from: string,
  to: string,
): Promise<VehicleDailyPrice[]> =>
  apiGet<VehicleDailyPrice[]>(`/vehicles/${vehicleId}/daily-prices`, { from, to });

export const saveVehicleDailyPrices = (
  vehicleId: string,
  body: SaveDailyPricesInput,
): Promise<VehicleDailyPrice[]> =>
  apiPut<VehicleDailyPrice[]>(`/vehicles/${vehicleId}/daily-prices`, body);

/** Khôi phục giá mặc định cho [from, to] — DELETE nhận khoảng qua query (không có body). */
export const deleteVehicleDailyPrices = (
  vehicleId: string,
  from: string,
  to: string,
): Promise<{ deleted: number }> =>
  apiDelete<{ deleted: number }>(
    `/vehicles/${vehicleId}/daily-prices?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
  );

// ── Ngày lễ (dữ liệu toàn nền tảng, chỉ để hiển thị) ───────────────────────

/**
 * Ngày lễ giao với khoảng đang xem. Endpoint công khai, KHÔNG mang tenant — bảng nguồn không
 * có `tenant_id` vì ngày lễ là dữ kiện của quốc gia, không phải dữ liệu của gian hàng.
 */
export const fetchHolidays = (from: string, to: string): Promise<HolidayList> =>
  apiGet<HolidayList>('/holidays', { from, to });

// ── Thao tác hàng loạt cho một khoảng ngày ────────────────────────────────

/**
 * Tập xe bị ảnh hưởng + giá niêm yết + ngày bận. MỘT endpoint cho cả hai dialog (khoá và giá)
 * vì chúng hỏi cùng một câu; tách đôi chỉ tạo thêm một chỗ để hai bên lệch nhau.
 */
export const fetchBulkDayPreview = (query: QueryParams): Promise<BulkDayPreview> =>
  apiGet<BulkDayPreview>('/calendar/bulk-day/preview', query);

export const bulkBlockDay = (body: BulkDayBlockInput): Promise<BulkDayBlockResult> =>
  apiPost<BulkDayBlockResult>('/calendar/bulk-day/blocks', body);

export const releaseBulkBlockBatch = (batchId: string): Promise<{ released: number }> =>
  apiDelete<{ released: number }>(`/calendar/bulk-day/blocks/${batchId}`);

export const bulkPriceDay = (body: BulkDayPriceInput): Promise<BulkDayPriceResult> =>
  apiPut<BulkDayPriceResult>('/calendar/bulk-day/prices', body);

export const bulkRestoreDayPrices = (body: BulkDayPriceInput): Promise<BulkDayPriceResult> =>
  apiPost<BulkDayPriceResult>('/calendar/bulk-day/prices/restore', body);
