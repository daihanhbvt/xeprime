'use client';

import {
  CheckOutlined,
  FileSearchOutlined,
  LoadingOutlined,
  UserOutlined,
  WarningFilled,
} from '@ant-design/icons';
import { Avatar, Button } from 'antd';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
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
import type { Driver, InternalDriver } from '../types';
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
  detailHref,
  tripsHref,
  onReinvite,
}: {
  driver: Driver;
  /** Nhãn tháng của dòng tiền công ("11/2026") — cùng tháng với bộ chọn trên hàng lọc. */
  monthLabel: string;
  canManage: boolean;
  /** Mục của menu "…" — trang dựng vì các lượt ghi (tạm khoá, kết thúc) sống ở trang. */
  menu: RowAction[];
  /** Trang chi tiết (tab Tổng quan) — `null` khi trang không mở ở ngữ cảnh này. */
  detailHref: string | null;
  /** Trang chi tiết, tab "Chuyến & tiền công". */
  tripsHref: string | null;
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
        <IdentityLink href={detailHref} label={t('card.openDetail', { name: driver.name })}>
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
        </IdentityLink>
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
            {driver.activeBookingCount > 0 && detailHref ? (
              <Link href={detailHref} className={styles.factLink}>
                {t('activeBookings', { count: driver.activeBookingCount })}
              </Link>
            ) : driver.activeBookingCount > 0 ? (
              t('activeBookings', { count: driver.activeBookingCount })
            ) : (
              <span className={styles.none}>{t('card.noTrips')}</span>
            )}
          </dd>
        </div>
        <div className={styles.fact}>
          <dt>{t('card.monthWage', { month: monthLabel })}</dt>
          <dd>
            {hasMonthWage ? (
              <MaybeLink href={tripsHref} className={styles.factLink}>
                {t('card.monthWageValue', {
                  amount: fmt.money(driver.monthWageTotal),
                  count: driver.monthCompletedTrips,
                })}
              </MaybeLink>
            ) : (
              <span className={styles.none}>{t('card.noTrips')}</span>
            )}
          </dd>
        </div>
      </dl>
      <DropsNote driver={driver} />

      <footer className={styles.actions}>
        {/* Sửa thông tin nằm ở trang chi tiết (người dùng 25/11/2026) — thẻ chỉ dẫn tới đó. */}
        {detailHref && !canReinvite ? <Button href={detailHref}>{t('card.detail')}</Button> : null}
        {canReinvite ? (
          <Button type="primary" onClick={onReinvite}>
            {t('actions.reinvite')}
          </Button>
        ) : null}
        {tripsHref ? <Button href={tripsHref}>{t('card.viewTrips')}</Button> : null}
      </footer>
    </article>
  );
}

/** Khối "Bằng lái" — nền xám bo 12, ba trạng thái: đã xác thực · đang đọc ảnh · chưa có. */
function LicenceBox({ driver }: { driver: Driver }) {
  const t = useTranslations('Drivers.card');
  const tCheck = useTranslations('Drivers.licenceCheck');
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

  // Bên thuê đã "đối chiếu" đúng bằng này ⇒ không còn việc cần làm (server cũng bỏ khỏi bộ lọc).
  const checked = Boolean(driver.licenceCheck);
  const mismatch = holderNameDiffers(licence.fullName, driver.name) && !checked;
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
            {checked ? tCheck('checked') : t('verified')}
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
          <dd className={styles.holder}>{licence.fullName ?? '-'}</dd>
        </div>
        <div>
          <dt>{t('expiry')}</dt>
          {/* `expiresOn` là NGÀY LỊCH `YYYY-MM-DD` — `dateKey` không mượn nửa đêm theo máy. */}
          <dd>{licence.expiresOn ? fmt.dateKey(licence.expiresOn) : t('noExpiry')}</dd>
        </div>
        <div>
          <dt>{t('kind')}</dt>
          <dd>{licence.kind ? domainLabel('driverLicenceKind', licence.kind) : '-'}</dd>
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

/** Ảnh + tên + SĐT là MỘT link tới trang chi tiết — vùng bấm rộng; ngoài ngữ cảnh có trang thì là khối tĩnh. */
function IdentityLink({
  href,
  label,
  children,
}: {
  href: string | null;
  label: string;
  children: ReactNode;
}) {
  return href ? (
    <Link href={href} className={styles.identity} aria-label={label}>
      {children}
    </Link>
  ) : (
    <span className={cx(styles.identity, styles.identityStatic)}>{children}</span>
  );
}

function MaybeLink({
  href,
  className,
  children,
}: {
  href: string | null;
  className?: string;
  children: ReactNode;
}) {
  return href ? (
    <Link href={href} className={className}>
      {children}
    </Link>
  ) : (
    <>{children}</>
  );
}

/**
 * Thẻ MỘT tài xế NỘI BỘ (ADR 0108) ở cùng lưới — Figma `23737:41945` (thẻ "Nhân viên nội bộ"): viên
 * hình thức, khối "Trạng thái" thay cho khối bằng lái (người nội bộ không có bằng trên hệ thống),
 * chuyến đang gán, hai nút. Không tiền công, không lời mời.
 */
export function InternalDriverCard({
  driver,
  menu,
  detailHref,
}: {
  driver: InternalDriver;
  menu: RowAction[];
  detailHref: string | null;
}) {
  const t = useTranslations('Drivers');
  const archived = driver.archivedAt !== null;

  return (
    <article className={styles.card} aria-label={driver.name}>
      <header className={styles.head}>
        <IdentityLink href={detailHref} label={t('card.openDetail', { name: driver.name })}>
          <Avatar
            size={48}
            src={driver.photoUrl ?? undefined}
            icon={driver.photoUrl ? undefined : <UserOutlined />}
            className={styles.avatar}
          />
          <span className={styles.who}>
            <span className={styles.name}>{driver.name}</span>
            <span className={styles.contact}>
              <span>{driver.phone}</span>
            </span>
          </span>
        </IdentityLink>
        <RowActions
          actions={menu}
          maxInline={0}
          overflowLabel={t('card.menu', { name: driver.name })}
        />
      </header>

      <div className={styles.tags}>
        <span className={styles.typeChip}>{t('roster.typeInternal')}</span>
      </div>

      <div className={styles.statusBox}>
        <span>{t('roster.statusLabel')}</span>
        <span className={archived ? styles.statusArchived : styles.statusActive}>
          {archived ? t('roster.internalArchived') : t('roster.internalActive')}
        </span>
      </div>

      <dl className={styles.facts}>
        <div className={styles.fact}>
          <dt>{t('card.activeTrips')}</dt>
          <dd>
            {driver.activeTripCount > 0 ? (
              <MaybeLink href={detailHref} className={styles.factLink}>
                {t('activeBookings', { count: driver.activeTripCount })}
              </MaybeLink>
            ) : (
              <span className={styles.none}>{t('card.noTrips')}</span>
            )}
          </dd>
        </div>
      </dl>
      {driver.note ? <p className={styles.note}>{driver.note}</p> : null}

      <footer className={styles.actions}>
        {detailHref ? <Button href={detailHref}>{t('card.detail')}</Button> : null}
      </footer>
    </article>
  );
}
