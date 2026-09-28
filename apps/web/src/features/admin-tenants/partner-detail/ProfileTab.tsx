'use client';

import {
  ClockCircleOutlined,
  EnvironmentOutlined,
  ExportOutlined,
  EyeOutlined,
  FileProtectOutlined,
  FileTextOutlined,
  InfoCircleOutlined,
  LockOutlined,
  SafetyCertificateOutlined,
  UserOutlined,
} from '@ant-design/icons';
import { Button, Image, Tag } from 'antd';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import {
  APPROVAL_STATUS_META,
  APPROVAL_TARGET_TYPE,
  PERMISSION,
  SELLER_PROFILE_STATUS_META,
  USER_STATUS_META,
  VEHICLE_DOCUMENT_PRESENTATION_META,
  type ApprovalStatus,
  type SellerProfileStatus,
  type UserStatus,
  type VehicleDocumentPresentation,
} from '@xeprime/types';
import { EntityIdentity } from '@/components/data-display/EntityIdentity';
import { StatusTag } from '@/components/data-display/StatusTag';
import { ROUTES, shopPath } from '@/constants/routes';
import { DashboardPanel } from '@/features/dashboard/components/DashboardPanel';
import { usePermissions } from '@/hooks/use-permissions';
import { useAppFormat } from '@/i18n/use-app-format';
import { useDomainLabel } from '@/i18n/use-domain-label';
import { cx } from '@/lib/cx';
import type { PartnerOverview, PartnerProfile } from './api';
import { usePartnerProfile } from './hooks';
import { ReadOnlyTag } from './OverviewTab';
import { KeyValues, useTabState } from './parts';
import styles from './PartnerDetail.module.css';

/**
 * Tab Hồ sơ — CHỈ ĐỌC. PII đã được server che; giấy tờ chỉ liệt kê (không file, không số) và chỉ
 * khi người xem có quyền xác minh người bán. Việc xác minh làm ở khu Xác minh người bán.
 */
export function ProfileTab({
  overview,
  isPackage,
}: {
  overview: PartnerOverview;
  isPackage: boolean;
}) {
  const tTab = useTranslations('AdminTenants.partnerDetail');
  const query = usePartnerProfile(overview.identity.id);
  const state = useTabState({
    isLoading: query.isLoading,
    error: query.isError && !query.data ? query.error : null,
    onRetry: () => void query.refetch(),
    deniedMessage: tTab('denied.profile'),
  });
  if (state || !query.data) return <div className={styles.tabBody}>{state}</div>;
  return isPackage ? (
    <ShopProfile overview={overview} profile={query.data} />
  ) : (
    <OwnerProfile overview={overview} profile={query.data} />
  );
}

function ReviewNote() {
  const t = useTranslations('AdminTenants.partnerDetail.profile');
  const { has } = usePermissions();
  return (
    <div className={cx(styles.banner, styles.bannerInfo)}>
      <InfoCircleOutlined className={styles.bannerIcon} />
      <span className={styles.stack}>{t('note')}</span>
      {has(PERMISSION.PLATFORM_SELLER_VERIFY) ? (
        <Link href={ROUTES.MANAGE.ADMIN_SELLERS}>
          <Button size="small">{t('goToSellers')}</Button>
        </Link>
      ) : null}
    </div>
  );
}

