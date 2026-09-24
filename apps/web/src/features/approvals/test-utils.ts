import {
  APPROVAL_STATUS,
  STOREFRONT_KIND,
  VEHICLE_REVIEW_BASIS,
  VEHICLE_REVIEW_CHECK_VALUES,
} from '@xeprime/types';
import type { VehicleApprovalDetail } from './types';

/**
 * Hồ sơ duyệt MẪU cho test — đúng hình dạng DTO `GET /platform/vehicle-approvals/:id`.
 *
 * Ba biến thể có chủ đích: ô tô xăng của GIAN HÀNG (giao xe + giới hạn km + tự nhận + điều khoản),
 * xe máy của CÁ NHÂN, và ô tô ĐIỆN. Mỗi biến thể khoá một nhánh của `vehicleFieldPolicy`.
 */
export function carReview(over: Partial<VehicleApprovalDetail> = {}): VehicleApprovalDetail {
  return {
    approvalTaskId: '01TASKCAR0000000000000000',
    approvalStatus: APPROVAL_STATUS.PENDING,
    submittedAt: '2026-06-08T02:00:00.000Z',
    reviewedAt: null,
    reviewedByName: null,
    reason: null,
    basis: VEHICLE_REVIEW_BASIS.SNAPSHOT,
    capturedAt: '2026-06-08T02:00:00.000Z',
    approvalBlockers: { missingRequirements: [], changedLockedFields: [] },
    vehicle: {
      id: '01VEHCAR00000000000000000',
      code: 'XE-240608-014',
      name: 'Toyota Vios 2023',
      plateNumber: '75A-123.45',
      vehicleType: 'car',
      serviceTypes: ['self_drive'],
      brand: 'toyota',
      model: 'Vios',
      manufactureYear: 2023,
      color: 'Trắng',
      seatCount: 5,
      bodyType: 'sedan',
      motorbikeCategory: null,
      fuelType: 'gasoline',
      transmission: 'automatic',
      fuelConsumptionCombined: '6.2',
      engineDisplacementCc: null,
      electricRangeKm: null,
      batteryCapacityKwh: null,
      electricConsumptionKwhPer100Km: null,
      description: 'Xe gia đình, nội thất sạch.',
      mainImageUrl: 'https://img.example/vios-main.jpg',
      images: [
        'https://img.example/vios-main.jpg',
        'https://img.example/vios-1.jpg',
        'https://img.example/vios-2.jpg',
        'https://img.example/vios-3.jpg',
      ],
      features: ['bluetooth', 'backup_camera'],
    },
    pricing: {
      weekdayPrice: '700000',
      weekendPrice: null,
      hourlyPrice: null,
      monthlyPrice: null,
      withDriverDailyPrice: null,
      withDriverInterCityPrice: null,
      withDriverOneWayPrice: null,
      discountPercent: 10,
    },
    services: [
      {
        serviceType: 'self_drive',
        autoAcceptEnabled: false,
        termsText: 'Xuất trình giấy phép lái xe khi nhận xe',
      },
    ],
    policy: {
      source: 'vehicle',
      collateralMode: 'none',
      collateralAssetTypes: [],
      depositAmount: '0',
      deliveryEnabled: true,
      deliveryMaxRadiusKm: 30,
      deliveryTiers: [
        { toKm: 5, fee: '0' },
        { toKm: 30, fee: '150000' },
      ],
      includedDistanceKmPerDay: 300,
      excessDistanceFeePerKm: '3000',
      overtimeFeePerHour: null,
      discountEnabled: false,
      discountTiers: [],
    },
    pickup: {
      branchId: '01BRANCH00000000000000000',
      branchName: 'Chi nhánh Trung tâm',
      address: '25 Hùng Vương, Phường Phú Nhuận, Thành phố Huế',
      addressLine: '25 Hùng Vương',
      wardName: 'Phường Phú Nhuận',
      provinceCode: '46',
      provinceName: 'Thành phố Huế',
    },
    source: {
      storefrontKind: STOREFRONT_KIND.SHOP,
      tenantId: '01TENANT00000000000000000',
      name: 'Huế Rental',
    },
    owner: { id: '01OWNER000000000000000000', name: 'Chủ Huế Rental', phone: null, email: null },
    submitter: {
      id: '01STAFF000000000000000000',
      name: 'Nguyễn Văn Minh',
      phone: '0901234567',
      email: 'minh@hue-rental.vn',
    },
    manualChecks: VEHICLE_REVIEW_CHECK_VALUES.map((key) => ({
      key,
      passed: false,
      updatedAt: null,
      updatedByName: null,
    })),
    internalNote: { note: null, updatedAt: null, updatedByName: null },
    logs: [
      {
        action: 'submit',
        fromStatus: 'draft',
        toStatus: 'pending_public_review',
        note: null,
        actorName: 'Nguyễn Văn Minh',
        createdAt: '2026-06-08T02:00:00.000Z',
      },
    ],
    ...over,
  };
}

export function motorbikeReview(over: Partial<VehicleApprovalDetail> = {}): VehicleApprovalDetail {
  const base = carReview();
  return {
    ...base,
    approvalTaskId: '01TASKBIKE000000000000000',
    vehicle: {
      ...base.vehicle,
      id: '01VEHBIKE0000000000000000',
      code: 'XE-240518-003',
      name: 'Yamaha Exciter 155',
      vehicleType: 'motorbike',
      brand: 'yamaha',
      model: 'Exciter 155',
      seatCount: null,
      bodyType: null,
      motorbikeCategory: 'underbone',
      transmission: 'manual_clutch',
      fuelConsumptionCombined: null,
      engineDisplacementCc: 155,
    },
    pricing: { ...base.pricing, weekdayPrice: '180000', discountPercent: null },
    policy: null,
    source: {
      storefrontKind: STOREFRONT_KIND.PERSONAL,
      tenantId: '01TENANTP',
      name: 'Trần Văn Nam',
    },
    owner: { id: '01OWNERP', name: 'Trần Văn Nam', phone: '0912000111', email: null },
    submitter: { id: '01OWNERP', name: 'Trần Văn Nam', phone: '0912000111', email: null },
    ...over,
  };
}

export function electricCarReview(
  over: Partial<VehicleApprovalDetail> = {},
): VehicleApprovalDetail {
  const base = carReview();
  return {
    ...base,
    approvalTaskId: '01TASKEV00000000000000000',
    vehicle: {
      ...base.vehicle,
      name: 'VinFast VF5',
      brand: 'vinfast',
      model: 'VF5',
      fuelType: 'electric',
      transmission: null,
      fuelConsumptionCombined: null,
      electricRangeKm: 326,
      batteryCapacityKwh: '37.23',
    },
    ...over,
  };
}
