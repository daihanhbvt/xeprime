import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { newId, Prisma } from '@xeprime/prisma';
import {
  APPROVAL_ACTION,
  APPROVAL_STATUS,
  APPROVAL_TARGET_TYPE,
  API_ERROR_CODE,
  TENANT_STATUS,
  VEHICLE_PUBLIC_SENSITIVE_FIELDS,
  VEHICLE_PUBLIC_STATUS,
  VEHICLE_PUBLIC_STATUS_SUBMITTABLE,
  type PaginationMeta,
  type VehiclePublicStatus,
} from '@xeprime/types';
import { AuditService } from '../audit/audit.service';
import { BillingService } from '../billing/billing.service';
import { ListingsService } from '../public-listings/listings.service';
import { PrismaService } from '../../prisma/prisma.service';
import {
  CreateVehicleDto,
  UpdateVehicleDto,
  VEHICLE_DEFAULT_LIMIT,
  VEHICLE_MAX_LIMIT,
  VehicleDetailDto,
  VehicleListItemDto,
  VehicleListQueryDto,
  VehiclePublicReviewDto,
} from './dto/vehicle.dto';

/** Cột dùng cho một dòng bảng — không kéo `description` dài. */
const LIST_SELECT = {
  id: true,
  code: true,
  name: true,
  plateNumber: true,
  vehicleType: true,
  serviceType: true,
  brand: true,
  model: true,
  manufactureYear: true,
  seatCount: true,
  bodyType: true,
  discountPercent: true,
  operationStatus: true,
  publicStatus: true,
  mainImageUrl: true,
  weekdayPrice: true,
  weekendPrice: true,
  updatedAt: true,
} satisfies Prisma.VehicleSelect;

const DETAIL_SELECT = {
  ...LIST_SELECT,
  color: true,
  fuelType: true,
  hourlyPrice: true,
  deliveryEnabled: true,
  noCollateral: true,
  description: true,
  createdAt: true,
} satisfies Prisma.VehicleSelect;

/** Đủ để kiểm tra đổi mã + phát hiện thay đổi trường nhạy cảm khi update (ADR 0008). */
const SENSITIVE_SELECT = {
  id: true,
  code: true,
  publicStatus: true,
  weekdayPrice: true,
  weekendPrice: true,
  hourlyPrice: true,
  discountPercent: true,
  plateNumber: true,
  vehicleType: true,
  serviceType: true,
  mainImageUrl: true,
} satisfies Prisma.VehicleSelect;

