import { SERVICE_TYPE } from '@xeprime/types';
import { Prisma } from '../generated/client';
import type { PrismaClient } from '../generated/client';

type Client = PrismaClient | Prisma.TransactionClient;

/**
 * Bốn trường của THẺ XE ở chợ mà snapshot `public_listings` mirror từ bảng gốc — thẻ kết quả
 * đọc chúng từ snapshot thay vì join sang `vehicles` mỗi lượt xem (ADR 0008).
 *
 *   · `imageCount`  — tổng số ảnh của xe (`vehicle_images`), thẻ hiện "+N" ảnh.
 *   · `transmission` — mirror `vehicles.transmission`.
 *   · `instantBookServiceTypes` — dịch vụ đang BẬT tự động nhận chuyến (`vehicle_service_settings`),
 *     chỉ trong số dịch vụ xe đang nhận; thẻ hiện "Không cần xác nhận" theo đúng dịch vụ khách
 *     đang xem, không theo một cờ gộp.
 *   · `wardName` — tên xã/phường của CHI NHÁNH đang giữ xe (cùng nguồn với `provinceName`).
 *
 * Dùng chung cho `ListingsService` (API — writer runtime duy nhất) và bản sao seed: hai nơi dựng
 * snapshot phải ra cùng một con số, nên phép tính sống ở MỘT chỗ.
 */
export interface ListingCardExtras {
  imageCount: number;
  transmission: string | null;
  instantBookServiceTypes: string[];
  wardName: string | null;
}

export async function readListingCardExtras(
  db: Client,
  vehicleId: string,
  serviceTypes: readonly string[],
): Promise<ListingCardExtras> {
  const v = await db.vehicle.findUnique({
    where: { id: vehicleId },
    select: {
      transmission: true,
      _count: { select: { images: true } },
      serviceSettings: { where: { autoAcceptEnabled: true }, select: { serviceType: true } },
      branch: { select: { ward: { select: { name: true } } } },
    },
  });
  if (!v) {
    return { imageCount: 0, transmission: null, instantBookServiceTypes: [], wardName: null };
  }

  const offered = new Set(serviceTypes);
  return {
    imageCount: v._count.images,
    transmission: v.transmission,
    // Dịch vụ xe đã thôi nhận thì cờ tự động nhận của nó không còn nghĩa gì với khách. Sắp xếp
    // để mảng ổn định giữa các lần sync (cùng lý do với `features`).
    instantBookServiceTypes: v.serviceSettings
      .map((s) => s.serviceType)
      .filter((s) => offered.has(s))
      .sort(),
    wardName: v.branch?.ward?.name ?? null,
  };
}

/**
 * Giá TỰ LÁI theo ngày SAU khuyến mãi trực tiếp của chủ xe — cột `self_drive_daily_price` của
 * snapshot. Một cột để mọi nơi cần "giá ngày thực khách trả" (thẻ địa điểm "chỉ từ …", sau này là
 * lọc/sắp theo giá) gộp được bằng Prisma trên CHÍNH `publicListingScope()`, thay vì chép tay
 * phạm vi đó vào SQL thô.
 *
 * Làm tròn về đồng gần nhất, nửa lên — đúng phép `applyDiscountPercent` của thẻ xe, để "chỉ từ
 * 432k" trên thẻ địa điểm khớp con số khách thấy khi bấm vào. Xe không nhận tự lái hoặc chưa có
 * giá ngày ⇒ `null`.
 */
export function selfDriveDailyPrice(
  weekdayPrice: Prisma.Decimal | null,
  discountPercent: number | null,
  serviceTypes: readonly string[],
): Prisma.Decimal | null {
  if (weekdayPrice == null || !serviceTypes.includes(SERVICE_TYPE.SELF_DRIVE)) return null;
  const percent =
    discountPercent && discountPercent > 0 && discountPercent <= 100 ? discountPercent : 0;
  return weekdayPrice
    .mul(100 - percent)
    .div(100)
    .toDecimalPlaces(0, Prisma.Decimal.ROUND_HALF_UP);
}
