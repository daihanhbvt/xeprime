import { ForbiddenException } from '@nestjs/common';
import type { Prisma } from '@xeprime/prisma';
import {
  API_ERROR_CODE,
  SUPPORT_CAPABILITY,
  SUPPORT_VEHICLE_CONDITIONAL_FIELDS,
  SUPPORT_VEHICLE_CREATE_FIELDS,
  SUPPORT_VEHICLE_FIELDS,
  SUPPORT_VEHICLE_PINNED_FIELDS,
  VEHICLE_OPERATION_STATUS,
  type SupportCapability,
} from '@xeprime/types';
import { escalateSupportCapability } from '../../common/support/support-escalation';
import type { SupportActionDenial } from '../../common/decorators';
import type { RequestContext } from '../../common/types/request-context';
import { isTenantVehicleImageUrl } from '../storage/object-keys';
import type { UpdateVehicleDto } from './dto/vehicle.dto';

/**
 * Luật của lệnh sửa xe trong PHIÊN HỖ TRỢ — ADR 0050 điều 4.
 *
 * `PATCH /vehicles/:id` là một endpoint RỘNG: cùng một thân request sửa được thông tin, ảnh, giá,
 * dịch vụ, chi nhánh. Quyền tenant `vehicles.update` mà phiên được cấp cũng rộng như vậy — nên
 * cổng thật nằm ở đây, trên TÊN TRƯỜNG, ở backend:
 *
 *  1. `supportVehicleUpdateCapabilities` — chạy trong `TenantScopeGuard` trước khi chạm DB: trường
 *     nào thuộc capability nào, trường lạ/cấm thì từ chối cả lệnh (`SUPPORT_FIELD_NOT_ALLOWED`).
 *  2. `resolveSupportConditionalFields` — chạy trong transaction sau khi khoá xe: loại xe có mặt được
 *     chỉ khi GIỐNG HỆT bản đang lưu; chi nhánh / dịch vụ / trạng thái vận hành / giao xe (Đợt 2B)
 *     giống hệt thì là no-op, ĐỔI thật thì đòi đúng capability riêng + lý do riêng.
 *  3. `assertSupportMediaInScope` — ảnh MỚI phải nằm trong kho ảnh của chính gian hàng đó.
 */

const FIELD_CAPABILITY = new Map<string, SupportCapability>(
  Object.entries(SUPPORT_VEHICLE_FIELDS).flatMap(([capability, fields]) =>
    (fields ?? []).map((field) => [field, capability as SupportCapability] as const),
  ),
);
/** Có mặt được mà không tự đòi capability — loại xe (ghim cứng) và các trường có điều kiện. */
const PINNED = new Set([
  ...SUPPORT_VEHICLE_PINNED_FIELDS,
  ...Object.keys(SUPPORT_VEHICLE_CONDITIONAL_FIELDS),
]);

function fieldDenied(fields: string[]): SupportActionDenial {
  return {
    denied: true,
    code: API_ERROR_CODE.SUPPORT_FIELD_NOT_ALLOWED,
    message: 'Phiên hỗ trợ không được sửa các trường này',
    details: { fields },
  };
}

/** `@SupportAction` của `PATCH /vehicles/:id` — capability suy từ TÊN trường trong thân request. */
export function supportVehicleUpdateCapabilities(
  req: RequestContext,
): readonly SupportCapability[] | SupportActionDenial {
  const body: unknown = req.body;
  if (body === null || typeof body !== 'object' || Array.isArray(body)) return fieldDenied([]);

  const required = new Set<SupportCapability>();
  const rejected: string[] = [];
  for (const key of Object.keys(body)) {
    const capability = FIELD_CAPABILITY.get(key);
    if (capability) required.add(capability);
    else if (!PINNED.has(key)) rejected.push(key);
  }
  if (rejected.length > 0) return fieldDenied(rejected);
  // Thân rỗng / chỉ toàn trường ghim: vẫn là một lệnh sửa thông tin — đòi đúng quyền đó.
  if (required.size === 0) required.add(SUPPORT_CAPABILITY.VEHICLE_INFO_EDIT);
  return [...required];
}

export interface SupportVehicleCurrent {
  id: string;
  branchId: string | null;
  vehicleType: string;
  serviceTypes: string[];
  operationStatus: string;
  deliveryEnabled: boolean;
}

function sameSet(a: readonly string[], b: readonly string[]): boolean {
  const left = new Set(a);
  const right = new Set(b);
  return left.size === right.size && [...left].every((v) => right.has(v));
}

function fieldNotAllowed(fields: string[], message: string, extra?: Record<string, unknown>) {
  return new ForbiddenException({
    code: API_ERROR_CODE.SUPPORT_FIELD_NOT_ALLOWED,
    message,
    details: { fields, ...extra },
  });
}

