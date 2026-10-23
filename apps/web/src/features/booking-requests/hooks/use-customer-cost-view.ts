'use client';

import { useLocale, useTranslations } from 'next-intl';
import { absoluteMoney, isNegativeMoney, isZeroMoney } from '@xeprime/domain';
import { COLLATERAL_MODE, PRICE_ROW, type CollateralMode } from '@xeprime/types';
import type { PublicListingDetail } from '@/features/marketplace/types';
import type { PublicQuote } from '@/features/rental-policies/types';
import { useAppFormat } from '@/i18n/use-app-format';
import { useDomainLabel } from '@/i18n/use-domain-label';
import { payAtPickupAmount, visibleFeeLines, visiblePriceRows } from '@/lib/customer-price-view';
import { useQuoteTotal } from './use-quote-total';

type QuoteBreakdown = PublicQuote['breakdown'];

/**
 * Những mảnh một bảng tiền phía khách cần — báo giá công khai (`PublicQuote['breakdown']`) có đủ;
 * bảng kê TẠM TÍNH của một chuyến đã gửi (`CustomerTripEstimateDto`) cũng dựng được bằng đúng các
 * mảnh này.
 */
export type CustomerCostBreakdown = Pick<
  QuoteBreakdown,
  'rows' | 'totalAmount' | 'depositAmount' | 'fees' | 'estimateNote'
> & {
  /** Gói dài hạn — chỉ để nói phần "tiết kiệm" của ưu đãi cam kết thời hạn (ADR 0011). */
  longTerm?: QuoteBreakdown['longTerm'];
};

export interface CustomerDepositView {
  mode: CollateralMode;
  /** Số tiền khi cọc bằng TIỀN; hình thức khác thì `null` và nơi vẽ hiện tên hình thức. */
  amount: string | null;
  /** Câu giải thích dưới dòng cọc. */
  note: string;
}

/**
 * MÔ HÌNH HIỂN THỊ của bảng tiền phía khách — CHỈ đọc báo giá / bảng kê của SERVER, không cộng trừ.
 *
 * Một nguồn cho mọi bề mặt vẽ tiền trước khi có đơn: thẻ "Thành tiền" của trang chi tiết xe, hai thẻ
 * tiền của màn Xem lại yêu cầu và của các màn chuyến (`BookingReviewCosts`). Mỗi nơi tự lọc dòng,
 * tự suy cọc hay tự chọn tên dòng tổng là mỗi nơi có thể nói một con số khác cho CÙNG một chuyến —
 * đúng lỗi của thẻ đặt xe cũ (tiền giữ chỗ = 30% tiền thuê, VAT = 10% tính ở trình duyệt).
 *
 * Dòng nào vẽ do `lib/customer-price-view` quyết (ẩn dòng 0đ, ẩn dòng do chủ xe chịu — thuế khấu
 * trừ không bao giờ cộng vào tổng khách, ADR 0032 điều 3). Hình dạng là việc của nơi vẽ.
 */
