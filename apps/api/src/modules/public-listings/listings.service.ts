import { Injectable } from '@nestjs/common';
import { newId, Prisma } from '@xeprime/prisma';
import { LISTING_STATUS, VEHICLE_PUBLIC_STATUS, type ListingStatus } from '@xeprime/types';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * Nguồn ghi DUY NHẤT của `public_listings` (ADR 0008 §1). Không module nào khác INSERT/UPDATE
 * bảng này. Luôn ghi trong transaction của thay đổi nghiệp vụ gây ra nó (duyệt/sửa/xoá xe).
 *
 * `syncFromVehicle` suy trạng thái listing từ SỰ THẬT của xe, nên mọi sự kiện (duyệt, sửa trường
 * nhạy cảm/không nhạy cảm, xoá mềm) chỉ cần gọi cùng một hàm — không rải logic từng chỗ.
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
        serviceType: true,
        brand: true,
        model: true,
        seatCount: true,
        fuelType: true,
        mainImageUrl: true,
        weekdayPrice: true,
        weekendPrice: true,
        publicStatus: true,
        deletedAt: true,
        tenant: { select: { slug: true, profile: { select: { provinceName: true } } } },
      },
    });
    if (!v) return;

    const status = deriveStatus(v.publicStatus, v.deletedAt);

    if (status === LISTING_STATUS.ACTIVE) {
      // Xe đã duyệt → tạo/cập nhật snapshot đầy đủ, đưa về hiển thị.
      const snapshot = {
        shopSlug: v.tenant.slug,
        title: v.name,
        status,
        vehicleType: v.vehicleType,
        serviceType: v.serviceType,
        brand: v.brand,
        model: v.model,
        seatCount: v.seatCount,
        fuelType: v.fuelType,
        provinceName: v.tenant.profile?.provinceName ?? null,
        mainImageUrl: v.mainImageUrl,
        weekdayPrice: v.weekdayPrice,
        weekendPrice: v.weekendPrice,
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
}

/** active khi đã duyệt & chưa xoá; archived khi xoá mềm; còn lại hidden (ADR 0008 §2). */
function deriveStatus(publicStatus: string, deletedAt: Date | null): ListingStatus {
  if (deletedAt) return LISTING_STATUS.ARCHIVED;
  if (publicStatus === VEHICLE_PUBLIC_STATUS.APPROVED_PUBLIC) return LISTING_STATUS.ACTIVE;
  return LISTING_STATUS.HIDDEN;
}
