'use client';

import { EyeOutlined, ReloadOutlined } from '@ant-design/icons';
import { Alert, App, Button, Descriptions, Empty, Image, Segmented, Skeleton, Tag } from 'antd';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { LIST_SEPARATOR } from '@xeprime/domain';
import {
  BOOKING_REQUEST_STATUS_META,
  DRIVER_LICENCE_DECISION_SOURCE,
  DRIVER_LICENCE_STATUS,
  DRIVER_LICENCE_STATUS_META,
  PERMISSION,
  STATUS_COLOR,
  USER_STATUS_META,
  type BookingRequestStatus,
  type DriverLicenceReadingConfidence,
  type DriverLicenceStatus,
  type UserStatus,
} from '@xeprime/types';
import { MaskedContact } from '@/components/data-display/MaskedContact';
import { DataTable, type DataTableColumn } from '@/components/data-display/DataTable';
import { StatusTag } from '@/components/data-display/StatusTag';
import { DetailDrawer } from '@/components/overlay/DetailDrawer';
import { ROUTES } from '@/constants/routes';
import { usePermissions } from '@/hooks/use-permissions';
import { useAppFormat, type AppFormat } from '@/i18n/use-app-format';
import { useDomainLabel } from '@/i18n/use-domain-label';
import { useErrorMessage } from '@/i18n/use-error-message';
import {
  useAdminCustomer,
  useCustomerLicenceImage,
  useCustomerLicences,
  useRevealCustomerContact,
} from '../hooks/use-admin-customers';
import type { AdminCustomerDetail, AdminCustomerRequest, CustomerLicence } from '../types';
import styles from './AdminCustomerDetailDrawer.module.css';

type Translate = ReturnType<typeof useTranslations<'AdminCustomers'>>;

export function AdminCustomerDetailDrawer({
  customerId,
  onClose,
}: {
  customerId: string | null;
  onClose: () => void;
}) {
  const t = useTranslations('AdminCustomers.drawer');
  const { data, isLoading, isError, refetch } = useAdminCustomer(customerId);

  return (
    <DetailDrawer
      title={data ? data.displayName : t('title')}
      // Bậc `lg` (720px): panel có bảng yêu cầu gần đây và ảnh bằng lái lồng bên trong.
      size="lg"
      open={Boolean(customerId)}
      onClose={onClose}
      extra={
        data ? (
          <StatusTag value={data.status as UserStatus} meta={USER_STATUS_META} group="userStatus" />
        ) : null
      }
      loading={!isError && (isLoading || !data)}
      error={isError}
      errorTitle={t('loadError')}
      onRetry={() => void refetch()}
    >
      {/* `key` ép remount khi đổi khách: liên hệ đã bỏ che / ảnh đã mở của khách trước không rớt sang sau. */}
      {data ? <Body key={data.id} customer={data} /> : null}
    </DetailDrawer>
  );
}

function Body({ customer }: { customer: AdminCustomerDetail }) {
  const t = useTranslations('AdminCustomers');
  const fmt = useAppFormat();
  const { message } = App.useApp();
  const errorMessage = useErrorMessage();
  const { has } = usePermissions();
  const reveal = useRevealCustomerContact(customer.id);

  const canReveal = has(PERMISSION.PLATFORM_CUSTOMER_PII_VIEW);
  const canSeeLicence = has(PERMISSION.PLATFORM_DRIVER_LICENCE_REVIEW);
  const onReveal = () =>
    reveal.mutate(undefined, { onError: (err) => void message.error(errorMessage(err)) });

  return (
    <div>
      <Descriptions
        column={1}
        size="small"
        bordered
        items={[
          {
            key: 'phone',
            label: t('drawer.phone'),
            children: (
              <span className={styles.inline}>
                <MaskedContact
                  masked={customer.phoneMasked}
                  revealed={reveal.data?.phone}
                  canReveal={canReveal}
                  loading={reveal.isPending}
                  onReveal={onReveal}
                />
                {customer.phoneVerified ? (
                  <Tag color={STATUS_COLOR.SUCCESS}>{t('drawer.verified')}</Tag>
                ) : null}
              </span>
            ),
          },
          {
            key: 'email',
            label: t('drawer.email'),
            children: (
              <span className={styles.inline}>
                <MaskedContact
                  masked={customer.emailMasked}
                  revealed={reveal.data?.email}
                  canReveal={canReveal}
                  loading={reveal.isPending}
                  onReveal={onReveal}
                />
                {customer.emailVerifiedAt ? (
                  <Tag color={STATUS_COLOR.SUCCESS}>{t('drawer.verified')}</Tag>
                ) : null}
              </span>
            ),
          },
          {
            key: 'activity',
            label: t('drawer.activity'),
            children: t('drawer.activityValue', {
              requests: customer.requestCount,
              booked: customer.bookedCount,
              reviews: customer.reviewCount,
              conversations: customer.conversationCount,
            }),
          },
          {
            key: 'lastLogin',
            label: t('drawer.lastLogin'),
            children: customer.lastLoginAt
              ? fmt.dateTime(customer.lastLoginAt)
              : t('drawer.neverLoggedIn'),
          },
          {
            key: 'created',
            label: t('drawer.createdAt'),
            children: fmt.dateTime(customer.createdAt),
          },
          {
            key: 'updated',
            label: t('drawer.updatedAt'),
            children: fmt.dateTime(customer.updatedAt),
          },
        ]}
      />

      {canSeeLicence ? <LicenceSection userId={customer.id} /> : null}

      <div className={styles.sectionTitle}>{t('drawer.recentRequests')}</div>
      {customer.recentRequests.length === 0 ? (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('drawer.noRequests')} />
      ) : (
        <DataTable<AdminCustomerRequest>
          label={t('drawer.recentRequests')}
          columns={requestColumns(fmt, t)}
          items={customer.recentRequests}
          minWidth={760}
          striped={false}
          empty={{ title: t('drawer.noRequests') }}
        />
      )}
    </div>
  );
}

