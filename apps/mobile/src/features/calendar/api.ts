// Side-effect import, KHÔNG xoá: nạp module này là lúc client mặc định được cấu hình.
import '@/lib/api-client';

export { calendarApi, calendarRangeParams, CALENDAR_SORT_VALUES } from '@/api/calendar/api';

export type {
  BulkDayBlockInput,
  BulkDayBlockResult,
  BulkDayPreview,
  BulkDayPriceInput,
  BulkDayPriceResult,
  BulkDayVehicle,
  CalendarAvailability,
  CalendarAvailabilityDay,
  CalendarDailyPrice,
  CalendarEvent,
  CalendarFilters,
  CalendarResource,
  CalendarSort,
  CreateVehicleBlockInput,
  Holiday,
  HolidayList,
  SaveDailyPricesInput,
  UpdateVehicleBlockInput,
  VehicleBlock,
  VehicleDailyPrice,
} from '@/api/calendar/api';
