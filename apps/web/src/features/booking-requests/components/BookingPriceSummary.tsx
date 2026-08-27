'use client';

import { DownOutlined, UpOutlined } from '@ant-design/icons';
import { Skeleton } from 'antd';
import { useTranslations } from 'next-intl';
import { SERVICE_TYPE, type RouteType, type ServiceType } from '@xeprime/types';
import { DiscountTag } from '@/components/data-display/DiscountTag';
import { PriceBreakdown } from '@/components/data-display/PriceBreakdown';
import { useAppFormat } from '@/i18n/use-app-format';
import { useDomainLabel } from '@/i18n/use-domain-label';
import type { PublicListingDetail } from '@/features/marketplace/types';
import type { PublicQuote } from '@/features/rental-policies/types';
import { cx } from '@/lib/cx';
import { applyDiscountPercent } from '@/lib/money';
import styles from './BookingPriceSummary.module.css';

interface BookingPriceSummaryProps {
  listing: PublicListingDetail | null;
  serviceType: ServiceType;
  routeType: RouteType;
  quote: PublicQuote | null;
  quoteLoading: boolean;
  /** Khách đã chọn đủ (khoảng thuê, hoặc gói dài hạn) để server báo giá được chưa. */
  hasSelection: boolean;
  /** Chuyến chọn giao tận nơi — thêm câu "Phí giao nhận: Miễn phí". */
  isDelivery?: boolean;
  /**
   * `bar` — một dòng tổng, dính đáy cột cùng hàng nút.
   * `detail` — bảng đầy đủ, nằm TRONG mạch cuộn của bước; không render gì khi chưa mở.
   */
  variant: 'bar' | 'detail';
  /** Trạng thái mở do luồng giữ: hai hình thái LOẠI TRỪ nhau, không bao giờ cùng hiện. */
  expanded: boolean;
  onExpandedChange?: (next: boolean) => void;
}

/** Một dòng đơn giá khi CHƯA có báo giá — bảng niêm yết, không phải breakdown. */
interface UnitRow {
  key: string;
  label: string;
  amount: string;
  unit: string;
  /** Giá gạch ngang khi có khuyến mãi trực tiếp. */
  strikeAmount?: string;
}

/**
 * Khối tiền DUY NHẤT của luồng đặt xe, dựng ở HAI vị trí khác nhau của cùng một cột — và tại
 * mỗi thời điểm chỉ MỘT trong hai có mặt:
 *
 * - `variant="bar"` (đang thu gọn) — dòng tổng dính đáy cùng hàng nút. Đây là chỗ khách liếc
 *   mắt trong lúc đổi thời gian hay hình thức nhận xe.
 * - `variant="detail"` (đang mở) — bảng chi tiết đặt CUỐI thân bước, cuộn chung một mạch với
 *   phần nhập liệu phía trên. Nút "Thu gọn" nằm ngay dưới bảng, cạnh thứ nó thu lại.
 *
 * Vì sao tách đôi thay vì để một khối tự phình ra: bản trước mở "Chi tiết" ngay trong khối
 * dính đáy, nên bảng nở NGƯỢC LÊN, che mất phần nhập liệu và tự cuộn trong một vùng riêng —
 * bánh xe chuột ở đó không cuộn được nội dung bước, còn nội dung bước thì bị bảng đè.
 *
 * Vì sao dòng tổng BIẾN MẤT khi bảng mở: bảng đã có hàng "TỔNG DỰ KIẾN" của riêng nó, giữ
 * thêm dòng dính đáy là cùng một con số hiện hai lần cách nhau vài chục pixel.
 *
 * Component KHÔNG cộng trừ gì: có báo giá thì mọi con số đến từ `PricingService` qua
 * `/public/listings/:id/quote`; chưa có thì chỉ đọc lại giá NIÊM YẾT của xe cho đúng dịch vụ
 * đang chọn (giá tự lái không được trưng cho chuyến dài hạn/có tài xế — ADR 0011).
 */
