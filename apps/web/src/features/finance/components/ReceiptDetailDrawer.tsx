'use client';

import { CheckOutlined, StopOutlined } from '@ant-design/icons';
import { Alert, Button } from 'antd';
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
import { DetailDrawer } from '@/components/overlay/DetailDrawer';
import { bookingPath, customerPath, vehiclePath } from '@/constants/routes';
import { useAppFormat } from '@/i18n/use-app-format';
import { useDomainLabel } from '@/i18n/use-domain-label';
import { moneyToVietnameseWords } from '@/lib/money';
import { vehicleLabel } from '@/lib/vehicle-label';
import { useReceiptDetail } from '../hooks/use-receipt-detail';
import { ReceiptAmount } from './ReceiptAmount';
import styles from './ReceiptDetailDrawer.module.css';

interface ReceiptDetailDrawerProps {
  receiptId: string | null;
  onClose: () => void;
  canApprove: boolean;
  onApprove: (id: string) => void;
  onCancel: (id: string) => void;
}

/**
 * Chi tiết một phiếu — dùng `GET /receipts/:id`, endpoint đã tồn tại từ Phase 6 mà không giao
 * diện nào gọi.
 *
 * Ba việc bảng không làm được: (1) chỉ ra tiền này thuộc đơn/xe/khách nào và **bấm sang được**,
 * (2) cho xem ảnh minh chứng, (3) nói ai tạo, ai duyệt, lúc nào. Với một sổ tiền thì cả ba đều
 * không phải trang trí — đó là toàn bộ khả năng đối chiếu.
 */
export function ReceiptDetailDrawer({
  receiptId,
  onClose,
  canApprove,
  onApprove,
  onCancel,
}: ReceiptDetailDrawerProps) {
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

  return (
    <DetailDrawer
      open={receiptId !== null}
      onClose={onClose}
      size="lg"
      title={data?.receiptNo ?? t('title')}
      ariaLabel={t('ariaLabel')}
      loading={isLoading}
      error={isError}
      onRetry={() => void refetch()}
      errorTitle={t('errorTitle')}
      extra={
        data ? (
          <StatusTag
            value={data.status as ReceiptStatus}
            meta={RECEIPT_STATUS_META}
            group="receiptStatus"
          />
        ) : null
      }
      footer={
        canAct && (canAct.approve || canAct.cancel) ? (
          <div className={styles.footer}>
            {canAct.cancel ? (
              <Button danger icon={<StopOutlined />} onClick={() => onCancel(data!.id)}>
                {t('cancelAction')}
              </Button>
            ) : null}
            {canAct.approve ? (
              <Button type="primary" icon={<CheckOutlined />} onClick={() => onApprove(data!.id)}>
                {tCommon('actions.approve')}
              </Button>
            ) : null}
          </div>
        ) : null
      }
    >
      {data ? (
        <>
          <ReceiptAmount type={data.type} amount={data.amount} size="hero" />
          <div className={styles.words}>{moneyToVietnameseWords(data.amount)}</div>

          <div className={styles.tags}>
            <StatusTag
              value={data.type as ReceiptType}
              meta={RECEIPT_TYPE_META}
              group="receiptType"
            />
            <StatusTag
              value={data.source as ReceiptSource}
              meta={RECEIPT_SOURCE_META}
              group="receiptSource"
            />
          </div>

          {auto ? (
            <Alert
              className={styles.section}
              type="info"
              showIcon
              message={t('auto.title')}
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

          <section className={styles.section}>
            <h3 className={styles.sectionTitle}>{t('sections.info')}</h3>
            <dl className={styles.rows}>
              <Row label={t('rows.occurredAt')}>{fmt.date(data.occurredAt)}</Row>
              <Row label={t('rows.category')}>
                {data.categoryName ?? tCommon('labels.emptyValue')}
              </Row>
              <Row label={t('rows.method')}>{domainLabel('paymentMethod', data.paymentMethod)}</Row>
              <Row label={t('rows.referenceCode')}>
                {data.referenceCode ? (
                  <>
                    {data.referenceCode}{' '}
                    <CopyButton value={data.referenceCode} label={t('copyReference')} />
                  </>
                ) : (
                  tCommon('labels.emptyValue')
                )}
              </Row>
              <Row label={t('rows.description')}>
                {data.description ?? tCommon('labels.emptyValue')}
              </Row>
            </dl>
          </section>

          <section className={styles.section}>
            <h3 className={styles.sectionTitle}>{t('sections.related')}</h3>
            <dl className={styles.rows}>
              <Row label={t('rows.booking')}>
                {data.bookingId ? (
                  <Link href={bookingPath.detail(data.bookingId)}>
                    {data.bookingCode ?? t('viewBooking')}
                  </Link>
                ) : (
                  tCommon('labels.emptyValue')
                )}
              </Row>
              <Row label={t('rows.vehicle')}>
                {data.vehicleId ? (
                  <Link href={vehiclePath.detail(data.vehicleId)}>
                    {vehicleLabel(data.vehicleName, data.plateNumber) || t('viewVehicle')}
                  </Link>
                ) : (
                  tCommon('labels.emptyValue')
                )}
              </Row>
              <Row label={t('rows.customer')}>
                {data.tenantCustomerId ? (
                  <Link href={customerPath.detail(data.tenantCustomerId)}>
                    {data.customerName ?? t('viewCustomer')}
                  </Link>
                ) : (
                  (data.customerName ?? tCommon('labels.emptyValue'))
                )}
              </Row>
            </dl>
          </section>

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

          <section className={styles.section}>
            <h3 className={styles.sectionTitle}>{t('sections.trace')}</h3>
            <dl className={styles.rows}>
              <Row label={t('rows.createdBy')}>
                {data.requestedByName ?? tCommon('labels.emptyValue')} ·{' '}
                {fmt.dateTime(data.createdAt)}
              </Row>
              {data.approvedAt ? (
                <Row label={t('rows.approvedBy')}>
                  {data.approvedByName ?? tCommon('labels.emptyValue')} ·{' '}
                  {fmt.dateTime(data.approvedAt)}
                </Row>
              ) : null}
              {data.cancelledAt ? (
                <Row label={t('rows.cancelledBy')}>
                  {data.cancelledByName ?? tCommon('labels.emptyValue')} ·{' '}
                  {fmt.dateTime(data.cancelledAt)}
                </Row>
              ) : null}
            </dl>
          </section>
        </>
      ) : null}
    </DetailDrawer>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <>
      <dt className={styles.rowLabel}>{label}</dt>
      <dd className={styles.rowValue}>{children}</dd>
    </>
  );
}
