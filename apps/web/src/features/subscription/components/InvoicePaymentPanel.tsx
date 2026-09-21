'use client';

/* eslint-disable @next/next/no-img-element -- ảnh QR sinh động theo số tiền + mã, không phải
 * asset tĩnh để đi qua next/image; kích thước cố định nên không gây layout shift. */

import { Alert } from 'antd';
import { useTranslations } from 'next-intl';
import { buildVietQrUrl, subtractMoney } from '@xeprime/domain';
import { SUBSCRIPTION_INVOICE_STATUS } from '@xeprime/types';
import { CopyButton } from '@/components/data-display/CopyButton';
import { useAppFormat } from '@/i18n/use-app-format';
import { usePaymentInfo, useTenantPlans } from '../hooks/use-subscription';
import type { SubscriptionInvoice } from '../types';
import styles from './InvoicePaymentPanel.module.css';

/**
 * Hướng dẫn chuyển khoản cho MỘT hoá đơn gói đang chờ tiền — dùng ở hai chỗ: màn "chuyển
 * khoản" của PurchaseModal ngay sau khi mua, và đầu trang "Gói của tôi" khi còn hoá đơn chờ
 * (người dùng đóng modal rồi vẫn phải tìm lại được QR — kích hoạt là việc của webhook, không
 * phải của tab trình duyệt còn mở).
 *
 * QR là VietQR quicklink CÓ SẴN số tiền + nội dung (ADR 0016 điều 5): nội dung chuyển khoản là
 * khoá đối soát, không bao giờ để người dùng tự gõ. Chưa cấu hình tài khoản nhận (nhóm SEPAY_*)
 * thì rơi về mã + số tiền như trước — có gì hiện nấy, không hiện QR trỏ vào hư không.
 *
 * Hoá đơn `partially_paid` hiện SỐ CÒN THIẾU và QR mang đúng số đó — bắt người chuyển thiếu tự
 * trừ nhẩm là cách nhận thêm một lần chuyển sai.
 */
export function InvoicePaymentPanel({ invoice }: { invoice: SubscriptionInvoice }) {
  const t = useTranslations('Subscription.payment');
  const tPurchase = useTranslations('Subscription.purchase');
  const fmt = useAppFormat();
  const paymentInfo = usePaymentInfo();
  /*
   * Danh mục gói chỉ để lấy TÊN bậc: hoá đơn mang `planCode` (`shop-advanced`) chứ không mang
   * tên người đọc được. Dùng chung query key với bảng giá nên khi người dùng vừa đi qua bước
   * chọn gói thì đây là một lượt đọc cache, không phải một request nữa.
   */
  const plans = useTenantPlans();

  const remaining =
    invoice.status === SUBSCRIPTION_INVOICE_STATUS.PARTIALLY_PAID
      ? (subtractMoney(invoice.totalAmount, invoice.paidAmount) ?? invoice.totalAmount)
      : invoice.totalAmount;

  const info = paymentInfo.data;
  const qrUrl = info ? buildVietQrUrl(info, remaining, invoice.code) : null;
  /* Danh mục chưa về (hoặc bậc đã lưu trữ) ⇒ rơi về MÃ bậc: một chuỗi kỹ thuật vẫn hơn một ô trống. */
  const planName = plans.data?.find((plan) => plan.id === invoice.planId)?.name ?? invoice.planCode;

  return (
    <div className={styles.panel}>
      {/*
        BẠN ĐANG MUA GÌ — trước cả hướng dẫn chuyển khoản.

        Màn này sống qua F5 và qua một lần đăng nhập ở máy khác, nên không có gì bảo đảm người
        đang đọc còn nhớ mình đã chọn bậc nào: thiếu dòng này, thứ duy nhất họ thấy là một số
        tiền và một mã. Dữ liệu lấy từ CHÍNH hoá đơn (bậc, kỳ hạn, kỳ áp dụng, hạn mức đã đóng
        băng lúc tạo), không phải từ lựa chọn còn trong bộ nhớ trình duyệt.
      */}
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

      <Alert
        type="info"
        showIcon
        title={
          invoice.status === SUBSCRIPTION_INVOICE_STATUS.PARTIALLY_PAID
            ? t('partialIntro', { paid: fmt.money(invoice.paidAmount) })
            : t('intro')
        }
      />

      <div className={styles.body}>
        {qrUrl ? (
          <img
            src={qrUrl}
            alt={t('qrAlt')}
            width={220}
            height={260}
            className={styles.qr}
            loading="lazy"
          />
        ) : null}

        <dl className={styles.fields}>
          {info?.configured ? (
            <>
              <div className={styles.row}>
                <dt>{t('bank')}</dt>
                <dd>{info.bankCode}</dd>
              </div>
              <div className={styles.row}>
                <dt>{t('accountNumber')}</dt>
                <dd>
                  <b>{info.accountNumber}</b>{' '}
                  {info.accountNumber ? (
                    <CopyButton value={info.accountNumber} label={t('copyAccount')} />
                  ) : null}
                </dd>
              </div>
              <div className={styles.row}>
                <dt>{t('accountName')}</dt>
                <dd>{info.accountName}</dd>
              </div>
            </>
          ) : null}
          <div className={styles.row}>
            <dt>{t('amount')}</dt>
            <dd>
              <b className={styles.amount}>{fmt.money(remaining)}</b>{' '}
              <CopyButton value={remaining} label={t('copyAmount')} />
            </dd>
          </div>
          <div className={styles.row}>
            <dt>{t('code')}</dt>
            <dd>
              <b className={styles.code}>{invoice.code}</b>{' '}
              <CopyButton value={invoice.code} label={t('copyCode')} />
            </dd>
          </div>
        </dl>
      </div>

      {invoice.expiresAt ? (
        <p className={styles.expires}>{t('expires', { date: fmt.dateTime(invoice.expiresAt) })}</p>
      ) : null}
      <p className={styles.note}>{t('autoActivateNote')}</p>
    </div>
  );
}
