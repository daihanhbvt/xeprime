import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { INSURANCE_PARTNER_MODE } from '@xeprime/prisma';
import { INSURANCE_PREMIUM_SYNC_STATUS, readInsurancePremiumTiers } from '@xeprime/types';
import type { InsurancePremiumSyncResultDto } from './dto/insurance-insights.dto';
import { InsurancePremiumQuoteService } from './insurance-premium-quote.service';
import { derivePremiumSchedule } from './insurance-premium-schedule';
import { nextVnMorning, vnYear } from './insurance-premium-sample';
import { InsuranceProductsService } from './insurance-products.service';
import { INSURANCE_PARTNER, type InsurancePartner } from './partner/insurance-partner.port';

/** Xe mẫu 1 tỷ: phí làm tròn tới đồng nên % suy ngược chính xác tới 0,0000001%. */
const REFERENCE_VALUE = '1000000000';
/** MIC không đổi phí theo số chỗ trong khoảng 2-9 (đo 18/11/2026). */
const SEAT_COUNT = 5;
/**
 * Đời xe cũ nhất hỏi hãng: 25 năm trước năm nay. Thường không hỏi tới đó: gặp đời đầu tiên hãng từ
 * chối là dừng (`derivePremiumSchedule` bước 3).
 */
const YEARS_BACK = 25;
const CONCURRENCY = 4;
const PER_CALL_TIMEOUT_MS = 8_000;
/** ~50-60 lượt × ~0,2 giây ÷ 4 song song ≈ vài giây; hãng chậm thì chặn cả lượt ở 2 phút. */
const DEADLINE_MS = 120_000;
const HOUR_MS = 60 * 60 * 1000;

/**
 * ĐỒNG BỘ biểu phí bảo hiểm vật chất xe từ hãng — ADR 0106 điều 1.
 *
 * Hỏi API tính phí của hãng (MIC `phi_vcx`) đủ để dựng lại biểu phí: mốc ngày của các bậc và % của
 * từng nhóm năm sản xuất (`derivePremiumSchedule`, ~50-60 lượt), rồi ghi qua
 * `InsuranceProductsService` — writer duy nhất của `insurance_products`. Thành công ⇒ biểu phí khoá;
 * hỏng ⇒ giữ biểu phí đang chạy và mở cho admin sửa tay.
 *
 * KHÔNG có vòng tự chạy — chỉ chạy khi admin bấm "Đồng bộ từ MIC ngay". MIC đổi giá thì lượt duyệt
 * đơn (vốn đã hỏi MIC phí của hợp đồng — ADR 0097) thấy lệch và đánh dấu biểu phí `drifted`
 * (`InsurancePremiumQuoteService`), không tốn thêm lượt hỏi nào.
 *
 * Chỉ chạy với adapter THẬT (`INSURANCE_PARTNER=mic`): adapter giả lập trả lại đúng công thức đang
 * cấu hình, "đồng bộ" với nó chỉ khoá biểu phí của môi trường dev mà không học được gì.
 */
@Injectable()
export class InsurancePremiumSyncService {
  private readonly logger = new Logger(InsurancePremiumSyncService.name);
  /** Một lượt đang chạy — bấm lại khi đang chạy thì đợi chung lượt đó. */
  private running: Promise<InsurancePremiumSyncResultDto> | null = null;

  constructor(
    private readonly products: InsuranceProductsService,
    private readonly quotes: InsurancePremiumQuoteService,
    private readonly config: ConfigService,
    @Inject(INSURANCE_PARTNER) private readonly partner: InsurancePartner,
  ) {}

  /** Môi trường này đồng bộ được không — adapter thật có API tính phí. */
  supported(): boolean {
    return (
      this.config.get<string>('INSURANCE_PARTNER') === INSURANCE_PARTNER_MODE.MIC &&
      typeof this.partner.quotePremium === 'function'
    );
  }

  /** Đồng bộ NGAY (nút của admin). */
  sync(actorUserId: string): Promise<InsurancePremiumSyncResultDto> {
    this.running ??= this.run(actorUserId).finally(() => {
      this.running = null;
    });
    return this.running;
  }

  private async run(actorUserId: string): Promise<InsurancePremiumSyncResultDto> {
    if (!this.supported()) {
      return { status: 'not_supported', askedCount: 0, failureReason: null, product: null };
    }
    const product = await this.products.vehicleTripTierProduct();
    if (!product) {
      return { status: 'not_supported', askedCount: 0, failureReason: null, product: null };
    }
    const from = nextVnMorning();
    const year = vnYear();
    const started = Date.now();
    const derived = await derivePremiumSchedule({
      referenceValue: REFERENCE_VALUE,
      newestYear: year + 1,
      oldestYear: year - YEARS_BACK,
      knownBoundaries: (readInsurancePremiumTiers(product.premiumTiersJson) ?? []).map(
        (t) => t.maxDays,
      ),
      concurrency: CONCURRENCY,
      perCallTimeoutMs: PER_CALL_TIMEOUT_MS,
      deadlineMs: DEADLINE_MS,
      ask: ({ manufactureYear, hours, timeoutMs }) =>
        this.quotes.ask(
          {
            insuredValue: REFERENCE_VALUE,
            manufactureYear,
            seatCount: SEAT_COUNT,
            from,
            to: new Date(from.getTime() + hours * HOUR_MS),
            // Adapter thật bỏ qua số này; chỉ giả lập trả lại nó (và giả lập không đồng bộ).
            formulaAmount: '0',
          },
          timeoutMs,
        ),
    });
    const dto = await this.products.applyPremiumSync(
      product.id,
      derived.ok
        ? { ok: true, tiers: derived.tiers, bands: derived.bands }
        : { ok: false, reason: derived.reason },
      actorUserId,
    );
    const elapsed = Date.now() - started;
    if (derived.ok) {
      this.logger.log(
        `Bảo hiểm: đồng bộ biểu phí ${this.partner.partnerName} - ${derived.tiers.length} bậc, ${derived.bands.length} nhóm năm, ${derived.askedCount} lượt hỏi, ${elapsed}ms`,
      );
    } else {
      this.logger.warn(
        `Bảo hiểm: đồng bộ biểu phí hỏng sau ${derived.askedCount} lượt hỏi - ${derived.reason}`,
      );
    }
    return {
      status: derived.ok
        ? INSURANCE_PREMIUM_SYNC_STATUS.SYNCED
        : INSURANCE_PREMIUM_SYNC_STATUS.FAILED,
      askedCount: derived.askedCount,
      failureReason: derived.ok ? null : derived.reason,
      product: dto,
    };
  }
}
