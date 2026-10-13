'use client';

/* eslint-disable @next/next/no-img-element -- ảnh QR sinh động theo số tiền + mã, không phải
 * asset tĩnh để đi qua next/image; kích thước cố định nên không gây layout shift. */

import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { buildVietQrUrl } from '@xeprime/domain';
import type { components } from '@xeprime/types';
import { CopyButton } from '@/components/data-display/CopyButton';
import { InfoHint } from '@/components/data-display/InfoHint';
import { useAppFormat } from '@/i18n/use-app-format';
import styles from './BankTransferDetails.module.css';

/** Tài khoản nhận của nền tảng — cùng hình dạng ở tiền giữ chỗ và hoá đơn gói. */
export type TransferAccount = components['schemas']['HoldPaymentInfoDto'];

/**
 * CHUYỂN KHOẢN NHANH qua VietQR — một bản cho mọi khoản tiền vào nền tảng (tiền giữ chỗ của khách,
 * hoá đơn gói của gian hàng).
 *
 * Trước đây hai màn mỗi màn tự vẽ QR + bảng số tài khoản. Hai bản là hai chỗ để số tiền hoặc NỘI
 * DUNG chuyển khoản trôi khỏi nhau — và nội dung là khoá đối soát của SePay (ADR 0022): sai một ký
 * tự là một khoản tiền không khớp được vào đâu.
 *
 * QR mang sẵn số tiền + mã (ADR 0016 điều 5), khách không phải gõ gì. Ảnh hỏng hoặc chưa cấu hình
 * tài khoản nhận ⇒ nói thẳng và chỉ sang bảng thông tin bên cạnh; một khung trắng im lặng là chỗ
 * khách bỏ cuộc.
 */
export function BankTransferDetails({
  account,
  amount,
  code,
}: {
  /** `undefined` khi đang tải — bảng vẫn hiện số tiền + mã, hai thứ đủ để chuyển tay. */
  account: TransferAccount | null | undefined;
  /** Số còn phải chuyển (VND, chuỗi) — QR mang đúng số này. */
  amount: string;
  /** Mã đối soát — nội dung chuyển khoản bắt buộc. */
  code: string;
}) {
  const t = useTranslations('PaymentGateway.checkout.transfer');
  const fmt = useAppFormat();
  /** Ảnh QR không tải được (chặn mạng, nhà cung cấp lỗi) — có gì hiện nấy, không im lặng. */
  const [qrFailed, setQrFailed] = useState(false);

  const qrUrl = account ? buildVietQrUrl(account, amount, code) : null;

  return (
    <div className={styles.body}>
      {qrUrl && !qrFailed ? (
        <figure className={styles.qrWrap}>
          <img
            src={qrUrl}
            alt={t('qrAlt')}
            width={220}
            height={260}
            className={styles.qr}
            loading="lazy"
            onError={() => setQrFailed(true)}
          />
          <figcaption className={styles.qrCaption}>{t('qrCaption')}</figcaption>
        </figure>
      ) : (
        <p className={styles.qrFallback}>{qrUrl ? t('qrFailed') : t('qrUnavailable')}</p>
      )}

      <dl className={styles.fields}>
        {account?.configured ? (
          <>
            <div className={styles.row}>
              <dt>{t('bank')}</dt>
              <dd>
                <span>{account.bankCode}</span>
              </dd>
            </div>
            <div className={styles.row}>
              <dt>{t('accountNumber')}</dt>
              <dd>
                <b>{account.accountNumber}</b>
                {account.accountNumber ? (
                  <CopyButton value={account.accountNumber} label={t('copyAccount')} />
                ) : null}
              </dd>
            </div>
            <div className={styles.row}>
              <dt>{t('accountName')}</dt>
              <dd>
                <span>{account.accountName}</span>
              </dd>
            </div>
          </>
        ) : null}
        <div className={styles.row}>
          <dt>{t('amount')}</dt>
          <dd>
            <b className={styles.amount}>{fmt.money(amount)}</b>
            <CopyButton value={amount} label={t('copyAmount')} />
          </dd>
        </div>
        <div className={styles.row}>
          <dt>
            {t('code')}
            <InfoHint content={t('codeHint')} label={t('codeHintLabel')} />
          </dt>
          <dd>
            <b className={styles.code}>{code}</b>
            <CopyButton value={code} label={t('copyCode')} />
          </dd>
        </div>
      </dl>
    </div>
  );
}
