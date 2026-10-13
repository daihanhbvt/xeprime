'use client';

import { CheckCircleFilled, DownOutlined, QrcodeOutlined, WalletOutlined } from '@ant-design/icons';
import { Alert, Button, Radio, Tag } from 'antd';
import Image from 'next/image';
import { useLocale, useTranslations } from 'next-intl';
import { useState, type ReactNode } from 'react';
import type { PaymentGatewayProvider } from '@xeprime/types';
import { useAppFormat } from '@/i18n/use-app-format';
import { useDomainLabel } from '@/i18n/use-domain-label';
import { useErrorMessage } from '@/i18n/use-error-message';
import { cx } from '@/lib/cx';
import { useGatewayCheckout } from '../hooks';
import { paymentProviderLogo } from '../provider-logos';
import type { GatewayTarget } from '../types';
import { BankTransferDetails, type TransferAccount } from './BankTransferDetails';
import styles from './CheckoutPanel.module.css';

/** Nhóm phương thức đang mở trong danh sách. */
const METHOD_GROUP = {
  TRANSFER: 'transfer',
  WALLET: 'wallet',
} as const;

type MethodGroup = (typeof METHOD_GROUP)[keyof typeof METHOD_GROUP];

/**
 * THÂN TRANG THANH TOÁN — dùng chung cho tiền giữ chỗ (site khách) và hoá đơn gói (site partner).
 *
 * Hai cột như mọi trang thanh toán người dùng đã quen: bên trái CHỌN CÁCH TRẢ, bên phải TRẢ CÁI GÌ
 * (thẻ tóm tắt dính theo khi cuộn, mang số tiền, mã và nút hành động). Trên điện thoại hai cột xếp
 * chồng, thẻ tóm tắt xuống dưới danh sách — nút hành động vẫn ngay dưới lựa chọn vừa bấm.
 *
 * Hai nhóm phương thức:
 *  - **Chuyển khoản nhanh (VietQR)** — mở sẵn: đây là kênh không phí, đối soát tự động qua SePay
 *    (ADR 0022), và là kênh DUY NHẤT luôn có;
 *  - **Ví điện tử** — MoMo/VNPAY qua cổng (ADR 0058). Chỉ hiện khi server nói có kênh đang mở cho
 *    luồng này; chưa cấu hình thì nhóm này không tồn tại, không phải một nút xám "sắp có".
 *
 * KHÔNG có gì ở đây kết luận "đã thanh toán", và KHÔNG có nút tự khai "Tôi đã chuyển khoản". Chuyển
 * khoản do webhook đối soát xác nhận; cổng do IPN hoặc truy vấn phía server. Trang gọi biết khoản đã
 * xong khi dữ liệu của chính khoản đó đổi — thông báo đẩy qua bản chiếu realtime làm mới nó ngay, nên
 * người vừa trả thấy màn đổi mà không phải bấm gì. Giao dịch hỏng là hỏng: trang nói đúng điều đó,
 * không có một nút nào để "báo" thay cho tiền.
 */