/** Thay đổi THẬT của các trường có điều kiện — để service chạy phép kiểm riêng của từng loại. */
export interface SupportConditionalChanges {
  /** Chi nhánh đích khi xe thật sự đổi chi nhánh. */
  branchId: string | null;
  /** Dịch vụ bị BỎ (có trong bản đang lưu, không có trong lệnh). */
  removedServiceTypes: string[];
  /** Trạng thái vận hành đích khi lệnh ĐỔI nó — service kiểm chuyến đang sống. */
  operationStatus: string | null;
}

/**
 * Trong phiên hỗ trợ: so trường ghim + trường có điều kiện với bản đang lưu (sau khi khoá xe).
 *
 *  - Loại xe: đổi là từ chối cả lệnh (căn cước chiếc xe — không capability nào mở).
 *  - Chi nhánh / dịch vụ / trạng thái vận hành / giao xe: GIỐNG HỆT thì BỎ khỏi lệnh (no-op thật —
 *    giữ lại thì `serviceTypes` vẫn kéo theo `orphanPriceClears`); ĐỔI thật thì đòi capability
 *    riêng (`SUPPORT_VEHICLE_CONDITIONAL_FIELDS`) + lý do riêng qua `escalateSupportCapability`.
 *
 * Trả về những thay đổi thật để service chạy phép kiểm cần DB (chuyến mở, chi nhánh đích, giá).
 */
export function resolveSupportConditionalFields(
  current: SupportVehicleCurrent,
  dto: UpdateVehicleDto,
): SupportConditionalChanges {
  const record = dto as Record<string, unknown>;
  if (dto.vehicleType !== undefined && dto.vehicleType !== current.vehicleType) {
    throw fieldNotAllowed(['vehicleType'], 'Phiên hỗ trợ không được đổi loại xe');
  }
  delete record.vehicleType;

  const changes: SupportConditionalChanges = {
    branchId: null,
    removedServiceTypes: [],
    operationStatus: null,
  };

  if (dto.branchId !== undefined) {
    if (dto.branchId === current.branchId) delete record.branchId;
    else {
      escalateSupportCapability(SUPPORT_CAPABILITY.VEHICLE_BRANCH_REASSIGN);
      changes.branchId = dto.branchId;
    }
  }
  if (dto.serviceTypes !== undefined) {
    if (sameSet(dto.serviceTypes, current.serviceTypes)) delete record.serviceTypes;
    else {
      escalateSupportCapability(SUPPORT_CAPABILITY.VEHICLE_OPERATIONS_UPDATE);
      const next = new Set(dto.serviceTypes);
      changes.removedServiceTypes = current.serviceTypes.filter((type) => !next.has(type));
    }
  }
  if (dto.operationStatus !== undefined) {
    if (dto.operationStatus === current.operationStatus) delete record.operationStatus;
    else {
      // "Đang cho thuê" chỉ do luồng bàn giao đặt — phiên không tự tuyên bố xe đang ở ngoài đường.
      if (dto.operationStatus === VEHICLE_OPERATION_STATUS.RENTING) {
        throw fieldNotAllowed(
          ['operationStatus'],
          'Phiên hỗ trợ không đặt trạng thái đang cho thuê',
        );
      }
      escalateSupportCapability(SUPPORT_CAPABILITY.VEHICLE_OPERATIONS_UPDATE);
      changes.operationStatus = dto.operationStatus;
    }
  }
  if (dto.deliveryEnabled !== undefined) {
    if (dto.deliveryEnabled === current.deliveryEnabled) delete record.deliveryEnabled;
    else escalateSupportCapability(SUPPORT_CAPABILITY.VEHICLE_OPERATIONS_UPDATE);
  }
  return changes;
}

/**
 * Tạo xe NHÁP trong phiên (`POST /vehicles`) — chỉ trường của `SUPPORT_VEHICLE_CREATE_FIELDS`.
 * Trường giá/giảm giá/nguồn xe/trạng thái vận hành có mặt với giá trị rỗng (`null`/`''`) thì
 * được bỏ qua (form gửi cả khối); có giá trị là từ chối cả lệnh.
 */
const CREATE_FIELDS = new Set(SUPPORT_VEHICLE_CREATE_FIELDS);

export function supportVehicleCreateCapabilities(
  req: RequestContext,
): readonly SupportCapability[] | SupportActionDenial {
  const body: unknown = req.body;
  if (body === null || typeof body !== 'object' || Array.isArray(body)) return fieldDenied([]);
  const rejected = Object.entries(body as Record<string, unknown>)
    .filter(
      ([key, value]) =>
        !CREATE_FIELDS.has(key) && value !== null && value !== undefined && value !== '',
    )
    .map(([key]) => key);
  if (rejected.length > 0) return fieldDenied(rejected);
  return [SUPPORT_CAPABILITY.VEHICLE_CREATE_DRAFT];
}

/** Bỏ khỏi lệnh tạo mọi trường ngoài danh sách (chúng chỉ còn là giá trị rỗng — xem trên). */
export function stripSupportCreateFields(dto: object): void {
  const record = dto as Record<string, unknown>;
  for (const key of Object.keys(record)) if (!CREATE_FIELDS.has(key)) delete record[key];
}