function ShopProfile({
  overview,
  profile,
}: {
  overview: PartnerOverview;
  profile: PartnerProfile;
}) {
  const t = useTranslations('AdminTenants.partnerDetail.profile');
  const fmt = useAppFormat();
  const domainLabel = useDomainLabel();
  const pub = profile.publicProfile;
  const legal = profile.legal;
  return (
    <div className={styles.tabBody}>
      <div className={styles.columns}>
        <div className={styles.stack}>
          <DashboardPanel title={t('public.title')} icon={<EyeOutlined />} extra={<ReadOnlyTag />}>
            <div className={styles.stack}>
              {pub?.coverUrl ? (
                <Image
                  src={pub.coverUrl}
                  alt={t('public.coverAlt')}
                  preview={false}
                  className={styles.cover}
                />
              ) : null}
              <EntityIdentity
                kind="shop"
                size="md"
                name={pub?.displayName ?? overview.identity.name}
                imageUrl={pub?.logoUrl}
              />
              {pub?.bio ? (
                <p className={styles.bio}>{pub.bio}</p>
              ) : (
                <span className={styles.muted}>{t('public.noBio')}</span>
              )}
              <span className={styles.small}>
                <EnvironmentOutlined /> {pub?.address ?? t('noAddress')}
              </span>
              {overview.identity.storefrontAvailable ? (
                <div className={styles.linkRow}>
                  <a
                    href={shopPath.detail(overview.identity.slug)}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {t('public.storefront')} <ExportOutlined />
                  </a>
                </div>
              ) : null}
            </div>
          </DashboardPanel>

          <DashboardPanel title={t('legal.title')} icon={<FileTextOutlined />}>
            <KeyValues
              items={[
                {
                  key: 'entity',
                  label: t('legal.entityType'),
                  value: legal?.entityType
                    ? domainLabel('sellerEntityType', legal.entityType)
                    : '—',
                },
                { key: 'legalName', label: t('legal.legalName'), value: legal?.legalName ?? '—' },
                { key: 'tax', label: t('legal.taxId'), value: legal?.taxIdMasked ?? '—' },
                {
                  key: 'license',
                  label: t('legal.license'),
                  value: legal?.businessLicenseNoMasked ?? '—',
                },
                {
                  key: 'seller',
                  label: t('legal.sellerStatus'),
                  value: legal?.sellerStatus ? (
                    <StatusTag
                      value={legal.sellerStatus as SellerProfileStatus}
                      meta={SELLER_PROFILE_STATUS_META}
                      group="sellerProfileStatus"
                    />
                  ) : (
                    t('legal.noSeller')
                  ),
                },
                {
                  key: 'verifiedAt',
                  label: t('legal.verifiedAt'),
                  value: legal?.verifiedAt ? fmt.date(legal.verifiedAt) : '—',
                },
              ]}
            />
          </DashboardPanel>

          <TenantDocuments documents={profile.documents} />
        </div>

        <div className={styles.stack}>
          <OwnerPanel profile={profile} />
          <ContactPanel profile={profile} isPackage />
          <VerificationHistory events={profile.verificationHistory} />
        </div>
      </div>
      <ReviewNote />
    </div>
  );
}

