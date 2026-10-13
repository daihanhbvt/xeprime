'use client';

import { useTranslations } from 'next-intl';
import { useAppFormat } from '@/i18n/use-app-format';
import { useTenantPlans } from '../hooks/use-subscription';
import type { SubscriptionInvoice } from '../types';
import styles from './InvoicePlanSummary.module.css';

/**
 * "BẠN ĐANG MUA GÌ" của một hoá đơn gói — bậc, kỳ hạn, kỳ áp dụng, hạn mức xe.
 *
 * Dữ liệu lấy từ CHÍNH hoá đơn (bậc, kỳ hạn, kỳ áp dụng, hạn mức đã đóng băng lúc tạo), không phải
 * từ lựa chọn còn trong bộ nhớ trình duyệt: trang thanh toán sống qua F5 và qua một lần đăng nhập ở
 * máy khác, nên không có gì bảo đảm người đang đọc còn nhớ mình đã chọn bậc nào.
 *
 * Dùng ở thẻ hoá đơn chờ (`InvoicePaymentPanel`) và thẻ tóm tắt của trang thanh toán.
 */
export function InvoicePlanSummary({ invoice }: { invoice: SubscriptionInvoice }) {
  const t = useTranslations('Subscription.payment');
  const tPurchase = useTranslations('Subscription.purchase');
  const fmt = useAppFormat();
  /*
   * Danh mục gói chỉ để lấy TÊN bậc: hoá đơn mang `planCode` (`shop-advanced`) chứ không mang tên
   * người đọc được. Dùng chung query key với bảng giá nên ngay sau bước chọn gói đây là một lượt
   * đọc cache. Chưa về (hoặc bậc đã lưu trữ) ⇒ rơi về MÃ bậc: một chuỗi kỹ thuật vẫn hơn ô trống.
   */
  const plans = useTenantPlans();
  const planName = plans.data?.find((plan) => plan.id === invoice.planId)?.name ?? invoice.planCode;

  return (
    <div className={styles.plan}>
      <span className={styles.planLabel}>{t('buying')}</span>
      <p className={styles.planName}>
        {planName}
        <span className={styles.planTerm}>
          {tPurchase('termOption', { months: invoice.termMonths })}
        </span>
      </p>
      <p className={styles.planMeta}>
        {t('period', { from: fmt.date(invoice.periodFrom), to: fmt.date(invoice.periodTo) })}
        {invoice.quota.maxVehicles == null
          ? ` · ${tPurchase('limitVehiclesUnlimited')}`
          : ` · ${tPurchase('limitVehicles', { count: invoice.quota.maxVehicles })}`}
      </p>
    </div>
  );
}
