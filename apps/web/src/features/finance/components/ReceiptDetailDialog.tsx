'use client';

import { Alert, Button, Skeleton } from 'antd';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import {
  RECEIPT_SOURCE_META,
  RECEIPT_STATUS,
  RECEIPT_STATUS_META,
  RECEIPT_TYPE_META,
  isAutoReceipt,
  type ReceiptSource,
  type ReceiptStatus,
  type ReceiptType,
} from '@xeprime/types';
import { CopyButton } from '@/components/data-display/CopyButton';
import { PreviewImage, PreviewImageGroup } from '@/components/data-display/PreviewImage';
import { StatusTag } from '@/components/data-display/StatusTag';
import { EmptyState } from '@/components/feedback/EmptyState';
import { ResponsiveDialog } from '@/components/overlay/ResponsiveDialog';
import { bookingPath, customerPath, vehiclePath } from '@/constants/routes';
import { useAppFormat } from '@/i18n/use-app-format';
import { useDomainLabel } from '@/i18n/use-domain-label';
import { useReceiptDetail } from '../hooks/use-receipt-detail';
import { ReceiptAmount } from './ReceiptAmount';
import styles from './ReceiptDetailDialog.module.css';

interface ReceiptDetailDialogProps {
  receiptId: string | null;
  onClose: () => void;
  canApprove: boolean;
  onApprove: (id: string) => void;
  onCancel: (id: string) => void;
}

/**
 * Chi tiết một phiếu thu/chi — hộp giữa màn theo design Partner-XePrime (`23845:40261`): số tiền
 * lớn + đọc bằng chữ · Thông tin phiếu · Thông tin liên kết · Lịch sử thao tác · chân hộp "Hủy
 * phiếu" + "Duyệt phiếu".
 *
 * Giữ ba thứ code đã có mà design không vẽ (chốt 04/11/2026): cảnh báo PHIẾU TỰ ĐỘNG kèm lối về
 * nghiệp vụ gốc (không thì người dùng tìm nút huỷ không thấy mà không biết vì sao), ảnh chứng từ,
 * và người huỷ. Đây cũng là chỗ DUY NHẤT huỷ một phiếu tay đã duyệt — bảng chỉ còn Hủy/Duyệt cho
 * phiếu chờ duyệt.
 */