/**
 * Bằng lái của khách — CHỈ ĐỌC (ADR 0070: hệ thống tự quyết mọi lượt nộp). Mặc định mở bằng đang
 * dùng, không có thì lượt nộp gần nhất; lịch sử chuyển qua lại bằng nút chọn.
 */
function LicenceSection({ userId }: { userId: string }) {
  const t = useTranslations('AdminCustomers');
  const query = useCustomerLicences(userId, true);
  const items = query.data?.items ?? [];
  const current = items.find((l) => l.status === DRIVER_LICENCE_STATUS.VERIFIED) ?? items[0];
  const [pickedId, setPickedId] = useState<string | null>(null);
  const shown = items.find((l) => l.id === pickedId) ?? current;

  return (
    <section className={styles.licence} aria-label={t('licence.title')}>
      <div className={styles.sectionTitle}>{t('licence.title')}</div>
      <p className={styles.note}>{t('licence.autoNote')}</p>
      {query.isPending ? (
        <Skeleton active paragraph={{ rows: 4 }} />
      ) : query.isError ? (
        <Alert
          type="warning"
          showIcon
          title={t('licence.loadError')}
          action={
            <Button size="small" onClick={() => void query.refetch()}>
              {t('licence.retry')}
            </Button>
          }
        />
      ) : !shown ? (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('licence.none')} />
      ) : (
        <>
          {items.length > 1 ? (
            <HistoryPicker
              items={items}
              value={shown.id}
              currentId={current?.id}
              onChange={setPickedId}
            />
          ) : null}
          {/* `key` ép reset ảnh đã mở khi đổi lượt nộp — URL ảnh thuộc về một lượt. */}
          <LicenceDetail key={shown.id} licence={shown} />
        </>
      )}
    </section>
  );
}

function HistoryPicker({
  items,
  value,
  currentId,
  onChange,
}: {
  items: CustomerLicence[];
  value: string;
  currentId: string | undefined;
  onChange: (id: string) => void;
}) {
  const t = useTranslations('AdminCustomers.licence');
  const fmt = useAppFormat();
  return (
    <div>
      <div className={styles.meta}>{t('history')}</div>
      <Segmented
        aria-label={t('history')}
        value={value}
        onChange={(id) => onChange(String(id))}
        options={items.map((l) => ({
          value: l.id,
          label: (
            <span className={l.id === currentId ? styles.historyActive : undefined}>
              {fmt.date(l.submittedAt)}
              {l.id === currentId ? ` · ${t('current')}` : ''}
            </span>
          ),
        }))}
      />
    </div>
  );
}