export function CheckoutPanel({
  target,
  amount,
  code,
  account,
  deadline,
  gatewayEnabled = true,
  amountLabel,
  details,
  countdown,
  alert,
  notes,
}: {
  target: GatewayTarget;
  /** Số còn phải trả (VND, chuỗi) — QR và cổng cùng nói số này. */
  amount: string;
  /** Mã đối soát của khoản — nội dung chuyển khoản, và mã khách đọc cho hỗ trợ. */
  code: string;
  /** Tài khoản nhận của nền tảng — `undefined` khi đang tải. */
  account: TransferAccount | null | undefined;
  /** Hạn của khoản — còn quá ít thì không mời mở phiên cổng (chỉ tiền giữ chỗ có). */
  deadline?: string | null;
  /**
   * `false` khi khoản đang có một lượt cổng còn dùng được hoặc đang ghi nhận (vừa quay về từ cổng)
   * — mở thêm một lượt lúc đó là mời khách trả HAI lần.
   */
  gatewayEnabled?: boolean;
  /** Nhãn của số tiền lớn trên thẻ tóm tắt ("Tiền giữ chỗ", "Số tiền cần thanh toán"…). */
  amountLabel: string;
  /** Phần đầu thẻ tóm tắt — đang trả cho CÁI GÌ (chuyến, gói). */
  details: ReactNode;
  /** Đồng hồ hạn thanh toán, ngay dưới số tiền. */
  countdown?: ReactNode;
  /** Thông báo bất thường của khoản (đã nhận một phần…) — đứng trên danh sách phương thức. */
  alert?: ReactNode;
  /** Điều kiện của khoản (hạn, huỷ miễn phí…) — cuối thẻ tóm tắt. */
  notes?: ReactNode;
}) {
  const t = useTranslations('PaymentGateway.checkout');
  const locale = useLocale() === 'en' ? 'en' : 'vi';
  const fmt = useAppFormat();
  const domainLabel = useDomainLabel();
  const errorMessage = useErrorMessage();
  const gateway = useGatewayCheckout(target, { amount, deadline, enabled: gatewayEnabled });

  const [group, setGroup] = useState<MethodGroup | null>(METHOD_GROUP.TRANSFER);
  const [provider, setProvider] = useState<PaymentGatewayProvider | null>(null);

  const hasWallets = gateway.methods.length > 0;
  /*
   * Nhóm ví biến mất giữa chừng (hạn giữ chỗ trôi qua mốc tối thiểu, hay trang vừa nhận lượt cổng
   * đang ghi nhận) ⇒ lựa chọn trong nhóm đó cũng mất theo. Không suy ra từ state cũ.
   */
  const activeGroup = group === METHOD_GROUP.WALLET && !hasWallets ? null : group;
  const chosen = gateway.methods.find((entry) => entry.method.provider === provider) ?? null;
  const providerLabel = (value: string) => domainLabel('paymentGatewayProvider', value);

  function toggle(next: MethodGroup) {
    setGroup((current) => (current === next ? null : next));
  }

  function renderAction() {
    if (activeGroup === METHOD_GROUP.WALLET) {
      if (gateway.windowTooShort) return null;
      return (
        <>
          <Button
            type="primary"
            size="large"
            block
            loading={gateway.busy}
            disabled={!chosen || chosen.outOfRange}
            onClick={() => {
              if (chosen) gateway.pay(chosen.method.provider as PaymentGatewayProvider);
            }}
          >
            {chosen ? t('pay.withProvider', { provider: providerLabel(chosen.method.provider) }) : t('pay.submit')}
          </Button>
          {chosen ? null : <p className={styles.actionHint}>{t('pay.pickWallet')}</p>}
          {gateway.error ? (
            <Alert type="error" showIcon title={errorMessage(gateway.error)} />
          ) : null}
          {gateway.missingLink ? (
            <Alert type="error" showIcon title={t('wallet.missingLink')} />
          ) : null}
        </>
      );
    }

    // Chuyển khoản không có nút: quét QR là trả, và webhook đối soát tự xác nhận khi tiền về.
    if (activeGroup === METHOD_GROUP.TRANSFER) {
      return <p className={styles.actionHint}>{t('pay.transferAuto')}</p>;
    }

    return <p className={styles.actionHint}>{t('pay.pickMethod')}</p>;
  }

  return (
    <div className={styles.layout}>
      <section className={styles.methods} aria-labelledby="xp-checkout-methods">
        <h2 id="xp-checkout-methods" className={styles.sectionTitle}>
          {t('methodsTitle')}
        </h2>

        {alert}

        <div className={cx(styles.method, activeGroup === METHOD_GROUP.TRANSFER && styles.methodOpen)}>
          <button
            type="button"
            className={styles.methodHead}
            aria-expanded={activeGroup === METHOD_GROUP.TRANSFER}
            aria-controls="xp-checkout-transfer"
            onClick={() => toggle(METHOD_GROUP.TRANSFER)}
          >
            <QrcodeOutlined className={styles.methodIcon} aria-hidden />
            <span className={styles.methodTitle}>{t('transfer.title')}</span>
            <Tag color="success" className={styles.methodTag}>
              {t('transfer.badge')}
            </Tag>
            <DownOutlined className={styles.chevron} aria-hidden />
          </button>
          {activeGroup === METHOD_GROUP.TRANSFER ? (
            <div id="xp-checkout-transfer" className={styles.methodBody}>
              <p className={styles.methodHint}>{t('transfer.hint')}</p>
              <BankTransferDetails account={account} amount={amount} code={code} />
            </div>
          ) : null}
        </div>

        {hasWallets ? (
          <div className={cx(styles.method, activeGroup === METHOD_GROUP.WALLET && styles.methodOpen)}>
            <button
              type="button"
              className={styles.methodHead}
              aria-expanded={activeGroup === METHOD_GROUP.WALLET}
              aria-controls="xp-checkout-wallet"
              onClick={() => toggle(METHOD_GROUP.WALLET)}
            >
              <WalletOutlined className={styles.methodIcon} aria-hidden />
              <span className={styles.methodTitle}>{t('wallet.title')}</span>
              {gateway.sandbox ? (
                <Tag color="orange" className={styles.methodTag}>
                  {t('wallet.sandbox')}
                </Tag>
              ) : null}
              <DownOutlined className={styles.chevron} aria-hidden />
            </button>
            {activeGroup === METHOD_GROUP.WALLET ? (
              <div id="xp-checkout-wallet" className={styles.methodBody}>
                {gateway.windowTooShort ? (
                  <Alert type="warning" showIcon title={t('wallet.windowTooShort')} />
                ) : (
                  <Radio.Group
                    className={styles.wallets}
                    value={provider}
                    onChange={(event) => setProvider(event.target.value as PaymentGatewayProvider)}
                    aria-label={t('wallet.title')}
                    disabled={gateway.busy}
                  >
                    {gateway.methods.map(({ method, outOfRange }) => (
                      <Radio
                        key={method.provider}
                        value={method.provider}
                        className={cx(
                          styles.wallet,
                          provider === method.provider && styles.walletChecked,
                        )}
                      >
                        <WalletLogo provider={method.provider} locale={locale} />
                        <span className={styles.walletName}>{providerLabel(method.provider)}</span>
                        {outOfRange ? (
                          <span className={styles.walletLimit}>
                            {t('wallet.outOfRange', {
                              provider: providerLabel(method.provider),
                              min: method.minAmount ? fmt.money(method.minAmount) : '—',
                              max: method.maxAmount ? fmt.money(method.maxAmount) : '—',
                            })}
                          </span>
                        ) : null}
                      </Radio>
                    ))}
                  </Radio.Group>
                )}
                <p className={styles.methodHint}>
                  {t('wallet.redirectNote')}
                  {gateway.sandbox ? ` ${t('wallet.sandboxHint')}` : ''}
                </p>
              </div>
            ) : null}
          </div>
        ) : null}
      </section>

      <aside className={styles.summary} aria-labelledby="xp-checkout-summary">
        <div className={styles.card}>
          <h2 id="xp-checkout-summary" className={styles.sectionTitle}>
            {t('summary.title')}
          </h2>

          {details}

          <dl className={styles.codeRow}>
            <dt>{t('summary.code')}</dt>
            <dd>{code}</dd>
          </dl>

          <div className={styles.total}>
            <span className={styles.totalLabel}>{amountLabel}</span>
            <span className={styles.totalAmount}>{fmt.money(amount)}</span>
          </div>
          {countdown}

          <div className={styles.action} aria-live="polite">
            {renderAction()}
          </div>

          {notes}

          <p className={styles.safety}>
            <CheckCircleFilled className={styles.safetyIcon} aria-hidden />
            {t('summary.safety')}
          </p>
        </div>
      </aside>
    </div>
  );
}

/**
 * Logo CHÍNH THỨC của một ví (`provider-logos.ts`) — trang trí, `alt` rỗng: tên ví đứng ngay bên
 * cạnh và là nhãn của ô chọn, nên trình đọc màn hình không phải đọc tên hai lần.
 *
 * Giữ đúng tỉ lệ file gốc (chỉ đặt CHIỀU CAO, bề ngang tự theo) — kéo méo logo là vi phạm hướng dẫn
 * thương hiệu của cả hai bên. SVG đi thẳng, không qua bộ tối ưu ảnh của Next.
 */
function WalletLogo({ provider, locale }: { provider: string; locale: 'vi' | 'en' }) {
  const logo = paymentProviderLogo(provider, locale);
  if (!logo) return null;
  return (
    <Image
      src={logo.src}
      width={logo.width}
      height={logo.height}
      alt=""
      aria-hidden
      className={styles.walletLogo}
      unoptimized={logo.src.endsWith('.svg')}
    />
  );
}
