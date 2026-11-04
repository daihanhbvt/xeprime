'use client';

import {
  CheckOutlined,
  FileSearchOutlined,
  LoadingOutlined,
  UserOutlined,
  WarningFilled,
} from '@ant-design/icons';
import { Avatar, Button } from 'antd';
import { useTranslations } from 'next-intl';
import {
  DRIVER_LICENCE_STATE,
  DRIVER_LINK_END_PARTY,
  DRIVER_LINK_OPEN_STATUSES,
  DRIVER_LINK_STATUS,
  DRIVER_LINK_STATUS_META,
  STATUS_COLOR,
  type DriverLinkStatus,
} from '@xeprime/types';
import { holderNameDiffers } from '@xeprime/domain';
import { RowActions, type RowAction } from '@/components/data-display/RowActions';
import { StatusBadge } from '@/components/data-display/StatusBadge';
import { useAppFormat } from '@/i18n/use-app-format';
import { useDomainLabel } from '@/i18n/use-domain-label';
import { cx } from '@/lib/cx';
import { DRIVER_DETAIL_TAB, type Driver, type DriverDetailTab } from '../types';
import styles from './DriverCard.module.css';

/**
 * Thẻ MỘT tài xế ở màn Quản lý tài xế — Figma Partner-XePrime `23737:43826` (04/11/2026).
 *
 * Bằng lái hiện đúng phần bên thuê được thấy (ADR 0063): mức xác thực, hạng, họ tên in trên bằng,
 * hạn, loại — không ảnh, không số bằng. Bằng đã xác thực mà họ tên lệch tên đã mời thì nhãn đổi
 * thành "Cần đối chiếu" (cùng phép so `holderNameDiffers` với bộ lọc của server).
 *
 * Ngoài design (chốt 04/11): dòng tiền công tháng + số chuyến (ADR 0075), dòng rút chuyến khi có
 * (ADR 0074), ai kết thúc liên kết / đã mời lại ở dòng lịch sử, và nút "Mời lại" ở thẻ đã đóng.
 */
export function DriverCard({
  driver,
  monthLabel,
  canManage,
  menu,
  onOpen,
  onEdit,
  onReinvite,
}: {
  driver: Driver;
  /** Nhãn tháng của dòng tiền công ("11/2026") — cùng tháng với bộ chọn trên hàng lọc. */
  monthLabel: string;
  canManage: boolean;
  /** Mục của menu "…" — trang dựng vì các lượt ghi (tạm khoá, kết thúc) sống ở trang. */
  menu: RowAction[];
  onOpen: (tab?: DriverDetailTab) => void;
  onEdit: () => void;
  onReinvite: () => void;
}) {
  const t = useTranslations('Drivers');
  const fmt = useAppFormat();
  const domainLabel = useDomainLabel();

  const open = DRIVER_LINK_OPEN_STATUSES.includes(driver.linkStatus as DriverLinkStatus);
  const canReinvite = canManage && !open && !driver.currentOpenLinkStatus;
  const hasMonthWage = driver.monthCompletedTrips > 0 || Number(driver.monthWageTotal) > 0;
  const accountName =
    driver.account.displayName && driver.account.displayName !== driver.name
      ? driver.account.displayName
      : null;

  return (
    <article className={styles.card} aria-label={driver.name}>
      <header className={styles.head}>
        <button
          type="button"
          className={styles.identity}
          onClick={() => onOpen()}
          aria-label={t('card.openDetail', { name: driver.name })}
        >
          <Avatar
            size={48}
            src={driver.account.avatarUrl ?? undefined}
            icon={driver.account.avatarUrl ? undefined : <UserOutlined />}
            className={styles.avatar}
          />
          <span className={styles.who}>
            <span className={styles.name}>{driver.name}</span>
            <span className={styles.contact}>
              <span>{driver.phone}</span>
              {accountName ? (
                <>
                  <span className={styles.separator} aria-hidden="true">
                    |
                  </span>
                  <span className={styles.account}>
                    {t('card.accountName', { name: accountName })}
                  </span>
                </>
              ) : null}
            </span>
          </span>
        </button>
        <RowActions
          actions={menu}
          maxInline={0}
          overflowLabel={t('card.menu', { name: driver.name })}
        />
      </header>

      <div className={styles.tags}>
        <span className={styles.typeChip}>
          {domainLabel('driverType', driver.driverType, driver.driverType)}
        </span>
        <StatusBadge
          value={driver.linkStatus as DriverLinkStatus}
          meta={DRIVER_LINK_STATUS_META}
          group="driverLinkStatus"
          // Design tô đỏ "Tạm khoá" (meta chung để xám — admin, mobile giữ nguyên).
          tone={driver.linkStatus === DRIVER_LINK_STATUS.SUSPENDED ? STATUS_COLOR.DANGER : undefined}
          className={styles.statusChip}
        />
      </div>
      <HistoryNote driver={driver} />

      <LicenceBox driver={driver} />

      <dl className={styles.facts}>
        <div className={styles.fact}>
          <dt>{t('card.activeTrips')}</dt>
          <dd>
            {driver.activeBookingCount > 0 ? (
              <button
                type="button"
                className={styles.factLink}
                onClick={() => onOpen(DRIVER_DETAIL_TAB.OVERVIEW)}
              >
                {t('activeBookings', { count: driver.activeBookingCount })}
              </button>
            ) : (
              <span className={styles.none}>{t('card.noTrips')}</span>
            )}
          </dd>
        </div>
        <div className={styles.fact}>
          <dt>{t('card.monthWage', { month: monthLabel })}</dt>
          <dd>
            {hasMonthWage ? (
              <button
                type="button"
                className={styles.factLink}
                onClick={() => onOpen(DRIVER_DETAIL_TAB.TRIPS)}
              >
                {t('card.monthWageValue', {
                  amount: fmt.money(driver.monthWageTotal),
                  count: driver.monthCompletedTrips,
                })}
              </button>
            ) : (
              <span className={styles.none}>{t('card.noTrips')}</span>
            )}
          </dd>
        </div>
      </dl>
      <DropsNote driver={driver} />

      <footer className={styles.actions}>
        {open && canManage ? <Button onClick={onEdit}>{t('card.editInfo')}</Button> : null}
        {canReinvite ? (
          <Button type="primary" onClick={onReinvite}>
            {t('actions.reinvite')}
          </Button>
        ) : null}
        <Button onClick={() => onOpen(DRIVER_DETAIL_TAB.TRIPS)}>{t('card.viewTrips')}</Button>
      </footer>
    </article>
  );
}

