'use client';

/* eslint-disable @next/next/no-img-element -- ảnh QR sinh động theo số tiền + mã và ảnh xe từ
 * storage ngoài; kích thước cố định nên không gây layout shift, `next/image` cần khai domain. */

import {
  DownOutlined,
  SafetyCertificateOutlined,
  ScanOutlined,
  UpOutlined,
  WalletOutlined,
} from '@ant-design/icons';
import { Alert, Tag } from 'antd';
import Image from 'next/image';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useId, useState, type ReactNode } from 'react';
import { LIST_SEPARATOR } from '@xeprime/domain';
import {
  BOOKING_HOLD_STATUS,
  HOLD_COUNTDOWN_SEGMENT_MINUTES,
  HOLD_COUNTDOWN_URGENT_MINUTES,
  PAYMENT_GATEWAY_PROVIDER,
  PAYMENT_RETURN_PARAM,
  SERVICE_TYPE,
  type PaymentGatewayProvider,
} from '@xeprime/types';
import { Countdown } from '@/components/data-display/Countdown';
import { useListingSpecSummary } from '@/features/booking-requests/hooks/use-listing-spec-summary';
import { CtaButton } from '@/features/marketplace/components/CtaButton';
import { BankTransferDetails } from '@/features/payment-gateway/components/BankTransferDetails';
import { TripGatewayReturn } from '@/features/payment-gateway/components/TripGatewayReturn';
import {
  canStartAnotherCheckout,
  useGatewayCheckout,
  useGatewayOrder,
} from '@/features/payment-gateway/hooks';
import { paymentProviderMark } from '@/features/payment-gateway/provider-logos';
import { PAYMENT_SURFACE } from '@/features/payment-gateway/types';
import { useAppFormat } from '@/i18n/use-app-format';
import { useDomainLabel } from '@/i18n/use-domain-label';
import { useErrorMessage } from '@/i18n/use-error-message';
import { cx } from '@/lib/cx';
import { payAtPickupAmount } from '@/lib/customer-price-view';
import { dayjs } from '@/lib/datetime';
import type { CustomerTripDetail } from '../types';
import { useFreeCancelNote } from '../use-free-cancel-note';
import { TripColumns } from './TripRequestLayout';
import styles from './TripPaymentCheckout.module.css';

type Hold = NonNullable<CustomerTripDetail['hold']>;

/** Nhóm phương thức đang mở — chỉ một nhóm mở một lúc, như bản vẽ. */
const METHOD_GROUP = {
  TRANSFER: 'transfer',
  WALLET: 'wallet',
} as const;

type MethodGroup = (typeof METHOD_GROUP)[keyof typeof METHOD_GROUP];

const SEGMENT_MS = HOLD_COUNTDOWN_SEGMENT_MINUTES * 60_000;
const URGENT_MS = HOLD_COUNTDOWN_URGENT_MINUTES * 60_000;

/** Khẩu hiệu dưới tên ví (Figma `19759:37942` · `19759:37946`) — bảng tra literal để khoá có kiểu. */
const WALLET_TAGLINE_KEY = {
  [PAYMENT_GATEWAY_PROVIDER.MOMO]: 'methods.wallet.taglineMomo',
  [PAYMENT_GATEWAY_PROVIDER.VNPAY]: 'methods.wallet.taglineVnpay',
} as const satisfies Record<PaymentGatewayProvider, string>;

