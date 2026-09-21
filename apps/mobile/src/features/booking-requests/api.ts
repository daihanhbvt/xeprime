// Side-effect import, KHÔNG xoá: nạp module này là lúc client mặc định được cấu hình.
import '@/lib/api-client';

export {
  bookingRequestsApi,
  bookingRequestFiltersToParams,
  BOOKING_REQUESTS_DEFAULT_LIMIT,
  BOOKING_REQUEST_NEEDS_ACTION_STATUSES,
  BOOKING_REQUEST_STATUS_ALL,
  BOOKING_REQUEST_TAB_NEEDS_ACTION,
  BUSY_DAYS_LOOKAHEAD,
} from '@/api/booking-requests/api';
export { publicQuote, deliveryDistance } from '@/api/marketplace/api';

export type {
  ApproveBookingRequestInput,
  BookingRequestDecisionTarget,
  BookingRequestFilters,
  BookingRequestItem,
  BookingRequestListMeta,
  BookingRequestListResult,
  BookingRequestReceipt,
  CheckAvailabilityResult,
  CreateBookingRequestInput,
  VehicleBusyDays,
} from '@/api/booking-requests/api';
export type { PublicQuote, PublicQuoteParams, DeliveryDistance } from '@/api/marketplace/api';
