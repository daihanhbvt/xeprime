import { Injectable } from '@nestjs/common';
import { newId, Prisma } from '@xeprime/prisma';
import {
  LISTING_STATUS,
  REVIEW_STATUS,
  VEHICLE_PUBLIC_STATUS,
  type ListingStatus,
} from '@xeprime/types';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * Nguồn ghi DUY NHẤT của `public_listings` (ADR 0008 §1). Không module nào khác INSERT/UPDATE
 * bảng này. Luôn ghi trong transaction của thay đổi nghiệp vụ gây ra nó (duyệt/sửa/xoá xe).
 *
 * `syncFromVehicle` suy trạng thái listing từ SỰ THẬT của xe, nên mọi sự kiện (duyệt, sửa trường
 * nhạy cảm/không nhạy cảm, xoá mềm) chỉ cần gọi cùng một hàm — không rải logic từng chỗ.
 * `refreshRating` là lối ghi duy nhất cho cột rating denormalize (nuôi sort "Gợi ý") — module
 * review GỌI hàm này chứ không tự UPDATE bảng.
 */
@Injectable()
export class ListingsService {
  constructor(private readonly prisma: PrismaService) {}

  async syncFromVehicle(
    vehicleId: string,
    tx: Prisma.TransactionClient = this.prisma,
  ): Promise<void> {
    const v = await tx.vehicle.findUnique({
      where: { id: vehicleId },
      select: {
        id: true,
        tenantId: true,
        name: true,
        vehicleType: true,
        serviceTypes: true,
        brand: true,
        model: true,
        seatCount: true,
        fuelType: true,
        bodyType: true,
        mainImageUrl: true,
        weekdayPrice: true,
        weekendPrice: true,
        hourlyPrice: true,
        monthlyPrice: true,
        withDriverDailyPrice: true,
        deliveryEnabled: true,
        noCollateral: true,
        discountPercent: true,
        publicStatus: true,
        deletedAt: true,
        branchId: true,
        // Vị trí công khai của xe LẤY TỪ CHI NHÁNH, không còn từ hồ sơ gian hàng: một shop có
        // thể có xe ở nhiều tỉnh, và `tenant_profiles.province_name` là chuỗi tự do.
        branch: { select: { provinceCode: true, province: { select: { name: true } } } },
        tenant: { select: { slug: true } },
        features: { select: { featureKey: true } },
      },
    });
    if (!v) return;

    const status = deriveStatus(v.publicStatus, v.deletedAt);

    if (status === LISTING_STATUS.ACTIVE) {
      // Xe đã duyệt → tạo/cập nhật snapshot đầy đủ, đưa về hiển thị. Rating tính lại từ review
      // trong CÙNG transaction — snapshot luôn tự nhất quán, không lệ thuộc lần refresh trước.
      const rating = await aggregateRating(tx, vehicleId);
      const snapshot = {
        shopSlug: v.tenant.slug,
        title: v.name,
        status,
        vehicleType: v.vehicleType,
        // Mảng đã được vehicles.service canonicalize (sort+dedupe) từ lúc ghi — copy nguyên.
        serviceTypes: v.serviceTypes,
        brand: v.brand,
        model: v.model,
        seatCount: v.seatCount,
        fuelType: v.fuelType,
        bodyType: v.bodyType,
        branchId: v.branchId,
        // Mã là thứ marketplace lọc; tên chỉ để hiển thị. Chi nhánh chưa có tỉnh (dữ liệu cũ
        // chưa bổ sung) → cả hai NULL, và scope công khai sẽ loại xe đó ra cho tới khi sửa —
        // thà không thấy còn hơn thấy ở sai tỉnh.
        provinceCode: v.branch?.provinceCode ?? null,
        provinceName: v.branch?.province?.name ?? null,
        mainImageUrl: v.mainImageUrl,
        weekdayPrice: v.weekdayPrice,
        weekendPrice: v.weekendPrice,
        hourlyPrice: v.hourlyPrice,
        monthlyPrice: v.monthlyPrice,
        withDriverDailyPrice: v.withDriverDailyPrice,
        deliveryEnabled: v.deliveryEnabled,
        noCollateral: v.noCollateral,
        discountPercent: v.discountPercent,
        // Sort key để mảng ổn định giữa các lần sync (so sánh/diff không nhiễu).
        features: v.features.map((f) => f.featureKey).sort(),
        ratingAvg: rating.avg,
        ratingCount: rating.count,
      };
      await tx.publicListing.upsert({
        where: { vehicleId },
        create: { id: newId(), tenantId: v.tenantId, vehicleId, ...snapshot },
        update: snapshot,
      });
      return;
    }

    // Chưa duyệt / bị ẩn / xoá mềm: chỉ hạ trạng thái listing NẾU đã có row. Xe chưa từng duyệt
    // (draft/pending) không có listing → updateMany không khớp, không tạo listing ma.
    await tx.publicListing.updateMany({ where: { vehicleId }, data: { status } });
  }

