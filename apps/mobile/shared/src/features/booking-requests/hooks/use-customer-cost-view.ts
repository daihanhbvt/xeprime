import { useTranslations } from 'use-intl';
import { absoluteMoney, isNegativeMoney, isZeroMoney, payAtPickupAmount } from '@xeprime/domain';
import {
  COLLATERAL_MODE,
  PRICE_ROW,
  type CollateralMode,
  type PublicListingDetail,
} from '@xeprime/types';
import type { PriceBreakdownFeesInput } from '@/components/ui/PriceBreakdown';
import { useAppFormat } from '@/i18n/use-app-format';
import { useDomainLabel } from '@/i18n/domain';
import { visibleFeeLines, visiblePriceRows } from '../customer-price-view';
import { useQuoteTotal } from './use-quote-total';
import { useLocalizePriceRows } from './use-localized-price-rows';

/** Những mảnh một bảng tiền phía khách cần — báo giá công khai và bảng kê tạm tính đều có đủ. */
export interface CustomerCostBreakdown {
  rows: ReadonlyArray<{ key: string; label: string; sublabel?: string | null; amount: string }>;
  totalAmount: string;
  depositAmount?: string | null;
  fees?: PriceBreakdownFeesInput | null;
  estimateNote?: string | null;
  longTerm?: {
    packageMonths: number;
    durationDiscountPercent?: number | null;
    durationDiscountAmount: string;
  } | null;
}

export interface CustomerDepositView {
  mode: CollateralMode;
  /** Số tiền khi cọc bằng TIỀN; hình thức khác thì `null` và nơi vẽ hiện tên hình thức. */
  amount: string | null;
  note: string;
}

/**
 * MÔ HÌNH HIỂN THỊ của bảng tiền phía khách — bản native của `useCustomerCostView` web (#212).
 * CHỈ đọc báo giá / bảng kê của SERVER, không cộng trừ. Một nguồn cho thẻ "Thành tiền" ở trang
 * chi tiết xe và hai thẻ tiền của màn Xem lại / các màn chuyến (`BookingReviewCosts`).
 */
export function useCustomerCostView({
  listing,
  breakdown,
  isDelivery,
  frozen = false,
}: {
  listing: PublicListingDetail | null;
  breakdown: CustomerCostBreakdown | null;
  isDelivery: boolean;
  frozen?: boolean;
}) {
  const t = useTranslations('BookingRequests.flow');
  const tPrice = useTranslations('Common.components.price');
  const dl = useDomainLabel();
  const fmt = useAppFormat();
  const localizeRows = useLocalizePriceRows();

  /** Số âm (dòng giảm) viết bằng dấu trừ thật. */
  const signedMoney = (amount: string) =>
    isNegativeMoney(amount) ? `−${fmt.money(absoluteMoney(amount))}` : fmt.money(amount);

  const fees = breakdown?.fees ?? null;
  // Nhãn dòng tiền thuê: tiếng Việt giữ câu của server, tiếng Anh dịch theo mã (ADR 0012).
  const rentRows = localizeRows(
    breakdown ? visiblePriceRows(breakdown.rows, [PRICE_ROW.SUBTOTAL]) : [],
    Boolean(breakdown?.longTerm),
  );
  const feeLines = visibleFeeLines(fees?.lines ?? [], 'customer');
  const promoDiscount = fees?.promoDiscountAmount ?? '0';
  const hasPromo = !isZeroMoney(promoDiscount);
  const longTerm = breakdown?.longTerm ?? null;
  const holdAmount = fees?.holdAmount ?? null;
  const payAtPickup = payAtPickupAmount(fees);

  /* Cọc khi nhận xe: hình thức từ hồ sơ xe, số tiền ưu tiên báo giá — không bao giờ số mặc định. */
  const collateral = listing?.collateral ?? null;
  const quotedDeposit =
    breakdown?.depositAmount && !isZeroMoney(breakdown.depositAmount)
      ? breakdown.depositAmount
      : null;
  const depositMode: CollateralMode | null =
    listing?.noCollateral || collateral?.mode === COLLATERAL_MODE.NONE
      ? COLLATERAL_MODE.NONE
      : ((collateral?.mode as CollateralMode | undefined) ??
        (quotedDeposit ? COLLATERAL_MODE.CASH : null));
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
                : tPrice('depositHint'),
        }
      : null;

  const total = useQuoteTotal(breakdown, { frozen });
  const costNote = [
    breakdown?.estimateNote ? `${breakdown.estimateNote}.` : null,
    t('reviewPage.costs.totalNote'),
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