/**
 * Hai cột của TRANG THANH TOÁN tiền giữ chỗ — Figma `19759:22346` (chuyển khoản VietQR) và
 * `19759:37582` (ví điện tử):
 *
 *  - TRÁI "Chọn phương thức thanh toán": hai thẻ gập/mở — CHỈ một thẻ mở một lúc. VietQR luôn có và
 *    mở sẵn (kênh không phí, đối soát tự động — ADR 0022). Ví điện tử chỉ tồn tại khi server báo có
 *    cổng đang mở cho luồng này (ADR 0058 còn Proposed, mặc định tắt) — không có thì thẻ đó không
 *    vẽ, chứ không phải một nút xám "sắp có".
 *  - PHẢI "Thông tin thanh toán": xe · mốc nhận/trả · tổng bạn trả · phần trả chủ xe · số tiền giữ
 *    chỗ + đồng hồ · (nút trả qua ví khi thẻ ví đang mở) · lưu ý.
 *
 * KHÔNG có gì ở đây kết luận "đã thanh toán", KHÔNG có nút "Tôi đã chuyển khoản". Chuyển khoản do
 * webhook đối soát xác nhận, cổng do IPN/truy vấn phía server; chuyến đổi chặng khi chính khoản giữ
 * chỗ đổi — trang gọi (`TripPaymentView`) tự sang hộp "Thanh toán thành công".
 */