@Injectable()
export class VehiclesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly listings: ListingsService,
    private readonly billing: BillingService,
  ) {}

  async list(
    tenantId: string,
    query: VehicleListQueryDto,
  ): Promise<{ data: VehicleListItemDto[]; meta: PaginationMeta }> {
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(VEHICLE_MAX_LIMIT, Math.max(1, query.limit ?? VEHICLE_DEFAULT_LIMIT));

    const where: Prisma.VehicleWhereInput = {
      tenantId,
      deletedAt: null,
      ...(query.vehicleType ? { vehicleType: query.vehicleType } : {}),
      ...(query.serviceType ? { serviceType: query.serviceType } : {}),
      ...(query.operationStatus ? { operationStatus: query.operationStatus } : {}),
      ...(query.publicStatus ? { publicStatus: query.publicStatus } : {}),
      ...(query.q ? { OR: searchOr(query.q) } : {}),
    };

    // Đếm và lấy trang trong một transaction: total khớp data cùng thời điểm.
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.vehicle.count({ where }),
      this.prisma.vehicle.findMany({
        where,
        orderBy: orderByOf(query.sort),
        skip: (page - 1) * limit,
        take: limit,
        select: LIST_SELECT,
      }),
    ]);

    return {
      data: rows.map(toListItem),
      meta: { page, limit, total, hasNext: page * limit < total },
    };
  }

  async getOne(tenantId: string, id: string): Promise<VehicleDetailDto> {
    const row = await this.prisma.vehicle.findFirst({
      where: { id, tenantId, deletedAt: null },
      select: DETAIL_SELECT,
    });
    if (!row) throw notFound();

    // Kèm lần gửi duyệt gần nhất + gallery ảnh + tiện ích.
    const [latest, images, features] = await Promise.all([
      this.prisma.approvalTask.findFirst({
        where: { targetType: APPROVAL_TARGET_TYPE.VEHICLE, targetId: id },
        orderBy: { submittedAt: 'desc' },
        select: { status: true, reason: true, submittedAt: true, reviewedAt: true },
      }),
      this.prisma.vehicleImage.findMany({
        where: { vehicleId: id },
        orderBy: { sortOrder: 'asc' },
        select: { imageUrl: true },
      }),
      this.prisma.vehicleFeature.findMany({
        where: { vehicleId: id },
        select: { featureKey: true },
      }),
    ]);
    const review: VehiclePublicReviewDto | null = latest
      ? {
          status: latest.status,
          reason: latest.reason,
          submittedAt: latest.submittedAt.toISOString(),
          reviewedAt: latest.reviewedAt?.toISOString() ?? null,
        }
      : null;

    return toDetail(
      row,
      review,
      images.map((i) => i.imageUrl),
      features.map((f) => f.featureKey),
    );
  }

  async create(
    tenantId: string,
    userId: string,
    dto: CreateVehicleDto,
  ): Promise<VehicleDetailDto> {
    // Quota gói (ADR 0010): chạm max_vehicles của gói hiện hành → PLAN_LIMIT_REACHED.
    await this.billing.assertVehicleQuota(tenantId);
    await this.assertCodeFree(tenantId, dto.code);

    const id = newId();
    await this.prisma.$transaction(async (tx) => {
      await tx.vehicle.create({
        data: {
          id,
          tenantId,
          createdBy: userId,
          code: dto.code,
          name: dto.name,
          vehicleType: dto.vehicleType,
          ...writableFields(dto),
        },
      });
      await this.replaceMedia(tx, id, tenantId, dto);
    });
    return this.getOne(tenantId, id);
  }

  async update(
    tenantId: string,
    id: string,
    userId: string,
    dto: UpdateVehicleDto,
  ): Promise<VehicleDetailDto> {
    const current = await this.prisma.vehicle.findFirst({
      where: { id, tenantId, deletedAt: null },
      select: SENSITIVE_SELECT,
    });
    if (!current) throw notFound();

    // Đổi mã thì mã mới phải còn trống trong gian hàng (unique DB là chốt chặn cuối).
    if (dto.code !== undefined && dto.code !== current.code) {
      await this.assertCodeFree(tenantId, dto.code);
    }

    // ADR 0008: xe đang công khai mà sửa trường nhạy cảm (giá/biển số/loại/ảnh…) phải hạ về
    // chờ duyệt lại, không để thông tin đã đổi hiển thị ngoài chợ khi chưa qua kiểm duyệt.
    const knockBack =
      current.publicStatus === VEHICLE_PUBLIC_STATUS.APPROVED_PUBLIC &&
      hasSensitiveChange(current, dto);

    const data: Prisma.VehicleUpdateInput = {
      ...(dto.code !== undefined ? { code: dto.code } : {}),
      ...(dto.name !== undefined ? { name: dto.name } : {}),
      ...(dto.vehicleType !== undefined ? { vehicleType: dto.vehicleType } : {}),
      ...writableFields(dto),
      ...(knockBack ? { publicStatus: VEHICLE_PUBLIC_STATUS.PENDING_PUBLIC_REVIEW } : {}),
    };

    if (!knockBack) {
      // Sửa xe (kể cả sửa tại chỗ xe đang công khai) → đồng bộ snapshot public_listings (ADR 0008).
      await this.prisma.$transaction(async (tx) => {
        await tx.vehicle.update({ where: { id: current.id }, data });
        await this.replaceMedia(tx, current.id, tenantId, dto);
        await this.listings.syncFromVehicle(current.id, tx);
      });
      return this.getOne(tenantId, current.id);
    }

    await this.prisma.$transaction(async (tx) => {
      const updated = await tx.vehicle.update({
        where: { id: current.id },
        data,
        select: DETAIL_SELECT,
      });
      await this.replaceMedia(tx, current.id, tenantId, dto);
      await this.createVehicleApprovalTask(tx, {
        vehicleId: current.id,
        tenantId,
        actorUserId: userId,
        fromStatus: VEHICLE_PUBLIC_STATUS.APPROVED_PUBLIC,
        snapshot: updated,
        action: 'resubmit',
      });
      // Trường nhạy cảm đổi → xe về pending → listing ẩn (ADR 0008 §2).
      await this.listings.syncFromVehicle(current.id, tx);
    });
    return this.getOne(tenantId, current.id);
  }

  /**
   * Thay TOÀN BỘ ảnh gallery + tiện ích khi client gửi (undefined = không đụng). Chạy trong tx
   * của caller. Ảnh giữ thứ tự qua `sortOrder`; feature khử trùng trước khi ghi (unique DB chốt cuối).
   */
  private async replaceMedia(
    tx: Prisma.TransactionClient,
    vehicleId: string,
    tenantId: string,
    dto: CreateVehicleDto | UpdateVehicleDto,
  ): Promise<void> {
    if (dto.images !== undefined) {
      await tx.vehicleImage.deleteMany({ where: { vehicleId } });
      if (dto.images.length > 0) {
        await tx.vehicleImage.createMany({
          data: dto.images.map((imageUrl, index) => ({
            id: newId(),
            vehicleId,
            tenantId,
            imageUrl,
            sortOrder: index,
          })),
        });
      }
    }
    if (dto.features !== undefined) {
      await tx.vehicleFeature.deleteMany({ where: { vehicleId } });
      const unique = [...new Set(dto.features)];
      if (unique.length > 0) {
        await tx.vehicleFeature.createMany({
          data: unique.map((featureKey) => ({ id: newId(), vehicleId, featureKey })),
        });
      }
    }
  }

  /**
   * Gửi (lại) xe đi duyệt công khai. Chỉ cho phép khi xe đang draft/needs_revision/rejected/hidden
   * và gian hàng đang active; bắt buộc đủ giá + ảnh + biển số + mô tả. Tạo phiếu duyệt + log +
   * audit trong một transaction — client KHÔNG tự set `approved_public` (CLAUDE.md mục 5).
   */
  async submitForPublicReview(
    tenantId: string,
    id: string,
    userId: string,
  ): Promise<VehicleDetailDto> {
    const vehicle = await this.prisma.vehicle.findFirst({
      where: { id, tenantId, deletedAt: null },
      select: DETAIL_SELECT,
    });
    if (!vehicle) throw notFound();

    const status = vehicle.publicStatus as VehiclePublicStatus;
    if (!VEHICLE_PUBLIC_STATUS_SUBMITTABLE.includes(status)) {
      throw new ConflictException({
        code: API_ERROR_CODE.INVALID_STATUS_TRANSITION,
        message:
          status === VEHICLE_PUBLIC_STATUS.PENDING_PUBLIC_REVIEW
            ? 'Xe đang chờ duyệt công khai.'
            : 'Xe đã ở trạng thái công khai.',
      });
    }

    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { status: true },
    });
    if (tenant?.status !== TENANT_STATUS.ACTIVE) {
      throw new BadRequestException({
        code: API_ERROR_CODE.VALIDATION_FAILED,
        message: 'Gian hàng phải được duyệt hoạt động trước khi đăng xe lên chợ.',
      });
    }

    const missing = missingPublicFields(vehicle);
    if (missing.length > 0) {
      throw new BadRequestException({
        code: API_ERROR_CODE.VALIDATION_FAILED,
        message: `Cần bổ sung trước khi gửi duyệt: ${missing.join(', ')}.`,
        details: { missing },
      });
    }

    const isResubmit = status !== VEHICLE_PUBLIC_STATUS.DRAFT;

    await this.prisma.$transaction(async (tx) => {
      await tx.vehicle.update({
        where: { id },
        data: { publicStatus: VEHICLE_PUBLIC_STATUS.PENDING_PUBLIC_REVIEW },
      });
      await this.createVehicleApprovalTask(tx, {
        vehicleId: id,
        tenantId,
        actorUserId: userId,
        fromStatus: status,
        snapshot: vehicle,
        action: isResubmit ? 'resubmit' : 'submit',
      });
      // Gửi lại duyệt: nếu xe từng công khai thì listing về ẩn cho tới khi duyệt lại (ADR 0008).
      await this.listings.syncFromVehicle(id, tx);
    });

    return this.getOne(tenantId, id);
  }

  /**
   * Tạo phiếu duyệt xe + approval_log + audit (dùng chung cho submit thủ công và knock-back
   * khi sửa trường nhạy cảm). Luôn chạy trong transaction của caller.
   */
  private async createVehicleApprovalTask(
    tx: Prisma.TransactionClient,
    args: {
      vehicleId: string;
      tenantId: string;
      actorUserId: string;
      fromStatus: VehiclePublicStatus;
      snapshot: VehicleRow;
      action: 'submit' | 'resubmit';
    },
  ): Promise<void> {
    const task = await tx.approvalTask.create({
      data: {
        id: newId(),
        tenantId: args.tenantId,
        targetType: APPROVAL_TARGET_TYPE.VEHICLE,
        targetId: args.vehicleId,
        status: APPROVAL_STATUS.PENDING,
        submittedBy: args.actorUserId,
        snapshot: vehicleSnapshot(args.snapshot) as Prisma.InputJsonValue,
      },
    });
    await tx.approvalLog.create({
      data: {
        id: newId(),
        approvalTaskId: task.id,
        action: args.action === 'resubmit' ? APPROVAL_ACTION.RESUBMIT : APPROVAL_ACTION.SUBMIT,
        fromStatus: args.fromStatus,
        toStatus: VEHICLE_PUBLIC_STATUS.PENDING_PUBLIC_REVIEW,
        actorUserId: args.actorUserId,
      },
    });
    await this.audit.record(
      {
        tenantId: args.tenantId,
        actorUserId: args.actorUserId,
        actorScope: 'tenant',
        action: 'vehicle.submit_public',
        targetType: APPROVAL_TARGET_TYPE.VEHICLE,
        targetId: args.vehicleId,
        before: { publicStatus: args.fromStatus },
        after: { publicStatus: VEHICLE_PUBLIC_STATUS.PENDING_PUBLIC_REVIEW },
      },
      tx,
    );
  }

  /**
   * Xoá mềm. Chặn nếu xe còn lịch hiện tại/tương lai — occupancies là nguồn sự thật của
   * "xe bận" (ADR 0006); xoá xe đang có đơn sẽ để lại lịch mồ côi.
   */
  async remove(tenantId: string, id: string): Promise<{ id: string }> {
    const current = await this.prisma.vehicle.findFirst({
      where: { id, tenantId, deletedAt: null },
      select: { id: true },
    });
    if (!current) throw notFound();

    const activeSchedule = await this.prisma.vehicleOccupancy.count({
      where: { vehicleId: id, tenantId, endAt: { gt: new Date() } },
    });
    if (activeSchedule > 0) {
      throw new ConflictException({
        code: API_ERROR_CODE.CONFLICT,
        message: 'Xe đang có lịch hiện tại hoặc sắp tới, không thể xoá. Hãy huỷ/kết thúc lịch trước.',
      });
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.vehicle.update({ where: { id: current.id }, data: { deletedAt: new Date() } });
      // Xoá mềm xe → listing archived, biến khỏi marketplace (ADR 0008 §2).
      await this.listings.syncFromVehicle(current.id, tx);
    });
    return { id: current.id };
  }

  private async assertCodeFree(tenantId: string, code: string): Promise<void> {
    const clash = await this.prisma.vehicle.findFirst({
      where: { tenantId, code, deletedAt: null },
      select: { id: true },
    });
    if (clash) {
      throw new ConflictException({
        code: API_ERROR_CODE.CONFLICT,
        message: `Mã xe "${code}" đã tồn tại trong gian hàng`,
      });
    }
  }
}

