'use client';

import { Alert, Button, Tag } from 'antd';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { isNegativeMoney, subtractMoney } from '@xeprime/domain';
import {
  PAYMENT_GATEWAY_CLIENT,
  PAYMENT_GATEWAY_MIN_HOLD_WINDOW_MINUTES,
  PERMISSION,
} from '@xeprime/types';
import { useNow } from '@/hooks/use-now';
import { usePermissions } from '@/hooks/use-permissions';
import { useAppFormat } from '@/i18n/use-app-format';
import { useDomainLabel } from '@/i18n/use-domain-label';
import { useErrorMessage } from '@/i18n/use-error-message';
import { useGatewayMethods, useStartGatewayCheckout } from '../hooks';
import {
  PAYMENT_SURFACE,
  surfaceOf,
  type GatewayTarget,
  type PaymentGatewayMethod,
} from '../types';
import styles from './GatewayPayOptions.module.css';

/**
 * Lối thanh toán qua cổng MoMo / VNPAY — BỔ SUNG dưới khối chuyển khoản VietQR, không thay nó
 * (ADR 0058).
 *
 * Không vẽ gì khi chưa có phương thức nào mở (chưa cấu hình, luồng chưa bật, đang tải, hay lỗi đọc
 * cấu hình): chuyển khoản vẫn nằm ngay phía trên, và một nút sẽ hỏng là tệ hơn không có nút.
 *
 * Bấm ⇒ server mở phiên (số tiền và mã đọc từ DB) ⇒ trình duyệt chuyển sang trang của cổng. KHÔNG
 * có gì ở đây nói "đã thanh toán": kết quả về server qua IPN, và trang quay về hỏi server.
 */
export function GatewayPayOptions({
  target,
  amount,
  deadline,
}: {
  target: GatewayTarget;
  /** Số còn phải trả (VND, chuỗi) — chỉ để báo trước hạn mức của cổng; server mới là nơi quyết. */
  amount: string;
  /** Hạn của khoản (tiền giữ chỗ) — còn quá ít thì không mời mở phiên cổng. */
  deadline?: string | null;
}) {
  const t = useTranslations('PaymentGateway.options');
  const locale = useLocale() === 'en' ? 'en' : 'vi';
  const fmt = useAppFormat();
  const domainLabel = useDomainLabel();
  const errorMessage = useErrorMessage();
  const surface = surfaceOf(target);
  const { has } = usePermissions();
  // Trả hoá đơn gói là bước cuối của MUA gói — cùng quyền. Server gác lại bằng chính quyền đó.
  const allowed = surface === PAYMENT_SURFACE.CUSTOMER || has(PERMISSION.SUBSCRIPTION_PURCHASE);
  const methods = useGatewayMethods(surface, allowed);
  const start = useStartGatewayCheckout(target);
  const [chosen, setChosen] = useState<string | null>(null);
  /** Đã có liên kết và đang rời trang — giữ nút ở trạng thái quay cho tới khi trang đổi. */
  const [redirecting, setRedirecting] = useState(false);
  const [missingLink, setMissingLink] = useState(false);
  // Nhịp nửa phút: nút cổng ẩn kịp khi hạn giữ chỗ trôi qua mốc tối thiểu lúc khách còn ở trang.
  const now = useNow(30_000);

  const list = methods.data?.methods ?? [];
  if (!allowed || list.length === 0) return null;

  const sandbox = methods.data?.sandbox === true;
  const busy = start.isPending || redirecting;
  /*
   * So hai mốc: hạn của khoản (server lưu) với đồng hồ máy. Lệch đồng hồ chỉ làm nút hiện/ẩn sớm
   * hay muộn vài giây — server vẫn từ chối bằng `PAYMENT_HOLD_WINDOW_TOO_SHORT` theo đồng hồ của nó.
   */
  const windowTooShort =
    deadline != null &&
    new Date(deadline).getTime() - now < PAYMENT_GATEWAY_MIN_HOLD_WINDOW_MINUTES * 60_000;

  function outOfRange(method: PaymentGatewayMethod): boolean {
    return (
      (method.minAmount != null && isNegativeMoney(subtractMoney(amount, method.minAmount))) ||
      (method.maxAmount != null && isNegativeMoney(subtractMoney(method.maxAmount, amount)))
    );
  }

  function pay(provider: PaymentGatewayMethod['provider']) {
    // Bấm dồn khi đang mở phiên hoặc đang rời trang không mở thêm phiên nào.
    if (busy) return;
    setChosen(provider);
    setMissingLink(false);
    start.mutate(
      { provider, client: PAYMENT_GATEWAY_CLIENT.WEB, locale },
      {
        onSuccess: (order) => {
          if (!order.checkoutUrl) {
            setMissingLink(true);
            return;
          }
          setRedirecting(true);
          window.location.assign(order.checkoutUrl);
        },
      },
    );
  }

  return (
    <section className={styles.options} aria-label={t('title')}>
      <div className={styles.head}>
        <span className={styles.title}>{t('title')}</span>
        {sandbox ? <Tag color="orange">{t('sandbox')}</Tag> : null}
      </div>

      {windowTooShort ? (
        <p className={styles.note}>{t('windowTooShort')}</p>
      ) : (
        <div className={styles.methods}>
          {list.map((method) => {
            const label = domainLabel('paymentGatewayProvider', method.provider);
            const blocked = outOfRange(method);
            return (
              <div key={method.provider} className={styles.method}>
                <Button
                  block
                  size="large"
                  loading={busy && chosen === method.provider}
                  disabled={blocked || (busy && chosen !== method.provider)}
                  onClick={() => pay(method.provider)}
                >
                  {t('payWith', { provider: label })}
                </Button>
                {blocked ? (
                  <span className={styles.limit}>
                    {t('outOfRange', {
                      provider: label,
                      min: method.minAmount ? fmt.money(method.minAmount) : '—',
                      max: method.maxAmount ? fmt.money(method.maxAmount) : '—',
                    })}
                  </span>
                ) : null}
              </div>
            );
          })}
        </div>
      )}

      {start.isError ? <Alert type="error" showIcon title={errorMessage(start.error)} /> : null}
      {missingLink ? <Alert type="error" showIcon title={t('missingLink')} /> : null}

      <p className={styles.note}>
        {t('redirectNote')}
        {sandbox ? ` ${t('sandboxHint')}` : ''}
      </p>
    </section>
  );
}
