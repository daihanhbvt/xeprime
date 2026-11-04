'use client';

import {
  MailOutlined,
  PhoneOutlined,
  EnvironmentOutlined,
  TagOutlined,
  UserOutlined,
} from '@ant-design/icons';
import { useTranslations } from 'next-intl';
import { STATUS_COLOR } from '@xeprime/types';
import { CopyButton } from '@/components/data-display/CopyButton';
import { EntityIdentity } from '@/components/data-display/EntityIdentity';
import { ToneDotBadge } from '@/components/data-display/StatusBadge';
import { CustomerContactButtons } from '@/features/booking-requests/components/CustomerContactButtons';
import { useAppFormat } from '@/i18n/use-app-format';
import { useDomainLabel } from '@/i18n/use-domain-label';
import { customerStatusOf } from '../../constants';
import type { TenantCustomerDetail } from '../../types';
import styles from './CustomerDetail.module.css';

/**
 * Thẻ "Hồ sơ khách hàng" ở cột phải — Figma `23777:54975`: danh tính + nguồn, gọi/Zalo, liên hệ,
 * nhãn, tài khoản XePrime, lần thuê gần nhất, ngày vào sổ.
 *
 * Không có nút Nhắn tin: hội thoại trên XePrime gắn với MỘT yêu cầu đặt xe (ADR 0073), không gắn với
 * hồ sơ khách — mở từ đơn/yêu cầu của khách.
 */
export function CustomerProfileCard({
  customer,
  canViewFinance,
}: {
  customer: TenantCustomerDetail;
  canViewFinance: boolean;
}) {
  const t = useTranslations('Customers');
  const tProfile = useTranslations('Customers.profile');
  const fmt = useAppFormat();
  const dl = useDomainLabel();
  const status = customerStatusOf(customer, canViewFinance);

  return (
    <aside className={styles.profileCard}>
      <div className={styles.profileHead}>
        <h2 className={styles.cardTitle}>{tProfile('profileTitle')}</h2>
        <UserOutlined aria-hidden="true" className={styles.profileIcon} />
      </div>
      <EntityIdentity
        name={customer.fullName}
        subtitle={dl('tenantCustomerSource', customer.source)}
        kind="person"
        size="lg"
        initialSource={customer.fullName}
      />
      <CustomerContactButtons variant="icon" name={customer.fullName} phone={customer.phone} />
      <dl className={styles.profileList}>
        <div>
          <dt>
            <PhoneOutlined aria-hidden="true" /> {t('detail.phone')}
          </dt>
          <dd className={styles.copyRow}>
            <a href={`tel:${customer.phone}`}>{customer.phone}</a>
            <CopyButton value={customer.phone} label={t('detail.copyPhone')} />
          </dd>
        </div>
        <div>
          <dt>
            <TagOutlined aria-hidden="true" /> {tProfile('label')}
          </dt>
          <dd>
            <ToneDotBadge color={status.color}>
              {status.key === 'unclassified'
                ? t('card.unclassified')
                : dl('tenantCustomerRelationship', status.key)}
            </ToneDotBadge>
          </dd>
        </div>
        {customer.email ? (
          <div>
            <dt>
              <MailOutlined aria-hidden="true" /> {t('detail.email')}
            </dt>
            <dd className={styles.copyRow}>
              <a href={`mailto:${customer.email}`}>{customer.email}</a>
              <CopyButton value={customer.email} label={t('detail.copyEmail')} />
            </dd>
          </div>
        ) : null}
        {customer.address ? (
          <div>
            <dt>
              <EnvironmentOutlined aria-hidden="true" /> {t('detail.address')}
            </dt>
            <dd>{customer.address}</dd>
          </div>
        ) : null}
      </dl>
      <dl className={styles.profileFoot}>
        <div className={styles.profileFootRow}>
          <dt>{t('detail.account')}</dt>
          <dd>
            <ToneDotBadge color={customer.hasAccount ? STATUS_COLOR.SUCCESS : STATUS_COLOR.NEUTRAL}>
              {customer.hasAccount ? t('detail.accountLinked') : t('detail.accountNotLinked')}
            </ToneDotBadge>
          </dd>
        </div>
        <div className={styles.profileFootGrid}>
          <div>
            <dt>{tProfile('lastRental')}</dt>
            <dd>{customer.lastRentalAt ? fmt.date(customer.lastRentalAt) : '—'}</dd>
          </div>
          <div>
            <dt>{tProfile('since')}</dt>
            <dd>{fmt.date(customer.createdAt)}</dd>
          </div>
        </div>
      </dl>
    </aside>
  );
}