function searchOr(q: string): Prisma.VehicleWhereInput[] {
  const contains = { contains: q, mode: 'insensitive' } as const;
  return [
    { name: contains },
    { code: contains },
    { plateNumber: contains },
    { brand: contains },
    { model: contains },
  ];
}

function orderByOf(sort: VehicleListQueryDto['sort']): Prisma.VehicleOrderByWithRelationInput {
  switch (sort) {
    case 'name_asc':
      return { name: 'asc' };
    case 'code_asc':
      return { code: 'asc' };
    case 'price_asc':
      return { weekdayPrice: 'asc' };
    case 'price_desc':
      return { weekdayPrice: 'desc' };
    default:
      return { createdAt: 'desc' };
  }
}

/** Các trường scalar tuỳ chọn — kiểu thuần nên assign được cho cả `create` lẫn `update`. */
interface VehicleWritableFields {
  serviceType?: string;
  plateNumber?: string;
  brand?: string;
  model?: string;
  manufactureYear?: number;
  color?: string;
  seatCount?: number;
  fuelType?: string;
  bodyType?: string | null;
  operationStatus?: string;
  description?: string;
  mainImageUrl?: string;
  weekdayPrice?: string;
  weekendPrice?: string;
  hourlyPrice?: string | null;
  deliveryEnabled?: boolean;
  noCollateral?: boolean;
  discountPercent?: number | null;
}