function LicenceDetail({ licence }: { licence: CustomerLicence }) {
  const t = useTranslations('AdminCustomers.licence');
  const fmt = useAppFormat();
  const dl = useDomainLabel();
  const [showImage, setShowImage] = useState(false);

  const drives = [
    licence.coversCar ? t('facts.car') : null,
    licence.coversMotorbike ? t('facts.motorbike') : null,
  ].filter(Boolean);
  const confidence = licence.reading.confidence as DriverLicenceReadingConfidence | null;

  const facts = [
    {
      key: 'reason',
      label: t('facts.reason'),
      value: licence.rejectionReason
        ? dl('driverLicenceRejectReason', licence.rejectionReason)
        : null,
    },
    {
      key: 'kind',
      label: t('facts.kind'),
      value: licence.kind ? dl('driverLicenceKind', licence.kind) : null,
    },
    { key: 'fullName', label: t('facts.fullName'), value: licence.fullName },
    { key: 'number', label: t('facts.licenceNumber'), value: licence.licenceNumber },
    {
      key: 'dob',
      label: t('facts.dateOfBirth'),
      value: licence.dateOfBirth ? fmt.dateKey(licence.dateOfBirth) : null,
    },
    { key: 'classes', label: t('facts.classes'), value: licence.classes.join(', ') || null },
    {
      key: 'expires',
      label: t('facts.expiresOn'),
      value: licence.noExpiry
        ? t('facts.noExpiry')
        : licence.expiresOn
          ? fmt.dateKey(licence.expiresOn)
          : null,
    },
    { key: 'country', label: t('facts.country'), value: licence.issuingCountry },
    {
      key: 'drives',
      label: t('facts.drives'),
      value: drives.length > 0 ? drives.join(LIST_SEPARATOR) : null,
    },
    {
      key: 'source',
      label: t('facts.source'),
      value:
        licence.decisionSource === DRIVER_LICENCE_DECISION_SOURCE.AUTO
          ? t('facts.sourceAuto')
          : licence.decidedByName,
    },
    {
      key: 'decidedAt',
      label: t('facts.decidedAt'),
      value: licence.decidedAt ? fmt.dateTime(licence.decidedAt) : null,
    },
    {
      key: 'confidence',
      label: t('facts.confidence'),
      value: confidence ? t(`confidence.${confidence}`) : null,
    },
    { key: 'readerError', label: t('facts.readerError'), value: licence.reading.errorCode },
  ].filter((f) => f.value);

  return (
    <>
      <div className={styles.historyItem}>
        <StatusTag
          value={licence.status as DriverLicenceStatus}
          meta={DRIVER_LICENCE_STATUS_META}
          group="driverLicenceStatus"
        />
        <span className={styles.meta}>
          {t('submittedAt', { date: fmt.dateTime(licence.submittedAt) })}
        </span>
      </div>
      {facts.length > 0 ? (
        <Descriptions
          column={1}
          size="small"
          bordered
          items={facts.map((f) => ({ key: f.key, label: f.label, children: f.value }))}
        />
      ) : null}
      <div className={styles.imageFrame}>
        {showImage ? (
          <LicenceImage id={licence.id} />
        ) : (
          <Button icon={<EyeOutlined aria-hidden="true" />} onClick={() => setShowImage(true)}>
            {t('image.show')}
          </Button>
        )}
      </div>
      <p className={styles.note}>{t('image.audit')}</p>
    </>
  );
}

/** Ảnh chỉ xin khi người xem bấm — mỗi lượt xin URL là một dòng audit ở server. */
function LicenceImage({ id }: { id: string }) {
  const t = useTranslations('AdminCustomers.licence');
  const image = useCustomerLicenceImage(id);
  if (image.isPending) return <Skeleton.Image active />;
  if (image.isError || !image.data) {
    return (
      <Alert
        type="warning"
        showIcon
        title={t('image.loadFailed')}
        action={
          <Button
            size="small"
            icon={<ReloadOutlined aria-hidden="true" />}
            onClick={() => void image.refetch()}
          >
            {t('retry')}
          </Button>
        }
      />
    );
  }
  return <Image src={image.data.url} alt={t('image.alt')} className={styles.image} />;
}

/**
 * Cột dựng bằng HÀM chứ không phải hằng ở module scope: nhãn và mốc thời gian phải theo ngôn ngữ
 * của request, mà ngôn ngữ chỉ đọc được trong cây React.
 */
const requestColumns = (fmt: AppFormat, t: Translate): DataTableColumn<AdminCustomerRequest>[] => [
  {
    title: t('drawer.requestTarget'),
    key: 'target',
    width: 230,
    render: (_, r) => (
      <div>
        <div>{r.tenantName}</div>
        <div className={styles.meta}>{r.vehicleName}</div>
      </div>
    ),
  },
  {
    title: t('drawer.requestPeriod'),
    key: 'period',
    width: 230,
    render: (_, r) => (
      <div>
        <div>{fmt.shortDateTime(r.pickupAt)}</div>
        <div className={styles.meta}>{fmt.shortDateTime(r.returnAt)}</div>
      </div>
    ),
  },
  {
    title: t('drawer.requestStatus'),
    key: 'status',
    width: 140,
    render: (_, r) => (
      <StatusTag
        value={r.status as BookingRequestStatus}
        meta={BOOKING_REQUEST_STATUS_META}
        group="bookingRequestStatus"
      />
    ),
  },
  {
    title: t('drawer.requestLink'),
    key: 'booking',
    align: 'right',
    width: 150,
    render: (_, r) =>
      r.bookingCode ? (
        <Link href={`${ROUTES.ADMIN.BOOKINGS}?q=${encodeURIComponent(r.bookingCode)}`}>
          {t('drawer.bookingLink', { code: r.bookingCode })}
        </Link>
      ) : null,
  },
];