export function BookingPriceSummary({
  listing,
  serviceType,
  routeType,
  quote,
  quoteLoading,
  hasSelection,
  isDelivery = false,
  variant,
  expanded,
  onExpandedChange,
}: BookingPriceSummaryProps) {
  const t = useTranslations('BookingRequests.flow');
  const dl = useDomainLabel();
  const fmt = useAppFormat();

  const isLongTerm = serviceType === SERVICE_TYPE.LONG_TERM;
  const isWithDriver = serviceType === SERVICE_TYPE.WITH_DRIVER;
  /* Khuyến mãi trực tiếp thuộc dịch vụ TỰ LÁI — không áp, không hiện ở dịch vụ khác. */
  const promoPercent = !isLongTerm && !isWithDriver ? (listing?.discountPercent ?? 0) : 0;

  const breakdown = quote?.breakdown ?? null;
  const longTerm = breakdown?.longTerm ?? null;
  const totalLabel = breakdown?.estimateNote ? t('price.subtotal') : t('price.total');

  const unitRows = buildUnitRows();
  const headline = unitRows[0];
  const isDetail = variant === 'detail';

  function buildUnitRows(): UnitRow[] {
    if (!listing) return [];
    if (isLongTerm) {
      return listing.monthlyPrice
        ? [
            {
              key: 'monthly',
              label: t('price.longTermBase'),
              amount: listing.monthlyPrice,
              unit: t('price.perMonth'),
            },
          ]
        : [];
    }
    if (isWithDriver) {
      const rows: UnitRow[] = [];
      if (listing.withDriverDailyPrice) {
        rows.push({
          key: 'inCity',
          label: t('price.withDriverInCity'),
          amount: listing.withDriverDailyPrice,
          unit: t('price.perDay'),
        });
      }
      if (listing.withDriverInterCityPrice) {
        rows.push({
          key: 'interCity',
          label: t('price.withDriverInterCity'),
          amount: listing.withDriverInterCityPrice,
          unit: t('price.perDay'),
        });
      }
      if (listing.withDriverOneWayPrice) {
        rows.push({
          key: 'oneWay',
          label: t('price.withDriverOneWay'),
          amount: listing.withDriverOneWayPrice,
          unit: t('price.perDay'),
        });
      }
      return rows;
    }
    const rows: UnitRow[] = [];
    if (listing.weekdayPrice) {
      rows.push({
        key: 'weekday',
        label: t('price.weekday'),
        amount:
          (promoPercent > 0 ? applyDiscountPercent(listing.weekdayPrice, promoPercent) : null) ??
          listing.weekdayPrice,
        strikeAmount: promoPercent > 0 ? listing.weekdayPrice : undefined,
        unit: t('price.perDay'),
      });
    }
    if (listing.weekendPrice) {
      rows.push({
        key: 'weekend',
        label: t('price.weekend'),
        amount:
          (promoPercent > 0 ? applyDiscountPercent(listing.weekendPrice, promoPercent) : null) ??
          listing.weekendPrice,
        strikeAmount: promoPercent > 0 ? listing.weekendPrice : undefined,
        unit: t('price.perDay'),
      });
    }
    if (listing.hourlyPrice) {
      rows.push({
        key: 'hourly',
        label: t('price.hourly'),
        amount: listing.hourlyPrice,
        unit: t('price.perHour'),
      });
    }
    return rows;
  }

  /** Nút MỞ, nằm cuối dòng tổng — nhãn nói việc sắp xảy ra, không phải trạng thái hiện tại. */
  function expandButton() {
    return (
      <button
        type="button"
        className={styles.toggle}
        aria-expanded={false}
        onClick={() => onExpandedChange?.(true)}
      >
        {t('price.expand')} <DownOutlined aria-hidden />
      </button>
    );
  }

  /** Nút THU, trải hết bề ngang dưới bảng — đóng lại thì dòng tổng dính đáy trở về. */
  function collapseButton() {
    return (
      <button
        type="button"
        className={styles.toggleWide}
        aria-expanded
        onClick={() => onExpandedChange?.(false)}
      >
        {t('price.collapse')} <UpOutlined aria-hidden />
      </button>
    );
  }

  /*
   * Có gì để mở ra không. Xe chưa niêm yết giá cho dịch vụ đang chọn mà báo giá cũng chưa có
   * thì "Chi tiết" sẽ mở ra một khoảng trống — lúc đó chỉ còn dòng "Liên hệ báo giá" dính đáy,
   * bất kể luồng đang đặt trạng thái mở hay thu (bước Xác nhận mở sẵn).
   */
  const hasExpandable = (hasSelection && (quoteLoading || breakdown != null)) || headline != null;
  /*
   * Hai hình thái loại trừ nhau: mở thì dòng tổng rút đi, thu thì bảng rút đi. Không bao giờ
   * có hai chỗ cùng nói một con số.
   */
  const showDetail = expanded && hasExpandable;
  if (isDetail !== showDetail) return null;

  /* ── Đang chờ báo giá: giữ nguyên chỗ đang đứng, chỉ thay bằng skeleton ─────────────────── */
  if (hasSelection && quoteLoading) {
    return isDetail ? (
      <div className={styles.detailLoading} aria-busy="true">
        <Skeleton active title={{ width: '45%' }} paragraph={{ rows: 4 }} />
      </div>
    ) : (
      <div className={styles.bar} aria-busy="true">
        <Skeleton active title={false} paragraph={{ rows: 1, width: '60%' }} />
      </div>
    );
  }

  /* ── Đã có báo giá ─────────────────────────────────────────────────────────────────────── */
  if (hasSelection && breakdown) {
    if (!isDetail) {
      return (
        <div className={styles.bar}>
          <span className={styles.barLabel}>{totalLabel}</span>
          <b className={styles.barAmount}>{fmt.money(breakdown.totalAmount)}</b>
          {expandButton()}
        </div>
      );
    }
    return (
      <div className={styles.detail}>
        <PriceBreakdown
          rows={breakdown.rows}
          totalAmount={breakdown.totalAmount}
          totalLabel={totalLabel}
          depositAmount={breakdown.depositAmount}
          title={
            longTerm
              ? t('price.packageTitle', { months: longTerm.packageMonths })
              : t('price.detailTitle')
          }
          footer={
            <>
              {/*
                "Tiết kiệm" ở đây CHỈ nói về ưu đãi cam kết thời hạn — tuyệt đối không so với
                giá thuê theo ngày, vì đó là dịch vụ khác và so như vậy là bịa khuyến mãi
                (ADR 0011).
              */}
              {longTerm?.durationDiscountPercent ? (
                <strong className={styles.savings}>
                  {t('price.savings', {
                    amount: fmt.money(longTerm.durationDiscountAmount),
                    months: longTerm.packageMonths,
                  })}
                </strong>
              ) : null}
              <span className={styles.note}>
                {breakdown.estimateNote ? `${breakdown.estimateNote}. ` : ''}
                {isDelivery ? `${t('price.deliveryNote')} ` : ''}
                {t('price.finalNote')}
              </span>
            </>
          }
        />
        {collapseButton()}
      </div>
    );
  }

  /* ── Chưa chọn đủ: bảng giá NIÊM YẾT của đúng dịch vụ đang chọn ─────────────────────────── */
  const hint = isLongTerm ? t('price.choosePackage') : t('price.chooseTime');

  // Xe chưa niêm yết giá cho dịch vụ này — nói thẳng, không dựng một khối rỗng.
  if (!headline) {
    return (
      <div className={styles.bar}>
        <span className={styles.barLabel}>{t('price.onRequest')}</span>
      </div>
    );
  }

  if (!isDetail) {
    return (
      <div className={styles.bar}>
        <span className={styles.barLead}>
          <b className={styles.barAmount}>
            {t('price.fromUnit', { price: fmt.money(headline.amount) })}
          </b>
          <span className={styles.barUnit}>{headline.unit}</span>
          {promoPercent > 0 ? <DiscountTag percent={promoPercent} size="sm" /> : null}
        </span>
        <span className={styles.barHint}>{hint}</span>
        {expandButton()}
      </div>
    );
  }

  const unitTitle = t('price.unitTitle', { service: dl('serviceType', serviceType) });
  return (
    <div className={styles.detail}>
      <section className={styles.unitCard} aria-label={unitTitle}>
        <header className={styles.unitHead}>
          <h3 className={styles.unitTitle}>{unitTitle}</h3>
          {promoPercent > 0 ? <DiscountTag percent={promoPercent} /> : null}
        </header>
        <dl className={styles.unitRows}>
          {unitRows.map((row) => (
            <div key={row.key} className={styles.unitRow}>
              <dt>{row.label}</dt>
              <dd>
                {row.strikeAmount ? (
                  <s className={styles.strike}>{fmt.money(row.strikeAmount)}</s>
                ) : null}
                <b className={styles.unitAmount}>{fmt.money(row.amount)}</b>
                <span className={styles.unit}>{row.unit}</span>
              </dd>
            </div>
          ))}
        </dl>
        <p className={cx(styles.note, styles.unitNote)}>
          {isWithDriver ? `${dl('routeType', routeType)} — ${hint}.` : `${hint}.`}{' '}
          {t('price.finalNote')}
        </p>
      </section>
      {collapseButton()}
    </div>
  );
}