  /**
   * Cập nhật lại rating denormalize của MỘT xe trên snapshot — gọi từ module review khi có
   * review mới (và mọi flow ẩn/duyệt review sau này PHẢI gọi cả hàm này lẫn
   * `recomputeTenantRating`). `updateMany` để no-op an toàn khi xe chưa có listing.
   */
  async refreshRating(
    vehicleId: string,
    tx: Prisma.TransactionClient = this.prisma,
  ): Promise<void> {
    const rating = await aggregateRating(tx, vehicleId);
    await tx.publicListing.updateMany({
      where: { vehicleId },
      data: { ratingAvg: rating.avg, ratingCount: rating.count },
    });
  }

  /**
   * Đồng bộ lại vị trí đã denormalize của MỌI snapshot thuộc một chi nhánh — gọi khi chi nhánh
   * đổi tỉnh.
   *
   * Một câu UPDATE theo `branch_id` thay vì lặp `syncFromVehicle` từng xe: một chi nhánh có thể
   * giữ hàng trăm xe, và ở đây chỉ có đúng ba cột phụ thuộc chi nhánh — chạy lại toàn bộ snapshot
   * (giá, tiện ích, rating) là việc thừa và là N+1 thật sự.
   */
  async syncBranchLocation(
    branchId: string,
    tx: Prisma.TransactionClient = this.prisma,
  ): Promise<number> {
    const branch = await tx.tenantBranch.findUnique({
      where: { id: branchId },
      select: { provinceCode: true, province: { select: { name: true } } },
    });
    if (!branch) return 0;

    const result = await tx.publicListing.updateMany({
      where: { branchId },
      data: {
        provinceCode: branch.provinceCode,
        provinceName: branch.province?.name ?? null,
      },
    });
    return result.count;
  }
}

/** Gộp điểm review `published` (chưa xoá) của một xe — 2 chữ số thập phân khớp Decimal(3,2). */
async function aggregateRating(
  tx: Prisma.TransactionClient,
  vehicleId: string,
): Promise<{ avg: string | null; count: number }> {
  const agg = await tx.review.aggregate({
    where: { vehicleId, status: REVIEW_STATUS.PUBLISHED, deletedAt: null },
    _avg: { rating: true },
    _count: { _all: true },
  });
  return {
    avg: agg._avg.rating != null ? agg._avg.rating.toFixed(2) : null,
    count: agg._count._all,
  };
}

/** active khi đã duyệt & chưa xoá; archived khi xoá mềm; còn lại hidden (ADR 0008 §2). */
function deriveStatus(publicStatus: string, deletedAt: Date | null): ListingStatus {
  if (deletedAt) return LISTING_STATUS.ARCHIVED;
  if (publicStatus === VEHICLE_PUBLIC_STATUS.APPROVED_PUBLIC) return LISTING_STATUS.ACTIVE;
  return LISTING_STATUS.HIDDEN;
}