/** Khối "Bằng lái" — nền xám bo 12, ba trạng thái: đã xác thực · đang đọc ảnh · chưa có. */
function LicenceBox({ driver }: { driver: Driver }) {
  const t = useTranslations('Drivers.card');
  const fmt = useAppFormat();
  const domainLabel = useDomainLabel();
  const licence = driver.licence;

  if (licence.state !== DRIVER_LICENCE_STATE.VERIFIED) {
    const pending = licence.state === DRIVER_LICENCE_STATE.PENDING;
    return (
      <section className={styles.licence} aria-label={t('licence')}>
        <div className={styles.licenceHead}>
          <span className={styles.licenceTitle}>{t('licence')}</span>
        </div>
        <div className={styles.licenceEmpty}>
          <span className={styles.licenceEmptyIcon} aria-hidden="true">
            {pending ? <LoadingOutlined /> : <FileSearchOutlined />}
          </span>
          <span className={styles.licenceEmptyText}>
            <b>{pending ? t('pendingTitle') : t('noneTitle')}</b>
            <span>{pending ? t('pendingHint') : t('noneHint')}</span>
          </span>
        </div>
      </section>
    );
  }

  const mismatch = holderNameDiffers(licence.fullName, driver.name);
  const classes = licence.classes ?? [];
  return (
    <section className={styles.licence} aria-label={t('licence')}>
      <div className={styles.licenceHead}>
        <span className={styles.licenceTitle}>{t('licence')}</span>
        {mismatch ? (
          <span className={cx(styles.licenceState, styles.licenceWarn)}>
            <WarningFilled aria-hidden="true" />
            {t('needsCheck')}
          </span>
        ) : (
          <span className={cx(styles.licenceState, styles.licenceOk)}>
            <span className={styles.checkIcon} aria-hidden="true">
              <CheckOutlined />
            </span>
            {t('verified')}
          </span>
        )}
        {classes.length > 0 ? (
          <span className={styles.licenceClass}>
            {t('classes', { classes: classes.join(', ') })}
          </span>
        ) : null}
      </div>
      <dl className={styles.licenceRows}>
        <div>
          <dt>{t('holder')}</dt>
          <dd className={styles.holder}>{licence.fullName ?? '—'}</dd>
        </div>
        <div>
          <dt>{t('expiry')}</dt>
          {/* `expiresOn` là NGÀY LỊCH `YYYY-MM-DD` — `dateKey` không mượn nửa đêm theo máy. */}
          <dd>{licence.expiresOn ? fmt.dateKey(licence.expiresOn) : t('noExpiry')}</dd>
        </div>
        <div>
          <dt>{t('kind')}</dt>
          <dd>{licence.kind ? domainLabel('driverLicenceKind', licence.kind) : '—'}</dd>
        </div>
      </dl>
      {mismatch ? <p className={styles.licenceNote}>{t('nameMismatch')}</p> : null}
    </section>
  );
}

/** Dòng lịch sử: ai kết thúc liên kết; tài khoản đã có liên kết mới (thay cho nút "Mời lại"). */
function HistoryNote({ driver }: { driver: Driver }) {
  const t = useTranslations('Drivers');
  const notes = [
    driver.linkStatus === DRIVER_LINK_STATUS.ENDED && driver.endedByParty
      ? driver.endedByParty === DRIVER_LINK_END_PARTY.DRIVER
        ? t('endedBy.driver')
        : t('endedBy.employer')
      : null,
    driver.currentOpenLinkStatus
      ? driver.currentOpenLinkStatus === DRIVER_LINK_STATUS.INVITED
        ? t('reinvite.alreadyInvited')
        : t('reinvite.alreadyLinked')
      : null,
  ].filter(Boolean);
  return notes.length > 0 ? <p className={styles.meta}>{notes.join(' · ')}</p> : null;
}

/** Rút chuyến đã nhận trong 90 ngày (ADR 0074) — để bên thuê tự quyết tạm khoá. */
function DropsNote({ driver }: { driver: Driver }) {
  const t = useTranslations('Drivers');
  const fmt = useAppFormat();
  if (driver.dropCount === 0 && !driver.autoAssignCooldownUntil) return null;
  const parts = [
    driver.dropCount > 0 ? t('card.drops', { count: driver.dropCount }) : null,
    driver.criticalDropCount > 0
      ? t('card.dropsCritical', { count: driver.criticalDropCount })
      : null,
    driver.autoAssignCooldownUntil
      ? t('drops.cooldownUntil', { time: fmt.dateTime(driver.autoAssignCooldownUntil) })
      : null,
  ].filter(Boolean);
  return (
    <p className={cx(styles.drops, driver.criticalDropCount > 0 && styles.dropsCritical)}>
      <WarningFilled aria-hidden="true" />
      <span>{parts.join(' · ')}</span>
    </p>
  );
}