export function TripPaymentCheckout({
  trip,
  hold,
  header,
}: {
  trip: CustomerTripDetail;
  hold: Hold;
  /** `TripPageHeader` của trang. */
  header: ReactNode;
}) {
  const t = useTranslations('Trips.payment');
  const tCheckout = useTranslations('PaymentGateway.checkout');
  const tHold = useTranslations('Trips.hold');
  const fmt = useAppFormat();
  const dl = useDomainLabel();
  const errorMessage = useErrorMessage();
  const methodsTitleId = useId();

  /*
   * Vừa quay về từ cổng với một lượt còn dùng được / đang ghi nhận ⇒ KHÔNG mời mở phiên mới (xem
   * `canStartAnotherCheckout`). Đọc cùng khoá cache với `TripGatewayReturn` — không request thứ hai.
   */
  const params = useSearchParams();
  const orderId = params?.get(PAYMENT_RETURN_PARAM.TRIP_ORDER) ?? null;
  const order = useGatewayOrder(PAYMENT_SURFACE.CUSTOMER, orderId);
  const gatewayEnabled =
    !orderId || canStartAnotherCheckout(order.data, { failedToLoad: order.isError });
  const gateway = useGatewayCheckout(
    { kind: 'trip', tripId: trip.id },
    { amount: hold.remainingAmount, deadline: hold.expiresAt, enabled: gatewayEnabled },
  );

  const [group, setGroup] = useState<MethodGroup | null>(METHOD_GROUP.TRANSFER);
  const [provider, setProvider] = useState<PaymentGatewayProvider | null>(null);

  const hasWallets = gateway.methods.length > 0;
  /*
   * Nhóm ví biến mất giữa chừng (hạn giữ chỗ trôi qua mốc tối thiểu, hay trang vừa nhận lượt cổng
   * đang ghi nhận) ⇒ quay về VietQR — lúc đó chuyển khoản là kênh DUY NHẤT còn lại, không được để
   * cả hai thẻ cùng gập. Không suy ra từ state cũ.
   */
  const activeGroup = group === METHOD_GROUP.WALLET && !hasWallets ? METHOD_GROUP.TRANSFER : group;
  const chosen = gateway.methods.find((entry) => entry.method.provider === provider) ?? null;
  const providerLabel = (value: string) => dl('paymentGatewayProvider', value);

  const underpaid = hold.status === BOOKING_HOLD_STATUS.UNDERPAID;
  const fees = trip.estimate?.fees ?? null;
  /*
   * Huỷ miễn phí tới khi nào — hoặc KHÔNG có (đặt gấp) — và huỷ muộn thì mất gì: báo TRƯỚC khi trả
   * (ADR 0032 điều 5 · ADR 0064).
   */
  const freeCancelNote = useFreeCancelNote()(hold);

  function toggle(next: MethodGroup) {
    setGroup((current) => (current === next ? null : next));
  }

  const main = (
    <>
      {/*
        Quay về từ MoMo/VNPAY: trạng thái lượt thanh toán, hỏi từ server — đứng TRÊN mọi thứ vì đó là
        câu trả lời người vừa quay về đang tìm.
      */}
      <TripGatewayReturn tripId={trip.id} />

      <section className={styles.methods} aria-labelledby={methodsTitleId}>
        <h2 id={methodsTitleId} className={styles.methodsTitle}>
          {tCheckout('methodsTitle')}
        </h2>

        {underpaid ? (
          <Alert
            type="warning"
            showIcon
            title={tHold('partialIntro', { paid: fmt.money(hold.paidAmount) })}
          />
        ) : null}

        <MethodPanel
          icon={<ScanOutlined />}
          title={tCheckout('transfer.title')}
          open={activeGroup === METHOD_GROUP.TRANSFER}
          onToggle={() => toggle(METHOD_GROUP.TRANSFER)}
        >
          <p className={styles.methodHint}>
            {t.rich('methods.transferHint', { b: (chunks) => <b>{chunks}</b> })}
          </p>
          {/* Một bản cho mọi khoản tiền vào nền tảng — nội dung chuyển khoản là khoá đối soát (ADR 0022). */}
          <BankTransferDetails
            account={hold.paymentInfo}
            amount={hold.remainingAmount}
            code={hold.code}
            layout="card"
          />
        </MethodPanel>

        {hasWallets ? (
          <MethodPanel
            icon={<WalletOutlined />}
            title={tCheckout('wallet.title')}
            badge={
              gateway.sandbox ? (
                <Tag color="orange" className={styles.methodTag}>
                  {tCheckout('wallet.sandbox')}
                </Tag>
              ) : null
            }
            open={activeGroup === METHOD_GROUP.WALLET}
            onToggle={() => toggle(METHOD_GROUP.WALLET)}
          >
            {gateway.windowTooShort ? (
              <Alert type="warning" showIcon title={tCheckout('wallet.windowTooShort')} />
            ) : (
              <div
                className={styles.wallets}
                role="radiogroup"
                aria-label={tCheckout('wallet.title')}
              >
                {gateway.methods.map(({ method, outOfRange }) => {
                  const value = method.provider as PaymentGatewayProvider;
                  const checked = provider === value;
                  const logo = paymentProviderMark(value);
                  const taglineKey = WALLET_TAGLINE_KEY[value];
                  return (
                    <label
                      key={value}
                      className={cx(
                        styles.wallet,
                        checked && styles.walletChecked,
                        gateway.busy && styles.walletDisabled,
                      )}
                    >
                      <input
                        type="radio"
                        name={`xp-wallet-${trip.id}`}
                        value={value}
                        checked={checked}
                        disabled={gateway.busy}
                        onChange={() => setProvider(value)}
                        className={styles.walletRadio}
                      />
                      {logo ? (
                        <span className={styles.walletLogo} aria-hidden>
                          {/*
                            Biểu tượng vuông của cổng (`provider-logos.ts`) giữ đúng tỉ lệ file gốc
                            trong ô 56 — kéo méo logo là vi phạm hướng dẫn thương hiệu.
                          */}
                          <Image
                            src={logo.src}
                            width={logo.width}
                            height={logo.height}
                            alt=""
                            unoptimized={logo.src.endsWith('.svg')}
                          />
                        </span>
                      ) : null}
                      <span className={styles.walletText}>
                        <span className={styles.walletName}>{providerLabel(value)}</span>
                        <span className={styles.walletTagline}>
                          {taglineKey ? t(taglineKey) : null}
                        </span>
                        {outOfRange ? (
                          <span className={styles.walletLimit}>
                            {tCheckout('wallet.outOfRange', {
                              provider: providerLabel(value),
                              min: method.minAmount ? fmt.money(method.minAmount) : '—',
                              max: method.maxAmount ? fmt.money(method.maxAmount) : '—',
                            })}
                          </span>
                        ) : null}
                      </span>
                    </label>
                  );
                })}
              </div>
            )}
            <p className={styles.methodHint}>
              {tCheckout('wallet.redirectNote')}
              {gateway.sandbox ? ` ${tCheckout('wallet.sandboxHint')}` : ''}
            </p>
          </MethodPanel>
        ) : null}
      </section>
    </>
  );

  const aside = (
    <PaymentSummaryCard
      trip={trip}
      hold={hold}
      customerTotal={fees?.customerTotalAmount ?? null}
      payOwner={payAtPickupAmount(fees)}
      amountLabel={underpaid ? t('summary.remainingLabel') : t('summary.amountLabel')}
      action={
        activeGroup === METHOD_GROUP.WALLET && hasWallets && !gateway.windowTooShort ? (
          <div className={styles.action} aria-live="polite">
            <CtaButton
              size="form"
              block
              loading={gateway.busy}
              disabled={!chosen || chosen.outOfRange}
              onClick={() => {
                if (chosen) gateway.pay(chosen.method.provider as PaymentGatewayProvider);
              }}
            >
              {chosen
                ? tCheckout('pay.withProvider', { provider: providerLabel(chosen.method.provider) })
                : tCheckout('pay.submit')}
            </CtaButton>
            {chosen ? null : <p className={styles.actionHint}>{tCheckout('pay.pickWallet')}</p>}
            {gateway.error ? (
              <Alert type="error" showIcon title={errorMessage(gateway.error)} />
            ) : null}
            {gateway.missingLink ? (
              <Alert type="error" showIcon title={tCheckout('wallet.missingLink')} />
            ) : null}
          </div>
        ) : null
      }
      freeCancelNote={freeCancelNote}
    />
  );

  return <TripColumns header={header} main={main} aside={aside} />;
}

