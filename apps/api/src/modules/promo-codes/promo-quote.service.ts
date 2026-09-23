import { Injectable } from '@nestjs/common';
import { normalizePromoCode, PROMO_INELIGIBLE_REASON, type PromoCodeSnapshot } from '@xeprime/types';
import { PricingService, type PromoQuoteContext } from '../pricing/pricing.service';
import type { AvailablePromoQueryDto, PreviewPromoCodeDto, PromoPreviewDto } from './dto/promo-code.dto';
import { PromoCodeEvaluatorService, type PromoEvaluation } from './promo-code-evaluator.service';

/**
 * XEM TRƯỚC mã khuyến mãi cho khách — cửa kiểm THỨ NHẤT của ba cửa (ADR 0046 điều 7).
 *
 * Đọc thuần, không giữ lượt. Nhiệm vụ duy nhất: nối máy giá với bộ đánh giá, rồi trả về TỔNG
 * KHÁCH TRẢ SAU KHI ÁP MÃ — số đó do server tính, vì client không được phép cộng trừ tiền
 * (CLAUDE.md: không tính tiền bằng floating point ở client).
 *
 * Vì sao service này ở module mã khuyến mãi chứ không ở module giá: nó phụ thuộc CẢ HAI, và
 * chiều phụ thuộc phải một hướng. `PricingModule` không biết gì về mã khuyến mãi; module này
 * biết cả hai. Đảo lại là một vòng, và vòng đó chỉ gỡ được bằng `forwardRef` — thứ che mất câu
 * hỏi "ai là nguồn của con số".
 */
@Injectable()
export class PromoQuoteService {
  constructor(
    private readonly pricing: PricingService,
    private readonly evaluator: PromoCodeEvaluatorService,
  ) {}

  /** Xem trước MỘT mã khách vừa gõ. */
  async preview(dto: PreviewPromoCodeDto, customerUserId: string | null): Promise<PromoPreviewDto> {
    const context = await this.pricing.promoContextFor(dto.vehicleId, dto);
    if (!context) {
      return notApplicable(normalizePromoCode(dto.code), PROMO_INELIGIBLE_REASON.NOT_FOUND);
    }

    const evaluation = await this.evaluator.evaluate({
      code: dto.code,
      customerUserId,
      scope: context.scope,
      money: context.money,
    });
    return this.toPreview(evaluation, context, normalizePromoCode(dto.code));
  }

  /**
   * Danh sách mã khả dụng cho chuyến đang xem.
   *
   * Trả cả mã KHÔNG áp được, kèm lý do: một hộp thoại chỉ hiện những mã dùng được thì khách vừa
   * nhận mã qua email sẽ không hiểu vì sao nó biến mất. Nhưng chỉ những mã đã `listed` mới ra
   * tới đây — mã riêng gửi cho một nhóm khách không được phép lộ ra một danh sách công khai
   * (ADR 0046 điều 9).
   */
  async available(
    query: AvailablePromoQueryDto,
    customerUserId: string | null,
  ): Promise<PromoPreviewDto[]> {
    const context = await this.pricing.promoContextFor(query.vehicleId, query);
    if (!context) return [];

    const evaluations = await this.evaluator.listAvailable({
      customerUserId,
      scope: context.scope,
      money: context.money,
    });
    /*
     * Áp được lên trước, rồi tới mã giảm nhiều hơn. Danh sách sắp theo "thứ có lợi cho khách
     * nhất" chứ không theo ngày tạo: đây là một hộp thoại để CHỌN, không phải một sổ lịch sử.
     */
    const previews = await Promise.all(
      evaluations.map((e) => this.toPreview(e, context, e.code?.code ?? '')),
    );
    return previews.sort((a, b) => {
      if (a.applicable !== b.applicable) return a.applicable ? -1 : 1;
      return Number(b.discountAmount ?? 0) - Number(a.discountAmount ?? 0);
    });
  }

  /**
   * Một dòng kết quả. Với mã áp được, tính LẠI bảng phí có mã để trả về tổng khách trả và tiền
   * giữ chỗ SAU giảm — hai con số duy nhất giao diện được hiện, và cả hai đến từ server.
   */
  private async toPreview(
    evaluation: PromoEvaluation,
    context: PromoQuoteContext,
    fallbackCode: string,
  ): Promise<PromoPreviewDto> {
    const row = evaluation.code;
    const terms = row
      ? {
          name: row.name,
          description: row.description,
          discountType: row.discountType,
          discountPercent: row.discountPercent,
          maxDiscountAmount: row.maxDiscountAmount?.toFixed(0) ?? null,
          minOrderAmount: row.minOrderAmount.toFixed(0),
          endsAt: row.endsAt.toISOString(),
        }
      : null;

    if (!evaluation.applicable) {
      return {
        ...notApplicable(row?.code ?? fallbackCode, evaluation.reason),
        ...(terms ?? {}),
      };
    }

    const fees = await this.applyToFees(context, evaluation.snapshot);
    return {
      code: evaluation.snapshot.code,
      applicable: true,
      reason: null,
      /*
       * Số giảm trả về là số ĐÃ ÁP (có thể nhỏ hơn mệnh giá vì trần), và `clamped` nói rõ điều
       * đó — nếu không, khách sẽ tự trừ mệnh giá khỏi tổng rồi thấy con số của mình không khớp.
       */
      discountAmount: fees?.promoDiscountAmount ?? evaluation.snapshot.discountApplied,
      clamped: evaluation.clamped,
      customerTotalAmount: fees?.customerTotalAmount ?? null,
      holdAmount: fees?.holdAmount ?? null,
      name: evaluation.snapshot.name,
      description: terms?.description ?? null,
      discountType: evaluation.snapshot.discountType,
      discountPercent: evaluation.snapshot.discountPercent,
      maxDiscountAmount: evaluation.snapshot.maxDiscountAmount,
      minOrderAmount: evaluation.snapshot.minOrderAmount,
      endsAt: terms?.endsAt ?? new Date().toISOString(),
    };
  }

  private applyToFees(context: PromoQuoteContext, promo: PromoCodeSnapshot) {
    return this.pricing.applyPromoToFees(context.tenantId, context.breakdown.totalAmount, {
      quoteIsEstimate: context.quoteIsEstimate,
      promo,
      personalAccidentSelected: context.personalAccidentSelected,
    });
  }
}

/**
 * Dòng "không áp được" — LUÔN có `reason`.
 *
 * Mọi số tiền về `null`, không về `'0'`: một ô hiện "giảm 0đ" trông như mã đã được áp mà không
 * có tác dụng, còn `null` thì giao diện buộc phải vẽ nhánh lý do.
 */
function notApplicable(code: string, reason: string): PromoPreviewDto {
  return {
    code,
    applicable: false,
    reason,
    discountAmount: null,
    clamped: null,
    customerTotalAmount: null,
    holdAmount: null,
    name: '',
    description: null,
    discountType: '',
    discountPercent: null,
    maxDiscountAmount: null,
    minOrderAmount: '0',
    endsAt: new Date().toISOString(),
  };
}
