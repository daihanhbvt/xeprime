import {
  BOOKING_REQUEST_STATUS,
  BOOKING_STATUS,
  SERVICE_TYPE,
  TENANT_CUSTOMER_RISK_LEVEL,
  VEHICLE_TYPE,
} from '@xeprime/types';
import type { BookingRequestItem } from '@/features/booking-requests/types';
import type { BookingListItem } from './types';

/**
 * Dữ liệu mẫu cho test màn "Đơn thuê xe" gộp — dùng chung cho dạng List (`rentals-list.test.tsx`)
 * và Kanban (`rentals-board.test.tsx`). Chỉ dành cho test.
 */
export const HOUR = 3_600_000;
export const PICKUP_AT = '2026-08-19T03:00:00.000Z';
export const RETURN_AT = '2026-08-22T03:00:00.000Z';

export function request(overrides: Partial<BookingRequestItem> = {}): BookingRequestItem {
  return {
    id: 'req-1',
    vehicleId: 'veh-1',
    vehicleName: 'Kia Carnival 2025',
    vehiclePlate: '51A-123.45',
    vehicleCode: 'XE-001',
    vehicleImageUrl: 'https://cdn.test/kia.jpg',
    vehicleType: VEHICLE_TYPE.CAR,
    status: BOOKING_REQUEST_STATUS.PENDING_HOST_APPROVAL,
    customerName: 'Nguyễn Văn An',
    customerPhone: '0901234567',
    customerEmail: 'an@test.vn',
    tenantCustomerId: 'cus-1',
    customerAvatarUrl: null,
    customerRiskLevel: TENANT_CUSTOMER_RISK_LEVEL.NORMAL,
    canMessageOnPlatform: true,
    chatOpen: true,
    pickupAt: PICKUP_AT,
    returnAt: RETURN_AT,
    serviceType: SERVICE_TYPE.SELF_DRIVE,
    longTermPackageMonths: null,
    pickupPreference: null,
    requestedPickupDate: null,
    pickupWindowStartDate: null,
    pickupWindowEndDate: null,
    routeType: null,
    pickupAddress: null,
    destination: null,
    note: null,
    deliveryRequested: false,
    deliveryAddress: null,
    deliveryQuote: null,
    rejectReason: null,
    bookingId: null,
    bookingCode: null,
    createdAt: '2026-08-18T02:00:00.000Z',
    respondBy: new Date(Date.now() + 30 * 60_000).toISOString(),
    decidedAt: null,
    holdExpiresAt: null,
    paymentReminderAvailableAt: null,
    pricing: null,
    approvalPreview: null,
    ...overrides,
  } as BookingRequestItem;
}

export function booking(over: Partial<BookingListItem> & { id: string }): BookingListItem {
  return {
    code: `XP-${over.id}`,
    vehicleId: 'V1',
    vehicleName: 'Hyundai Grand i10',
    vehiclePlate: '43A-276.16',
    vehicleType: VEHICLE_TYPE.CAR,
    seatCount: 4,
    customerName: `Khách ${over.id}`,
    customerPhone: '0900000000',
    status: BOOKING_STATUS.RESERVED,
    serviceType: SERVICE_TYPE.SELF_DRIVE,
    longTermPackageMonths: null,
    pickupAt: new Date(Date.now() + 26 * HOUR).toISOString(),
    returnAt: new Date(Date.now() + 72 * HOUR).toISOString(),
    totalAmount: '1500000',
    paidAmount: '0',
    collectedAmount: '0',
    debtAmount: '1500000',
    customerTotalAmount: null,
    holdPaidAmount: null,
    payAtPickupAmount: null,
    canMessageOnPlatform: false,
    bookingRequestId: null,
    driver: null,
    handoverPlaceKind: null,
    createdAt: new Date().toISOString(),
    ...over,
  } as BookingListItem;
}
