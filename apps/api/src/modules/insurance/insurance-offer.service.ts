import { Inject, Injectable } from '@nestjs/common';
import {
  INSURANCE_PRODUCT_KIND,
  type InsuranceOfferedByKind,
  type InsuranceProductKind,
} from '@xeprime/types';
import { PrismaService } from '../../prisma/prisma.service';
import { INSURANCE_PARTNER, type InsurancePartner } from './partner/insurance-partner.port';

const NOTHING_OFFERED: InsuranceOfferedByKind = { vehicleProtection: false, tripInsurance: false };

/**
 * Bao lâu một câu trả lời "sản phẩm nào đang bật" được dùng lại trong CÙNG tiến trình.
 *
 * Câu hỏi này chạy ở mọi báo giá công khai và mọi thẻ của hộp thư gian hàng — một lượt đọc DB cho
 * một bảng hai dòng đổi vài lần một năm. Admin sửa sản phẩm ở CHÍNH tiến trình này thì bộ nhớ đệm
 * bị xoá ngay (`invalidate`); tiến trình API khác (deploy nhiều bản) thấy thay đổi chậm nhất sau
 * chừng này. Lượt duyệt vẫn đóng băng sản phẩm từ DB trong transaction của nó
 * (`freezeInsuranceProducts`), không từ bộ nhớ đệm này.
 */
export const INSURANCE_OFFER_CACHE_TTL_MS = 30_000;

/** Nguồn sản phẩm đang bật — chỉ phần `PrismaService` mà service này đọc (spec cắm bản giả). */
export type InsuranceProductSource = Pick<PrismaService, 'insuranceProduct'>;

/**
 * Nền tảng ĐANG bán bảo hiểm chuyến nào — MỘT câu trả lời cho mọi đường tính tiền (ADR 0028 điều
 * 5, ADR 0032 điều 4, ADR 0064): báo giá công khai, xem trước mã, duyệt yêu cầu (`commitDecision`
 * báo giá lại qua `PricingService`), dựng khoản giữ chỗ — và danh mục sản phẩm công khai.
 *
 * Một sản phẩm được bán khi đủ HAI điều:
 *   1. có đối tác phát hành — `configured` của CHÍNH adapter mà `InsuranceModule` chọn (cùng hàm
 *      `createInsurancePartner` worker dùng để phát hành). Không tự đọc lại `INSURANCE_PARTNER`:
 *      hai phép kiểm độc lập là hai câu trả lời có thể lệch nhau;
 *   2. sản phẩm loại đó đang BẬT trong danh mục `insurance_products` — admin tắt sản phẩm là thôi
 *      THU ở server, không chỉ ẩn ô chọn: client cũ gửi `selected = true` vẫn không có dòng `IV`/`IP`.
 *
 * Cổng của chính sách phí (`*Enabled`) và lựa chọn của khách là hai cổng KẾ TIẾP, xét trong
 * `computeCustomerFees`.
 *
 * Sống ở `InsuranceModule` (không ở `PricingModule`) vì `InsuranceProductsService` cần nó — để lọc
 * danh mục công khai và xoá bộ nhớ đệm khi admin sửa — và `PricingModule` đã import module này.
 */
@Injectable()
export class InsuranceOfferService {
  private cache: { kinds: ReadonlySet<string>; at: number } | null = null;
  /** Tăng mỗi lần `invalidate` — một lượt đọc bắt đầu TRƯỚC lần xoá không được ghi đè cache mới. */
  private generation = 0;

  constructor(
    @Inject(INSURANCE_PARTNER) private readonly partner: InsurancePartner,
    @Inject(PrismaService) private readonly products: InsuranceProductSource,
  ) {}

  async offeredByKind(): Promise<InsuranceOfferedByKind> {
    if (!this.partner.configured) return NOTHING_OFFERED;
    const kinds = await this.activeKinds();
    return {
      vehicleProtection: kinds.has(INSURANCE_PRODUCT_KIND.VEHICLE_TRIP),
      tripInsurance: kinds.has(INSURANCE_PRODUCT_KIND.PERSONAL_ACCIDENT),
    };
  }

  /** Một loại sản phẩm có đang được bán không — đọc cùng câu trả lời với `offeredByKind`. */
  static offers(offered: InsuranceOfferedByKind, kind: InsuranceProductKind): boolean {
    return kind === INSURANCE_PRODUCT_KIND.VEHICLE_TRIP
      ? offered.vehicleProtection
      : offered.tripInsurance;
  }

  /** Xoá bộ nhớ đệm — `InsuranceProductsService.update` gọi SAU khi transaction sửa đã commit. */
  invalidate(): void {
    this.cache = null;
    this.generation += 1;
  }

  private async activeKinds(): Promise<ReadonlySet<string>> {
    const now = Date.now();
    if (this.cache && now - this.cache.at < INSURANCE_OFFER_CACHE_TTL_MS) return this.cache.kinds;
    const generation = this.generation;
    const active = await this.products.insuranceProduct.findMany({
      where: { isActive: true },
      select: { kind: true },
    });
    const kinds = new Set(active.map((p) => p.kind));
    if (generation === this.generation) this.cache = { kinds, at: now };
    return kinds;
  }
}