function OwnerProfile({
  overview,
  profile,
}: {
  overview: PartnerOverview;
  profile: PartnerProfile;
}) {
  const t = useTranslations('AdminTenants.partnerDetail.profile');
  const fmt = useAppFormat();
  const identity = profile.identity;
  return (
    <div className={styles.tabBody}>
      <ReviewNote />
      <div className={styles.columns}>
        <div className={styles.stack}>
          <DashboardPanel
            title={t('personal.title')}
            icon={<UserOutlined />}
            extra={<ReadOnlyTag />}
          >
            <div className={styles.stack}>
              <EntityIdentity
                kind="person"
                size="md"
                name={profile.owner.name ?? overview.identity.name}
                subtitle={overview.identity.code}
                imageUrl={profile.owner.avatarUrl}
              />
              <KeyValues
                items={[
                  {
                    key: 'phone',
                    label: t('owner.phone'),
                    value: profile.owner.phoneMasked ?? '—',
                  },
                  {
                    key: 'email',
                    label: t('owner.email'),
                    value: profile.owner.emailMasked ?? '—',
                  },
                  {
                    key: 'areas',
                    label: t('areas'),
                    value: profile.activityAreas.join(', ') || '—',
                  },
                  {
                    key: 'status',
                    label: t('owner.accountStatus'),
                    value: profile.owner.accountStatus ? (
                      <StatusTag
                        value={profile.owner.accountStatus as UserStatus}
                        meta={USER_STATUS_META}
                        group="userStatus"
                      />
                    ) : (
                      '—'
                    ),
                  },
                ]}
              />
            </div>
          </DashboardPanel>

          <DashboardPanel title={t('identity.title')} icon={<SafetyCertificateOutlined />}>
            <KeyValues
              items={[
                {
                  key: 'seller',
                  label: t('identity.status'),
                  value: identity?.sellerStatus ? (
                    <StatusTag
                      value={identity.sellerStatus as SellerProfileStatus}
                      meta={SELLER_PROFILE_STATUS_META}
                      group="sellerProfileStatus"
                    />
                  ) : (
                    t('identity.notSubmitted')
                  ),
                },
                {
                  key: 'id',
                  label: t('identity.idNumber'),
                  value: identity?.idNumberMasked ?? '—',
                },
                {
                  key: 'phone',
                  label: t('identity.phone'),
                  value: identity?.phoneVerified
                    ? t('identity.verified')
                    : t('identity.notVerified'),
                },
                {
                  key: 'email',
                  label: t('identity.email'),
                  value: identity?.emailVerified
                    ? t('identity.verified')
                    : t('identity.notVerified'),
                },
                {
                  key: 'verifiedAt',
                  label: t('identity.verifiedAt'),
                  value: identity?.verifiedAt ? fmt.date(identity.verifiedAt) : '—',
                },
              ]}
            />
          </DashboardPanel>

          <VehicleDocuments documents={profile.vehicleDocuments} />
        </div>

        <div className={styles.stack}>
          <ContactPanel profile={profile} isPackage={false} />
          <VerificationHistory events={profile.verificationHistory} />
          <DashboardPanel title={t('privacy.title')} icon={<LockOutlined />}>
            <p className={styles.bio}>{t('privacy.body')}</p>
          </DashboardPanel>
        </div>
      </div>
    </div>
  );
}

function OwnerPanel({ profile }: { profile: PartnerProfile }) {
  const t = useTranslations('AdminTenants.partnerDetail.profile.owner');
  const fmt = useAppFormat();
  return (
    <DashboardPanel title={t('title')} icon={<UserOutlined />}>
      <KeyValues
        items={[
          { key: 'name', label: t('name'), value: profile.owner.name ?? '—' },
          { key: 'phone', label: t('phone'), value: profile.owner.phoneMasked ?? '—' },
          { key: 'email', label: t('email'), value: profile.owner.emailMasked ?? '—' },
          {
            key: 'status',
            label: t('accountStatus'),
            value: profile.owner.accountStatus ? (
              <StatusTag
                value={profile.owner.accountStatus as UserStatus}
                meta={USER_STATUS_META}
                group="userStatus"
              />
            ) : (
              '—'
            ),
          },
          {
            key: 'joined',
            label: t('joined'),
            value: profile.owner.joinedAt ? fmt.date(profile.owner.joinedAt) : '—',
          },
        ]}
      />
    </DashboardPanel>
  );
}

function ContactPanel({ profile, isPackage }: { profile: PartnerProfile; isPackage: boolean }) {
  const t = useTranslations('AdminTenants.partnerDetail.profile.contact');
  return (
    <DashboardPanel title={t('title')} icon={<EnvironmentOutlined />}>
      <div className={styles.stack}>
        {profile.addresses.length > 0 ? (
          <ul className={styles.issueList}>
            {profile.addresses.map((branch) => (
              <li key={branch.id}>
                <strong>{branch.name}</strong>
                {branch.isDefault ? (
                  <Tag className={styles.small}>
                    {isPackage ? t('defaultBranch') : t('defaultPoint')}
                  </Tag>
                ) : null}
                <div className={styles.muted}>{branch.address ?? '—'}</div>
              </li>
            ))}
          </ul>
        ) : (
          <span className={styles.muted}>{t('noAddress')}</span>
        )}
        <KeyValues
          items={[
            { key: 'phone', label: t('publicPhone'), value: profile.publicPhoneMasked ?? '—' },
            { key: 'email', label: t('publicEmail'), value: profile.publicEmailMasked ?? '—' },
          ]}
        />
      </div>
    </DashboardPanel>
  );
}