export function useCustomerCostView({
  listing,
  breakdown,
  isDelivery,
  frozen = false,
}: {
  listing: PublicListingDetail | null;
  breakdown: CustomerCostBreakdown | null;
  /** Khách chọn giao xe tận nơi — phí giao là DỰ KIẾN, chủ xe chốt lúc duyệt (ADR 0018). */
  isDelivery: boolean;
  /** Số đã CHỐT (bảng kê đóng băng lúc chủ xe nhận chuyến / của đơn) — tổng không còn "dự kiến". */
  frozen?: boolean;
}) {
  const t = useTranslations('BookingRequests.flow');
  const tCommon = useTranslations('Common');
  const dl = useDomainLabel();
  const fmt = useAppFormat();

  /** Số âm (dòng giảm) viết bằng dấu trừ thật — `-` của chuỗi trên dây đọc như gạch nối. */
  const signedMoney = (amount: string) =>
    isNegativeMoney(amount) ? `−${fmt.money(absoluteMoney(amount))}` : fmt.money(amount);

  const locale = useLocale();
  const fees = breakdown?.fees ?? null;
  /*
   * Nhãn dòng tiền thuê: server viết sẵn câu TIẾNG VIỆT ("Tiền thuê gốc", "2 ngày × 650.000đ/ngày").
   * Bản tiếng Việt giữ nguyên câu đó (đủ chi tiết nhất); bản tiếng Anh dịch nhãn theo MÃ dòng
   * (`Domain.priceRow`, ADR 0012) và bỏ dòng phụ — server chưa trả dữ kiện có cấu trúc để dựng lại nó,
   * và một dòng tiếng Việt giữa trang tiếng Anh là thứ ADR 0012 cấm.
   */
  const rentRows = (breakdown ? visiblePriceRows(breakdown.rows, [PRICE_ROW.SUBTOTAL]) : []).map(
    (row) =>
      locale === 'vi'
        ? row
        : {
            ...row,
            label:
              row.key === PRICE_ROW.DISCOUNT && breakdown?.longTerm
                ? t('price.durationDiscount')
                : dl('priceRow', row.key, row.label),
            sublabel: null,
          },
  );
  const feeLines = visibleFeeLines(fees?.lines ?? [], 'customer');
  const promoDiscount = fees?.promoDiscountAmount ?? '0';
  const hasPromo = !isZeroMoney(promoDiscount);
  const longTerm = breakdown?.longTerm ?? null;
  const holdAmount = fees?.holdAmount ?? null;
  const payAtPickup = payAtPickupAmount(fees);

  /*
   * Cọc khi nhận xe: HÌNH THỨC lấy từ hồ sơ xe (tiền / tài sản / miễn), SỐ TIỀN ưu tiên báo giá
   * (chính sách hiệu lực của chuyến này), rồi tới hồ sơ xe. Không có gì để nói thì KHÔNG vẽ dòng —
   * không bao giờ một con số mặc định.
   */
  const collateral = listing?.collateral ?? null;
  const quotedDeposit =
    breakdown?.depositAmount && !isZeroMoney(breakdown.depositAmount)
      ? breakdown.depositAmount
      : null;
  const depositMode: CollateralMode | null =
    listing?.noCollateral || collateral?.mode === COLLATERAL_MODE.NONE
      ? COLLATERAL_MODE.NONE
      : (collateral?.mode ?? (quotedDeposit ? COLLATERAL_MODE.CASH : null));
  const depositAmount =
    quotedDeposit ??
    (collateral && !isZeroMoney(collateral.depositAmount) ? collateral.depositAmount : null);
  const deposit: CustomerDepositView | null =
    depositMode === COLLATERAL_MODE.NONE ||
    depositMode === COLLATERAL_MODE.ASSET ||
    (depositMode === COLLATERAL_MODE.CASH && depositAmount != null)
      ? {
          mode: depositMode,
          amount: depositMode === COLLATERAL_MODE.CASH ? depositAmount : null,
          note:
            depositMode === COLLATERAL_MODE.NONE
              ? t('reviewPage.others.noDepositBody')
              : depositMode === COLLATERAL_MODE.ASSET && collateral?.assetTypes.length
                ? t('reviewPage.others.assetBody', {
                    assets: collateral.assetTypes
                      .map((asset) => dl('collateralAssetType', asset))
                      .join(', '),
                  })
                : tCommon('components.price.depositHint'),
        }
      : null;

  /* Có phụ phí hoặc mã ⇒ số cuối là TỔNG BẠN TRẢ, không còn là tiền thuê — cùng luật `PriceBreakdown`. */
  const total = useQuoteTotal(breakdown, { frozen });
  const costNote = [
    breakdown?.estimateNote ? `${breakdown.estimateNote}.` : null,
    t('reviewPage.costs.totalNote'),
    /*
     * Phí giao nhận "chưa nằm trong tổng" chỉ đúng khi bảng chưa có dòng đó. Bảng đã CHỐT mà có dòng
     * giao nhận thì phí đã nằm trong tổng — nói ngược lại là sai.
     */
    isDelivery && !(frozen && rentRows.some((row) => row.key === PRICE_ROW.DELIVERY))
      ? t('price.deliveryNote')
      : null,
    frozen ? null : t('price.finalNote'),
  ]
    .filter(Boolean)
    .join(' ');

  return {
    signedMoney,
    fees,
    rentRows,
    feeLines,
    promoDiscount,
    hasPromo,
    longTerm,
    holdAmount,
    payAtPickup,
    deposit,
    total,
    costNote,
  };
}