/**
 * Các trường tuỳ chọn cho phép ghi khi create/update — gom một chỗ để hai đường không lệch nhau.
 * KHÔNG gồm `code`/`name`/`vehicleType` (create bắt buộc) và tuyệt đối không `publicStatus`/`tenantId`.
 * Các trường nullable (bodyType/hourlyPrice/discountPercent) nhận null để XOÁ giá trị.
 */
function writableFields(dto: CreateVehicleDto | UpdateVehicleDto): VehicleWritableFields {
  return {
    ...(dto.serviceType !== undefined ? { serviceType: dto.serviceType } : {}),
    ...(dto.plateNumber !== undefined ? { plateNumber: dto.plateNumber } : {}),
    ...(dto.brand !== undefined ? { brand: dto.brand } : {}),
    ...(dto.model !== undefined ? { model: dto.model } : {}),
    ...(dto.manufactureYear !== undefined ? { manufactureYear: dto.manufactureYear } : {}),
    ...(dto.color !== undefined ? { color: dto.color } : {}),
    ...(dto.seatCount !== undefined ? { seatCount: dto.seatCount } : {}),
    ...(dto.fuelType !== undefined ? { fuelType: dto.fuelType } : {}),
    ...(dto.bodyType !== undefined ? { bodyType: dto.bodyType } : {}),
    ...(dto.operationStatus !== undefined ? { operationStatus: dto.operationStatus } : {}),
    ...(dto.description !== undefined ? { description: dto.description } : {}),
    ...(dto.mainImageUrl !== undefined ? { mainImageUrl: dto.mainImageUrl } : {}),
    ...(dto.weekdayPrice !== undefined ? { weekdayPrice: dto.weekdayPrice } : {}),
    ...(dto.weekendPrice !== undefined ? { weekendPrice: dto.weekendPrice } : {}),
    ...(dto.hourlyPrice !== undefined ? { hourlyPrice: dto.hourlyPrice } : {}),
    ...(dto.deliveryEnabled !== undefined ? { deliveryEnabled: dto.deliveryEnabled } : {}),
    ...(dto.noCollateral !== undefined ? { noCollateral: dto.noCollateral } : {}),
    ...(dto.discountPercent !== undefined ? { discountPercent: dto.discountPercent } : {}),
  };
}