/**
 * Một thẻ phương thức gập/mở (Figma "Information card" `19759:22684` · `19759:37348`): mở thì nền
 * `BG/gray-25` + viền `Stroke/primary-300` và icon vàng, gập thì nền trắng viền xám.
 */
function MethodPanel({
  icon,
  title,
  badge,
  open,
  onToggle,
  children,
}: {
  icon: ReactNode;
  title: string;
  badge?: ReactNode;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  const bodyId = useId();
  return (
    <div className={cx(styles.method, open && styles.methodOpen)}>
      <button
        type="button"
        className={styles.methodHead}
        aria-expanded={open}
        aria-controls={bodyId}
        onClick={onToggle}
      >
        <span className={styles.methodIcon} aria-hidden>
          {icon}
        </span>
        <span className={styles.methodTitle}>{title}</span>
        {badge}
        <span className={styles.chevron} aria-hidden>
          {open ? <UpOutlined /> : <DownOutlined />}
        </span>
      </button>
      {open ? (
        <div id={bodyId} className={styles.methodBody}>
          {children}
        </div>
      ) : null}
    </div>
  );
}

/**
 * "Thông tin thanh toán" — Figma `19759:22461` / `19759:37642`. Trả lời theo thứ tự khách cần: trả
 * cho chuyến nào, tổng chuyến bao nhiêu và phần nào trả tay chủ xe, khoản phải trả NGAY bây giờ và
 * trước khi nào, rồi những điều kiện của nó.
 *
 * Mọi con số do server tính sẵn (bảng kê đóng băng trên khoản giữ chỗ — ADR 0039); thẻ không cộng
 * trừ gì.
 */
function PaymentSummaryCard({
  trip,
  hold,
  customerTotal,
  payOwner,
  amountLabel,
  action,
  freeCancelNote,
}: {
  trip: CustomerTripDetail;
  hold: Hold;
  customerTotal: string | null;
  /** B − D — phần trả TRỰC TIẾP chủ xe lúc nhận xe; `null` khi chuyến không kèm bảng kê. */
  payOwner: string | null;
  amountLabel: string;
  /** Nút trả qua ví — chỉ khi thẻ ví đang mở. */
  action: ReactNode;
  /** Câu huỷ miễn phí + huỷ muộn — `useFreeCancelNote`. */
  freeCancelNote: string;
}) {
  const t = useTranslations('Trips.payment');
  const tCheckout = useTranslations('PaymentGateway.checkout');
  const tHold = useTranslations('Trips.hold');
  const fmt = useAppFormat();
  const titleId = useId();
  const specs = useListingSpecSummary(trip.vehicle);
  const isLongTerm = trip.serviceType === SERVICE_TYPE.LONG_TERM;

  /** "Thứ Tư, 14/10/2026 08:00" — thứ + mốc đầy đủ, như bản vẽ. */
  const point = (iso: string) =>
    t('summary.point', { weekday: fmt.weekdayLong(dayjs(iso)), dateTime: fmt.dateTime(iso) });

  return (
    <section className={styles.summary} aria-labelledby={titleId}>
      <h2 id={titleId} className={styles.summaryTitle}>
        {tCheckout('summary.title')}
      </h2>

      <div className={styles.vehicle}>
        {trip.vehicle.imageUrl ? (
          <img className={styles.vehicleImage} src={trip.vehicle.imageUrl} alt="" loading="lazy" />
        ) : (
          <span className={styles.vehicleImage} aria-hidden />
        )}
        <span className={styles.vehicleText}>
          <span className={styles.vehicleName}>{trip.vehicle.name}</span>
          {specs.length > 0 ? (
            <span className={styles.vehicleSpecs}>{specs.join(LIST_SEPARATOR)}</span>
          ) : null}
        </span>
      </div>

      <div className={styles.divider} role="presentation" />

      <dl className={styles.rows}>
        {trip.pickupAt && trip.returnAt ? (
          <>
            <div className={styles.row}>
              <dt>{t('summary.pickupAt')}</dt>
              <dd>{point(trip.pickupAt)}</dd>
            </div>
            <div className={styles.row}>
              <dt>{t('summary.returnAt')}</dt>
              <dd>{point(trip.returnAt)}</dd>
            </div>
          </>
        ) : isLongTerm ? (
          /*
           * Dài hạn còn chờ chốt lịch thì không có mốc nhận/trả nào (ADR 0011) — kể gói và nguyện
           * vọng, đừng in "Invalid Date".
           */
          <>
            <div className={styles.row}>
              <dt>{t('summary.package')}</dt>
              <dd>{fmt.packageLabel(trip.longTermPackageMonths) ?? '—'}</dd>
            </div>
            <div className={styles.row}>
              <dt>{t('summary.pickupWish')}</dt>
              <dd>{fmt.pickupWish(trip)}</dd>
            </div>
          </>
        ) : null}
        {customerTotal ? (
          <div className={styles.row}>
            <dt>{t('summary.customerTotal')}</dt>
            <dd>{fmt.money(customerTotal)}</dd>
          </div>
        ) : null}
        {payOwner ? (
          <div className={styles.rowGroup}>
            <div className={styles.row}>
              <dt>{t('summary.payOwner')}</dt>
              <dd className={styles.payOwner}>{fmt.money(payOwner)}</dd>
            </div>
            <p className={styles.rowNote}>{t('summary.payOwnerNote')}</p>
          </div>
        ) : null}
      </dl>

      <div className={styles.divider} role="presentation" />

      <div className={styles.total}>
        <span className={styles.totalLabel}>{amountLabel}</span>
        <strong className={styles.totalAmount}>{fmt.money(hold.remainingAmount)}</strong>
        <Countdown
          deadline={hold.expiresAt}
          urgentMs={URGENT_MS}
          segmentMs={SEGMENT_MS}
          className={styles.countdown}
          labels={{
            remaining: t('summary.countdown'),
            expired: tHold('countdownExpired'),
            segment: (index, total) => tHold('countdownSegment', { index, total }),
          }}
        />
      </div>

      {action}

      <div className={styles.notes}>
        <p>{t('summary.notes.auto')}</p>
        <ul className={styles.noteList}>
          <li>{t('summary.notes.expires')}</li>
          <li>{freeCancelNote}</li>
          {payOwner ? null : <li>{tHold('restAtHandover')}</li>}
        </ul>
        <p className={styles.safety}>
          <SafetyCertificateOutlined className={styles.safetyIcon} aria-hidden />
          <span>{t('summary.notes.safety')}</span>
        </p>
      </div>
    </section>
  );
}
