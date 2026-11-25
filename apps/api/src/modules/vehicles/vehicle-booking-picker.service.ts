import { BadRequestException, Injectable } from '@nestjs/common';
import type { Prisma } from '@xeprime/prisma';
import { API_ERROR_CODE } from '@xeprime/types';
import { resolveBranchScope } from '../../common/dto/branch-scope';
import { paginationMeta, resolvePaging } from '../../common/pagination';
import { PrismaService } from '../../prisma/prisma.service';
import { OccupancyService } from '../calendar/occupancy.service';
import {
  VEHICLE_PICKER_DEFAULT_LIMIT,
  VEHICLE_PICKER_MAX_LIMIT,
  type VehicleBookingPickerItemDto,
  type VehicleBookingPickerPageDto,
  type VehicleBookingPickerQueryDto,
} from './dto/vehicle-booking-picker.dto';
import { vehicleSearchOr } from './vehicles.service';

const PICKER_SELECT = {
  id: true,
  code: true,
  name: true,
  plateNumber: true,
  vehicleType: true,
  serviceTypes: true,
  operationStatus: true,
  mainImageUrl: true,
  seatCount: true,
  transmission: true,
  fuelType: true,
  discountPercent: true,
  weekdayPrice: true,
  deliveryEnabled: true,
  noCollateral: true,
  // Cùng nguồn với cờ "tự động duyệt" của snapshot chợ (`readListingCardExtras`).
  serviceSettings: { where: { autoAcceptEnabled: true }, select: { serviceType: true } },
  branch: { select: { ward: { select: { name: true } }, province: { select: { name: true } } } },
  publicListing: { select: { ratingAvg: true, ratingCount: true } },
} satisfies Prisma.VehicleSelect;

type PickerRow = Prisma.VehicleGetPayload<{ select: typeof PICKER_SELECT }>;

/** Tên trước, id sau — thứ tự ổn định để hai trang liền nhau không lặp/sót xe. */
const PICKER_ORDER: Prisma.VehicleOrderByWithRelationInput[] = [{ name: 'asc' }, { id: 'asc' }];

/**
 * Bộ chọn xe của hộp "Tạo đơn thuê xe cho khách" (`/bookings`).
 *
 * Trả MỌI xe của gian hàng trong phạm vi lọc, xe TRỐNG trong khung giờ lên trước, xe đã có lịch
 * xuống sau kèm `busy = true` (giao diện làm mờ, không cho chọn — chốt 25/11/2026). Hai nhóm là
 * hai truy vấn nối nhau theo trang, nên phân trang vẫn ở DB và thứ tự không nhảy giữa các trang.
 *
 * ADR 0006: `busy` chỉ để giao diện CHỌN ứng viên. Lượt tạo đơn vẫn đi qua `OccupancyService`
 * và constraint `EXCLUDE`, nên ai đặt xen vào giữa lúc xem và lúc tạo vẫn bị chặn ở đó.
 */
@Injectable()
export class VehicleBookingPickerService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly occupancy: OccupancyService,
  ) {}

  async list(
    tenantId: string,
    query: VehicleBookingPickerQueryDto,
    /** Chi nhánh người gọi được giao — `null` = toàn gian hàng (ADR 0052). */
    allowedBranchIds: readonly string[] | null,
  ): Promise<VehicleBookingPickerPageDto> {
    if (query.returnAt.getTime() <= query.pickupAt.getTime()) {
      throw new BadRequestException({
        code: API_ERROR_CODE.VALIDATION_FAILED,
        message: 'Giờ trả xe phải sau giờ nhận xe',
      });
    }
    const paging = resolvePaging(query, VEHICLE_PICKER_DEFAULT_LIMIT, VEHICLE_PICKER_MAX_LIMIT);

    const where: Prisma.VehicleWhereInput = {
      tenantId,
      deletedAt: null,
      ...(query.vehicleType ? { vehicleType: query.vehicleType } : {}),
      branchId: resolveBranchScope(query.branchId, allowedBranchIds),
      ...(query.q ? { OR: vehicleSearchOr(query.q) } : {}),
    };

    const busyIds = await this.occupancy.listBusyVehicleIds(
      tenantId,
      query.pickupAt,
      query.returnAt,
    );
    const busySet = new Set(busyIds);
    const freeWhere: Prisma.VehicleWhereInput =
      busyIds.length > 0 ? { AND: [where, { id: { notIn: busyIds } }] } : where;
    const busyWhere: Prisma.VehicleWhereInput = { AND: [where, { id: { in: busyIds } }] };

    const [freeCount, busyCount] = await Promise.all([
      this.prisma.vehicle.count({ where: freeWhere }),
      busyIds.length > 0 ? this.prisma.vehicle.count({ where: busyWhere }) : Promise.resolve(0),
    ]);

    // Trang này cắt qua chuỗi [xe trống…, xe bận…]: phần đầu lấy ở nhóm trống, phần còn lại ở
    // nhóm bận với `skip` đã trừ đi số xe trống.
    const freeTake = Math.max(0, Math.min(paging.take, freeCount - paging.skip));
    const busyTake = Math.min(paging.take - freeTake, busyCount);
    const busySkip = Math.max(0, paging.skip - freeCount);

    const [freeRows, busyRows] = await Promise.all([
      freeTake > 0
        ? this.prisma.vehicle.findMany({
            where: freeWhere,
            orderBy: PICKER_ORDER,
            skip: paging.skip,
            take: freeTake,
            select: PICKER_SELECT,
          })
        : Promise.resolve([] as PickerRow[]),
      busyTake > 0
        ? this.prisma.vehicle.findMany({
            where: busyWhere,
            orderBy: PICKER_ORDER,
            skip: busySkip,
            take: busyTake,
            select: PICKER_SELECT,
          })
        : Promise.resolve([] as PickerRow[]),
    ]);

    return {
      data: [...freeRows, ...busyRows].map((row) => toPickerItem(row, busySet.has(row.id))),
      meta: paginationMeta(paging, freeCount + busyCount),
    };
  }
}

function toPickerItem(v: PickerRow, busy: boolean): VehicleBookingPickerItemDto {
  const offered = new Set(v.serviceTypes);
  return {
    id: v.id,
    code: v.code,
    name: v.name,
    plateNumber: v.plateNumber,
    vehicleType: v.vehicleType,
    serviceTypes: v.serviceTypes,
    operationStatus: v.operationStatus,
    mainImageUrl: v.mainImageUrl,
    seatCount: v.seatCount,
    transmission: v.transmission,
    fuelType: v.fuelType,
    discountPercent: v.discountPercent,
    // Interceptor lo Decimal→string ở tầng response (ADR 0007).
    weekdayPrice: v.weekdayPrice as unknown as string | null,
    deliveryEnabled: v.deliveryEnabled,
    noCollateral: v.noCollateral,
    instantBookServiceTypes: v.serviceSettings
      .map((s) => s.serviceType)
      .filter((s) => offered.has(s))
      .sort(),
    ratingAvg: (v.publicListing?.ratingAvg ?? null) as unknown as string | null,
    ratingCount: v.publicListing?.ratingCount ?? 0,
    wardName: v.branch?.ward?.name ?? null,
    provinceName: v.branch?.province?.name ?? null,
    busy,
  };
}