/** Decimal → string do ResponseInterceptor lo (ADR 0007); ở đây giữ nguyên kiểu. */
type VehicleRow = Prisma.VehicleGetPayload<{ select: typeof DETAIL_SELECT }>;

function toListItem(v: Prisma.VehicleGetPayload<{ select: typeof LIST_SELECT }>): VehicleListItemDto {
  return {
    id: v.id,
    code: v.code,
    name: v.name,
    plateNumber: v.plateNumber,
    vehicleType: v.vehicleType,
    serviceType: v.serviceType,
    brand: v.brand,
    model: v.model,
    manufactureYear: v.manufactureYear,
    seatCount: v.seatCount,
    bodyType: v.bodyType,
    discountPercent: v.discountPercent,
    operationStatus: v.operationStatus,
    publicStatus: v.publicStatus,
    mainImageUrl: v.mainImageUrl,
    weekdayPrice: v.weekdayPrice as unknown as string | null,
    weekendPrice: v.weekendPrice as unknown as string | null,
    updatedAt: v.updatedAt as unknown as string,
  };
}

function toDetail(
  v: VehicleRow,
  latestPublicReview: VehiclePublicReviewDto | null = null,
  images: string[] = [],
  features: string[] = [],
): VehicleDetailDto {
  return {
    ...toListItem(v),
    color: v.color,
    fuelType: v.fuelType,
    hourlyPrice: v.hourlyPrice as unknown as string | null,
    deliveryEnabled: v.deliveryEnabled,
    noCollateral: v.noCollateral,
    description: v.description,
    createdAt: v.createdAt as unknown as string,
    images,
    features,
    latestPublicReview,
  };
}

