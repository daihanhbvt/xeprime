'use client';

import { LoadingOutlined } from '@ant-design/icons';
import { Alert, Button, Tag } from 'antd';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, type ReactNode } from 'react';
import {
  isPaymentOrderViewStateSettling,
  PAYMENT_ORDER_STATUS,
  PAYMENT_ORDER_TARGET,
  PAYMENT_ORDER_VIEW_STATE,
  type PaymentOrderViewState,
} from '@xeprime/types';
import { useAppFormat } from '@/i18n/use-app-format';
import { useDomainLabel } from '@/i18n/use-domain-label';
import { useGatewayOrder } from '../hooks';
import type { PaymentOrder, PaymentSurface } from '../types';
import styles from './GatewayOrderNotice.module.css';

/**
 * Trạng thái MỘT lượt thanh toán qua cổng — điều người trả nhìn thấy khi quay về từ MoMo/VNPAY.
 *
 * Mọi chữ ở đây đi theo `viewState` do SERVER tính. Tham số mà cổng gắn lên URL quay về (mã kết
 * quả, chữ ký…) KHÔNG được đọc: một URL ai cũng sửa được không bao giờ là nguồn của "đã thanh toán".
 *
 * Năm chặng, mỗi chặng một câu và một việc tiếp theo:
 *   awaiting      — cổng chưa báo; còn liên kết thì mời trả tiếp, hết hạn thì nói rõ tiền vẫn được ghi;
 *   confirming    — cổng đã thu, đang ghi vào hoá đơn/chuyến (vài giây);
 *   completed     — đã ghi nhận;
 *   failed        — huỷ / hết hạn / thất bại: chưa ghi nhận gì, mời thử lại hoặc chuyển khoản;
 *   needs_support — tiền về nhưng không tự ghi nhận được: hỗ trợ sẽ xử lý, KHÔNG trả lại lần nữa.
 */
export function GatewayOrderNotice({
  surface,
  orderId,
  nativeReturnHref,
  onSettled,
}: {
  surface: PaymentSurface;
  orderId: string;
  /** Có khi lượt được mở từ app native — nút quay lại ứng dụng. */
  nativeReturnHref?: string | null;
  /** Gọi MỘT lần mỗi khi lượt rời các chặng còn chờ — nơi gọi làm mới dữ liệu đích. */
  onSettled?: (order: PaymentOrder) => void;
}) {
  const t = useTranslations('PaymentGateway.order');
  const tCommon = useTranslations('Common');
  const query = useGatewayOrder(surface, orderId);
  const order = query.data;

  const lastState = useRef<string | null>(null);
  useEffect(() => {
    if (!order) return;
    const previous = lastState.current;
    lastState.current = order.viewState;
    if (
      previous !== order.viewState &&
      !isPaymentOrderViewStateSettling(order.viewState as PaymentOrderViewState)
    ) {
      onSettled?.(order);
    }
  }, [order, onSettled]);

  let body: ReactNode;
  if (!order) {
    body = query.isError ? (
      <Alert
        type="error"
        showIcon
        title={t('loadError')}
        action={
          <Button size="small" onClick={() => void query.refetch()}>
            {tCommon('actions.retry')}
          </Button>
        }
      />
    ) : (
      <Alert type="info" showIcon icon={<LoadingOutlined />} title={t('loading')} />
    );
  } else {
    body = <OrderAlert order={order} />;
  }

  return (
    <div className={styles.notice} aria-live="polite">
      {body}
      {nativeReturnHref ? (
        <Button href={nativeReturnHref} block>
          {t('openApp')}
        </Button>
      ) : null}
    </div>
  );
}

function OrderAlert({ order }: { order: PaymentOrder }) {
  const t = useTranslations('PaymentGateway.order');
  const fmt = useAppFormat();
  const domainLabel = useDomainLabel();
  const provider = domainLabel('paymentGatewayProvider', order.provider);
  const amount = fmt.money(order.amount);
  const sandboxTag = order.sandbox ? <Tag color="orange">{t('sandbox')}</Tag> : null;

  switch (order.viewState as PaymentOrderViewState) {
    case PAYMENT_ORDER_VIEW_STATE.AWAITING:
      /*
       * Cổng đã KÝ XÁC NHẬN chưa có giao dịch nào — thường là khách vừa bấm Huỷ ở trang cổng. Không
       * quay "đang chờ" nữa (không có gì để chờ), không mời mở lại liên kết vừa bị huỷ; các kênh trả
       * ở ngay bên dưới, kể cả ví đó (server mở phiên MỚI). Trạng thái vẫn `pending` (ADR 0058), nên
       * nếu tiền vẫn về trên phiên này thì trang tự đổi như thường.
       */
      if (order.noTransaction) {
        return (
          <Alert
            type="warning"
            showIcon
            title={t('noTransactionTitle', { provider })}
            description={
              <>
                {t('noTransactionBody', { provider })} {sandboxTag}
              </>
            }
          />
        );
      }
      // Không còn liên kết dùng lại ⇒ phiên đã hết hạn dùng; tiền trả muộn (nếu có) vẫn tự ghi nhận.
      return order.checkoutUrl ? (
        <Alert
          type="info"
          showIcon
          icon={<LoadingOutlined />}
          title={t('awaitingTitle', { provider, amount })}
          description={
            <>
              {t('awaitingBody', { provider })} {sandboxTag}
            </>
          }
          action={
            <Button size="small" href={order.checkoutUrl}>
              {t('continue')}
            </Button>
          }
        />
      ) : (
        <Alert
          type="warning"
          showIcon
          title={t('expiredTitle', { provider })}
          description={t('expiredBody')}
        />
      );
    case PAYMENT_ORDER_VIEW_STATE.CONFIRMING:
      return (
        <Alert
          type="info"
          showIcon
          icon={<LoadingOutlined />}
          title={t('confirmingTitle', { provider, amount })}
          description={t('confirmingBody')}
        />
      );
    case PAYMENT_ORDER_VIEW_STATE.COMPLETED:
      return (
        <Alert
          type="success"
          showIcon
          title={t('completedTitle', { amount, provider })}
          description={
            <>
              {order.targetType === PAYMENT_ORDER_TARGET.SUBSCRIPTION_INVOICE
                ? t('completedInvoice', { code: order.targetCode })
                : t('completedHold', { code: order.targetCode })}{' '}
              {sandboxTag}
            </>
          }
        />
      );
    case PAYMENT_ORDER_VIEW_STATE.DUPLICATE_REFUNDED:
      return (
        <Alert
          type="info"
          showIcon
          title={t('duplicateRefundedTitle', { amount, provider })}
          description={t('duplicateRefundedBody', { code: order.targetCode })}
        />
      );
    case PAYMENT_ORDER_VIEW_STATE.NEEDS_SUPPORT:
      return (
        <Alert
          type="warning"
          showIcon
          title={t('needsSupportTitle', { amount })}
          description={t('needsSupportBody', { code: order.id })}
        />
      );
    default:
      return (
        <Alert
          type="warning"
          showIcon
          title={
            order.status === PAYMENT_ORDER_STATUS.CANCELLED
              ? t('cancelledTitle', { provider })
              : order.status === PAYMENT_ORDER_STATUS.EXPIRED
                ? t('expiredResultTitle', { provider })
                : t('failedTitle', { provider })
          }
          description={t('failedBody', { code: order.id })}
        />
      );
  }
}
