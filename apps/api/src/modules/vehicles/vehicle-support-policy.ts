import { ForbiddenException } from '@nestjs/common';
import type { Prisma } from '@xeprime/prisma';
import {
  API_ERROR_CODE,
  SUPPORT_CAPABILITY,
  SUPPORT_VEHICLE_FIELDS,
  SUPPORT_VEHICLE_PINNED_FIELDS,
  type SupportCapability,
} from '@xeprime/types';
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
 *  2. `assertSupportPinnedFields` — chạy trong transaction sau khi khoá xe: trường "ghim" (chi
 *     nhánh, loại xe, dịch vụ, trạng thái vận hành) có mặt được chỉ khi GIỐNG HỆT bản đang lưu.
 *  3. `assertSupportMediaInScope` — ảnh MỚI phải nằm trong kho ảnh của chính gian hàng đó.
 */

const FIELD_CAPABILITY = new Map<string, SupportCapability>(
  Object.entries(SUPPORT_VEHICLE_FIELDS).flatMap(([capability, fields]) =>
    (fields ?? []).map((field) => [field, capability as SupportCapability] as const),
  ),
);
const PINNED = new Set(SUPPORT_VEHICLE_PINNED_FIELDS);

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

export interface PinnedFieldsCurrent {
  branchId: string | null;
  vehicleType: string;
  serviceTypes: string[];
  operationStatus: string;
}

function sameSet(a: readonly string[], b: readonly string[]): boolean {
  const left = new Set(a);
  const right = new Set(b);
  return left.size === right.size && [...left].every((v) => right.has(v));
}

/** Trường ghim có mặt thì phải bằng bản đang lưu — server so, không tin form đã khoá ô. */
export function assertSupportPinnedFields(current: PinnedFieldsCurrent, dto: UpdateVehicleDto): void {
  const changed: string[] = [];
  if (dto.branchId !== undefined && dto.branchId !== current.branchId) changed.push('branchId');
  if (dto.vehicleType !== undefined && dto.vehicleType !== current.vehicleType) {
    changed.push('vehicleType');
  }
  if (dto.serviceTypes !== undefined && !sameSet(dto.serviceTypes, current.serviceTypes)) {
    changed.push('serviceTypes');
  }
  if (dto.operationStatus !== undefined && dto.operationStatus !== current.operationStatus) {
    changed.push('operationStatus');
  }
  if (changed.length > 0) {
    throw new ForbiddenException({
      code: API_ERROR_CODE.SUPPORT_FIELD_NOT_ALLOWED,
      message: 'Phiên hỗ trợ không được đổi chi nhánh, loại xe, dịch vụ hay trạng thái vận hành',
      details: { fields: changed },
    });
  }
}

/**
 * Phiên hỗ trợ: trường ghim đã được xác nhận BẰNG bản đang lưu — bỏ khỏi lệnh để chúng là no-op
 * thật. Giữ lại thì `serviceTypes` vẫn kéo theo `orphanPriceClears` (xoá giá của dịch vụ không còn
 * trong mảng), tức một lần ghi GIÁ mà phiên không được làm và snapshot audit không ghi lại.
 */
export function stripSupportPinnedFields(dto: UpdateVehicleDto): void {
  const record = dto as Record<string, unknown>;
  for (const field of SUPPORT_VEHICLE_PINNED_FIELDS) delete record[field];
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
  input: { vehicleId: string; tenantId: string; publicBase: string | undefined; dto: UpdateVehicleDto },
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