type SensitiveRow = Prisma.VehicleGetPayload<{ select: typeof SENSITIVE_SELECT }>;

/** Có trường nhạy cảm nào được sửa sang giá trị khác hiện tại không (ADR 0008). */
function hasSensitiveChange(current: SensitiveRow, dto: UpdateVehicleDto): boolean {
  return VEHICLE_PUBLIC_SENSITIVE_FIELDS.some((field) => {
    const next = dto[field];
    if (next === undefined) return false; // không đụng tới trường này
    const curVal = current[field];
    const curStr = curVal == null ? null : String(curVal);
    const nextStr = next == null ? null : String(next);
    return curStr !== nextStr;
  });
}

/** Điều kiện tối thiểu để xe được lên chợ; trả danh sách còn thiếu (rỗng = đủ). */
function missingPublicFields(v: VehicleRow): string[] {
  const missing: string[] = [];
  if (v.weekdayPrice == null) missing.push('giá thuê');
  if (!v.mainImageUrl) missing.push('ảnh đại diện');
  if (!v.plateNumber) missing.push('biển số');
  if (!v.description) missing.push('mô tả xe');
  return missing;
}

/** Ảnh chụp hồ sơ xe lúc gửi duyệt — reviewer thấy đúng thứ đã gửi (Decimal → string). */
function vehicleSnapshot(v: VehicleRow): Record<string, unknown> {
  return {
    name: v.name,
    code: v.code,
    plateNumber: v.plateNumber,
    vehicleType: v.vehicleType,
    serviceType: v.serviceType,
    brand: v.brand,
    model: v.model,
    manufactureYear: v.manufactureYear,
    seatCount: v.seatCount,
    fuelType: v.fuelType,
    bodyType: v.bodyType,
    color: v.color,
    mainImageUrl: v.mainImageUrl,
    description: v.description,
    weekdayPrice: v.weekdayPrice == null ? null : String(v.weekdayPrice),
    weekendPrice: v.weekendPrice == null ? null : String(v.weekendPrice),
    hourlyPrice: v.hourlyPrice == null ? null : String(v.hourlyPrice),
    deliveryEnabled: v.deliveryEnabled,
    noCollateral: v.noCollateral,
    discountPercent: v.discountPercent,
  };
}

function notFound(): NotFoundException {
  return new NotFoundException({
    code: API_ERROR_CODE.NOT_FOUND,
    message: 'Không tìm thấy xe',
  });
}