function TenantDocuments({ documents }: { documents: PartnerProfile['documents'] }) {
  const t = useTranslations('AdminTenants.partnerDetail.profile.documents');
  const fmt = useAppFormat();
  const domainLabel = useDomainLabel();
  return (
    <DashboardPanel
      title={t('title')}
      icon={<FileProtectOutlined />}
      empty={documents == null ? undefined : t('empty')}
      extra={
        <span className={styles.muted}>
          <LockOutlined /> {t('sensitive')}
        </span>
      }
    >
      {documents == null ? (
        <span className={styles.muted}>{t('locked')}</span>
      ) : documents.length > 0 ? (
        <ul className={styles.issueList}>
          {documents.map((doc) => (
            <li key={doc.id} className={styles.issue}>
              <span>{domainLabel('tenantDocumentType', doc.documentType)}</span>
              <span className={styles.muted}>{fmt.date(doc.createdAt)}</span>
              <Tag>{domainLabel('tenantDocumentStatus', doc.status)}</Tag>
            </li>
          ))}
        </ul>
      ) : null}
    </DashboardPanel>
  );
}

function VehicleDocuments({ documents }: { documents: PartnerProfile['vehicleDocuments'] }) {
  const t = useTranslations('AdminTenants.partnerDetail.profile.vehicleDocuments');
  const fmt = useAppFormat();
  const domainLabel = useDomainLabel();
  return (
    <DashboardPanel
      title={t('title')}
      icon={<FileTextOutlined />}
      empty={documents == null ? undefined : t('empty')}
    >
      {documents == null ? (
        <span className={styles.muted}>{t('locked')}</span>
      ) : documents.length > 0 ? (
        <ul className={styles.issueList}>
          {documents.map((doc) => (
            <li key={doc.id} className={styles.issue}>
              <span>
                <strong>{doc.vehicleName}</strong>
                <div className={styles.muted}>{doc.vehiclePlateNumber ?? '—'}</div>
              </span>
              <span>{domainLabel('vehicleDocumentType', doc.type)}</span>
              <StatusTag
                value={doc.presentation as VehicleDocumentPresentation}
                meta={VEHICLE_DOCUMENT_PRESENTATION_META}
                group="vehicleDocumentPresentation"
              />
              <span className={styles.muted}>
                {doc.expiresAt ? fmt.dateKey(doc.expiresAt) : t('noExpiry')}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </DashboardPanel>
  );
}

function VerificationHistory({ events }: { events: PartnerProfile['verificationHistory'] }) {
  const t = useTranslations('AdminTenants.partnerDetail.profile.history');
  const fmt = useAppFormat();
  return (
    <DashboardPanel title={t('title')} icon={<ClockCircleOutlined />} empty={t('empty')}>
      {events.length > 0 ? (
        <ul className={styles.timeline}>
          {events.map((event, index) => (
            <li key={`${event.at}-${index}`}>
              <span className={styles.muted}>{fmt.dateTime(event.at)}</span>
              <span>
                <StatusTag
                  value={event.toStatus as ApprovalStatus}
                  meta={APPROVAL_STATUS_META}
                  group="approvalStatus"
                />{' '}
                {event.subject === APPROVAL_TARGET_TYPE.SELLER_PROFILE
                  ? t('subject.sellerProfile')
                  : t('subject.tenant')}
                {event.actorName ? (
                  <span className={styles.muted}> · {event.actorName}</span>
                ) : null}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </DashboardPanel>
  );
}