/**
 * Ảnh MỚI (chưa gắn với xe này) phải nằm trong kho ảnh của chính gian hàng. Ảnh xe đang có thì
 * giữ/sắp lại/gỡ tự do — kể cả ảnh dữ liệu cũ ở nơi khác.
 *
 * Chặn hai điều: phiên hỗ trợ gắn vào xe của gian hàng A một ảnh đã tải lên cho gian hàng B, và
 * gắn một URL tuỳ ý ngoài hệ thống.
 */
export async function assertSupportMediaInScope(
  tx: Prisma.TransactionClient,
  /** `publicBase` = `R2_PUBLIC_BASE_URL`; vắng mặt thì không ảnh MỚI nào hợp lệ (đóng, không mở). */
  input: {
    vehicleId: string;
    tenantId: string;
    publicBase: string | undefined;
    dto: UpdateVehicleDto;
  },
): Promise<void> {
  const { dto } = input;
  const incoming = [
    ...(dto.media?.map((m) => m.url.trim()) ?? []),
    ...(dto.images?.map((url) => url.trim()) ?? []),
    ...(dto.mainImageUrl ? [dto.mainImageUrl.trim()] : []),
  ].filter(Boolean);
  if (incoming.length === 0) return;

  const [images, vehicle] = await Promise.all([
    tx.vehicleImage.findMany({ where: { vehicleId: input.vehicleId }, select: { imageUrl: true } }),
    tx.vehicle.findUnique({ where: { id: input.vehicleId }, select: { mainImageUrl: true } }),
  ]);
  const known = new Set(images.map((i) => i.imageUrl));
  if (vehicle?.mainImageUrl) known.add(vehicle.mainImageUrl);

  const outOfScope = [
    ...new Set(
      incoming.filter(
        (url) => !known.has(url) && !isTenantVehicleImageUrl(url, input.publicBase, input.tenantId),
      ),
    ),
  ];
  if (outOfScope.length > 0) {
    throw new ForbiddenException({
      code: API_ERROR_CODE.SUPPORT_MEDIA_OUT_OF_SCOPE,
      message: 'Ảnh không thuộc kho ảnh của gian hàng này',
      details: { count: outOfScope.length },
    });
  }
}

/** Cột vô hướng của `vehicles` mà lệnh sửa trong phiên có thể chạm — để chụp before/after. */
const SCALAR_AUDIT_FIELDS = new Set([
  ...(SUPPORT_VEHICLE_FIELDS[SUPPORT_CAPABILITY.VEHICLE_INFO_EDIT] ?? []).filter(
    (f) => f !== 'features',
  ),
  'mainImageUrl',
  // Trường có điều kiện (`SUPPORT_VEHICLE_CONDITIONAL_FIELDS`) còn trong lệnh = đã ĐỔI thật (giữ
  // nguyên thì `resolveSupportConditionalFields` đã bỏ) — audit phải có before/after của chúng.
  // `branchId` có dòng audit riêng `vehicle.branch.reassign`.
  ...Object.keys(SUPPORT_VEHICLE_CONDITIONAL_FIELDS).filter((f) => f !== 'branchId'),
]);

/**
 * Ảnh chụp đúng những trường lệnh sửa chạm tới — before/after của dòng audit trong phiên hỗ trợ.
 * Chỉ trường có trong lệnh: audit là bằng chứng "đã đổi gì", không phải bản sao cả chiếc xe.
 */
export async function supportVehicleAuditSnapshot(
  tx: Prisma.TransactionClient,
  vehicleId: string,
  dto: UpdateVehicleDto,
): Promise<Record<string, unknown>> {
  const keys = Object.keys(dto).filter((k) => (dto as Record<string, unknown>)[k] !== undefined);
  const scalar = keys.filter((k) => SCALAR_AUDIT_FIELDS.has(k));
  const out: Record<string, unknown> = {};

  if (scalar.length > 0) {
    const select = Object.fromEntries(scalar.map((k) => [k, true])) as Prisma.VehicleSelect;
    const row = await tx.vehicle.findUnique({ where: { id: vehicleId }, select });
    for (const key of scalar) {
      const value = (row as Record<string, unknown> | null)?.[key];
      // Decimal (mức tiêu thụ) ra chuỗi — JSON của audit không mang được Decimal.
      out[key] = value !== null && typeof value === 'object' ? String(value) : (value ?? null);
    }
  }
  if (keys.includes('media') || keys.includes('images')) {
    const images = await tx.vehicleImage.findMany({
      where: { vehicleId },
      orderBy: { sortOrder: 'asc' },
      select: { imageUrl: true, imageType: true },
    });
    out.media = images.map((i) => ({ url: i.imageUrl, type: i.imageType }));
  }
  if (keys.includes('features')) {
    const features = await tx.vehicleFeature.findMany({
      where: { vehicleId },
      orderBy: { featureKey: 'asc' },
      select: { featureKey: true },
    });
    out.features = features.map((f) => f.featureKey);
  }
  return out;
}