export function ReceiptDetailDialog({
  receiptId,
  onClose,
  canApprove,
  onApprove,
  onCancel,
}: ReceiptDetailDialogProps) {
  const fmt = useAppFormat();
  const t = useTranslations('Finance.receipts.detail');
  const tCommon = useTranslations('Common');
  const domainLabel = useDomainLabel();
  const { data, isLoading, isError, refetch } = useReceiptDetail(receiptId);

  const auto = data ? isAutoReceipt(data.source) : false;
  const canAct =
    canApprove && data && !auto
      ? {
          approve:
            data.status === RECEIPT_STATUS.PENDING_APPROVAL || data.status === RECEIPT_STATUS.DRAFT,
          cancel: data.status !== RECEIPT_STATUS.CANCELLED,
        }
      : null;
  const empty = tCommon('labels.emptyValue');

  return (
    <ResponsiveDialog
      open={receiptId !== null}
      onClose={onClose}
      size="md"
      mobileMode="fullscreen"
      ariaLabel={t('ariaLabel')}
      title={
        <span className={styles.head}>
          <span className={styles.titleRow}>
            <span>{data?.receiptNo ? t('titleWithNo', { no: data.receiptNo }) : t('title')}</span>
            {data ? (
              <StatusTag
                value={data.status as ReceiptStatus}
                meta={RECEIPT_STATUS_META}
                group="receiptStatus"
              />
            ) : null}
          </span>
          {data ? <span className={styles.subtitle}>{fmt.date(data.occurredAt)}</span> : null}
        </span>
      }
      footer={
        canAct && (canAct.approve || canAct.cancel) ? (
          <div className={styles.footer}>
            {canAct.cancel ? (
              <Button danger size="large" onClick={() => onCancel(data!.id)}>
                {t('cancelAction')}
              </Button>
            ) : null}
            {canAct.approve ? (
              <Button type="primary" size="large" onClick={() => onApprove(data!.id)}>
                {t('approveAction')}
              </Button>
            ) : null}
          </div>
        ) : null
      }
    >
      {isLoading ? (
        <Skeleton active paragraph={{ rows: 8 }} />
      ) : isError && !data ? (
        <EmptyState
          variant="error"
          title={t('errorTitle')}
          onRetry={() => void refetch()}
          retryLabel={tCommon('actions.retry')}
        />
      ) : data ? (
        <div className={styles.body}>
          <div>
            <ReceiptAmount type={data.type} amount={data.amount} size="hero" />
            <p className={styles.words}>{fmt.moneyWords(data.amount)}</p>
          </div>

          {auto ? (
            <Alert
              type="info"
              showIcon
              title={t('auto.title')}
              description={
                <>
                  {t('auto.body', { source: domainLabel('receiptSource', data.source) })}
                  {/*
                    Phiếu bảo dưỡng KHÔNG gắn đơn, nên nếu chỉ dựng link theo `bookingId` thì
                    người dùng nhận một câu "thao tác ở nghiệp vụ đó" mà không có chỗ nào để đi —
                    đúng định nghĩa của một đường cụt.
                  */}
                  {data.bookingId ? (
                    <>
                      {' '}
                      (
                      <Link href={bookingPath.detail(data.bookingId)}>{t('auto.openBooking')}</Link>
                      )
                    </>
                  ) : data.vehicleId ? (
                    <>
                      {' '}
                      (
                      <Link href={vehiclePath.detail(data.vehicleId)}>{t('auto.openVehicle')}</Link>
                      )
                    </>
                  ) : null}
                  .
                </>
              }
            />
          ) : null}

          <Section title={t('sections.info')}>
            <Row label={t('rows.type')}>
              <StatusTag value={data.type as ReceiptType} meta={RECEIPT_TYPE_META} group="receiptType" />
            </Row>
            <Row label={t('rows.source')}>
              <StatusTag
                value={data.source as ReceiptSource}
                meta={RECEIPT_SOURCE_META}
                group="receiptSource"
              />
            </Row>
            <Row label={t('rows.occurredAt')}>{fmt.date(data.occurredAt)}</Row>
            <Row label={t('rows.category')}>{data.categoryName ?? empty}</Row>
            <Row label={t('rows.method')}>{domainLabel('paymentMethod', data.paymentMethod)}</Row>
            <Row label={t('rows.referenceCode')}>
              {data.referenceCode ? (
                <span className={styles.inline}>
                  {data.referenceCode}
                  <CopyButton value={data.referenceCode} label={t('copyReference')} />
                </span>
              ) : (
                empty
              )}
            </Row>
            <Row label={t('rows.description')}>{data.description ?? empty}</Row>
          </Section>

          <Section title={t('sections.related')}>
            <Row label={t('rows.booking')}>
              {data.bookingId ? (
                <Link href={bookingPath.detail(data.bookingId)} className={styles.link}>
                  {data.bookingCode ?? t('viewBooking')}
                </Link>
              ) : (
                empty
              )}
            </Row>
            <Row label={t('rows.vehicle')}>
              {data.vehicleId ? (
                <span className={styles.stack}>
                  <Link href={vehiclePath.detail(data.vehicleId)} className={styles.link}>
                    {data.vehicleName ?? t('viewVehicle')}
                  </Link>
                  {data.plateNumber ? <span className={styles.muted}>{data.plateNumber}</span> : null}
                </span>
              ) : (
                empty
              )}
            </Row>
            <Row label={t('rows.customer')}>
              {data.tenantCustomerId ? (
                <Link href={customerPath.detail(data.tenantCustomerId)} className={styles.link}>
                  {data.customerName ?? t('viewCustomer')}
                </Link>
              ) : (
                (data.customerName ?? empty)
              )}
            </Row>
          </Section>

          {data.attachments.length > 0 ? (
            <section className={styles.section}>
              <h3 className={styles.sectionTitle}>{t('sections.attachments')}</h3>
              <PreviewImageGroup>
                <div className={styles.attachments}>
                  {data.attachments.map((url) => (
                    <PreviewImage
                      key={url}
                      src={url}
                      alt={t('attachmentAlt')}
                      className={styles.thumb}
                    />
                  ))}
                </div>
              </PreviewImageGroup>
            </section>
          ) : null}

          <Section title={t('sections.trace')}>
            <Row label={t('rows.createdBy')}>
              <span className={styles.stack}>
                <span className={styles.strong}>{data.requestedByName ?? empty}</span>
                <span className={styles.muted}>{fmt.dateTime(data.createdAt)}</span>
              </span>
            </Row>
            {data.approvedAt ? (
              <Row label={t('rows.approvedBy')}>
                <span className={styles.stack}>
                  <span className={styles.strong}>{data.approvedByName ?? empty}</span>
                  <span className={styles.muted}>{fmt.dateTime(data.approvedAt)}</span>
                </span>
              </Row>
            ) : null}
            {data.cancelledAt ? (
              <Row label={t('rows.cancelledBy')}>
                <span className={styles.stack}>
                  <span className={styles.strong}>{data.cancelledByName ?? empty}</span>
                  <span className={styles.muted}>{fmt.dateTime(data.cancelledAt)}</span>
                </span>
              </Row>
            ) : null}
          </Section>
        </div>
      ) : null}
    </ResponsiveDialog>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className={styles.section}>
      <h3 className={styles.sectionTitle}>{title}</h3>
      <dl className={styles.rows}>{children}</dl>
    </section>
  );
}

/** Nhãn trái, giá trị phải — một hàng có vạch ngăn, như "Thông tin phiếu" của design. */
function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className={styles.row}>
      <dt className={styles.rowLabel}>{label}</dt>
      <dd className={styles.rowValue}>{children}</dd>
    </div>
  );
}
