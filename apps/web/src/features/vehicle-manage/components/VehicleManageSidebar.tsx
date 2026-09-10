'use client';

import { Avatar, Switch, Tooltip } from 'antd';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import type { ServiceType } from '@xeprime/types';

import { accountVehicleManagePath, vehicleManageSectionOf } from '@/constants/routes';
import type { VehicleDetail } from '@/features/vehicles/types';
import { useCurrentUser } from '@/hooks/use-current-user';
import { useDomainLabel } from '@/i18n/use-domain-label';
import { cx } from '@/lib/cx';
import { initialOf } from '@/lib/initials';

import { VEHICLE_MANAGE_NAV } from '../navigation';
import type { ServiceToggleState } from '../hooks/use-service-toggle';
import styles from './VehicleManageSidebar.module.css';

interface Props {
  vehicle: VehicleDetail;
  toggle: ServiceToggleState;
}

/**
 * Menu trái RIÊNG của một xe (mockup 08/09/2026): logo, ba nhóm mục, công tắc dịch vụ trên tiêu
 * đề nhóm, thẻ người dùng ở chân. Mục của dịch vụ đang tắt vẫn bấm được — trang con tự hiện lý
 * do và nút bật — nhưng mờ đi để thấy ngay nhóm nào không hoạt động.
 *
 * Desktop: cột dọc dính; mobile: dải cuộn ngang (cùng cách bày với `AccountSidebar`).
 */
export function VehicleManageSidebar({ vehicle, toggle }: Props) {
  const t = useTranslations('VehicleManage');
  const tAccount = useTranslations('Account');
  const domainLabel = useDomainLabel();
  const pathname = usePathname();
  const { data: user } = useCurrentUser();
  const active = vehicleManageSectionOf(pathname);
  const services = vehicle.serviceTypes ?? [];

  const name = user?.displayName || user?.email || tAccount('profile.accountLabel');
  const role = user?.tenant?.roleKey
    ? domainLabel('tenantRole', user.tenant.roleKey, user.tenant.roleKey)
    : tAccount('profile.accountLabel');

  return (
    <nav className={styles.nav} aria-label={t('nav.menuLabel')}>
      <div className={styles.brand}>
        <span className={styles.brandMark} aria-hidden="true">
          X
        </span>
        <span className={styles.brandText}>
          <span className={styles.brandName}>{t('header.brand')}</span>
          <span className={styles.brandPortal}>{t('header.portal')}</span>
        </span>
      </div>

      <div className={styles.groups}>
        {VEHICLE_MANAGE_NAV.map((group) => {
          const service = group.serviceType;
          const enabled = service ? services.includes(service) : true;
          const serviceLabel = service ? domainLabel('serviceType', service) : '';
          const blocked = service ? toggle.blockedReason(service as ServiceType, !enabled) : null;

          const control = service ? (
            <Tooltip title={blocked ?? undefined}>
              <Switch
                size="small"
                aria-label={t('nav.toggleLabel', { service: serviceLabel })}
                checked={enabled}
                disabled={Boolean(blocked) || toggle.pending}
                loading={toggle.pending}
                onChange={(next) => toggle.toggle(service as ServiceType, next)}
              />
            </Tooltip>
          ) : null;

          return (
            <section key={group.key} className={styles.group} aria-label={t(`nav.${group.labelKey}`)}>
              <div className={styles.groupHead}>
                <h2 className={styles.groupTitle}>{t(`nav.${group.labelKey}`)}</h2>
                {control}
              </div>
              <ul className={cx(styles.list, !enabled && styles.listOff)}>
                {group.items.map((item) => {
                  const Icon = item.icon;
                  const isActive = item.section === active;
                  return (
                    <li key={item.section}>
                      <Link
                        href={accountVehicleManagePath.section(vehicle.id, item.section)}
                        className={cx(styles.item, isActive && styles.active)}
                        aria-current={isActive ? 'page' : undefined}
                        aria-disabled={!enabled || undefined}
                      >
                        <Icon className={styles.icon} />
                        <span className={styles.label}>{t(`nav.${item.labelKey}`)}</span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </section>
          );
        })}
      </div>

      <div className={styles.userCard} aria-label={tAccount('sidebar.userCard')}>
        <Avatar size={36} src={user?.avatarUrl ?? undefined} className={styles.avatar}>
          {initialOf(user?.displayName || user?.email)}
        </Avatar>
        <div className={styles.userText}>
          <span className={styles.userName} title={name}>
            {name}
          </span>
          <span className={styles.userRole} title={role}>
            {role}
          </span>
        </div>
      </div>
    </nav>
  );
}
