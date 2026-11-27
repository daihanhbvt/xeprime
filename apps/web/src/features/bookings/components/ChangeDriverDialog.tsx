'use client';

import {
  CheckOutlined,
  CloseOutlined,
  PlusOutlined,
  SearchOutlined,
  UserOutlined,
  WarningFilled,
} from '@ant-design/icons';
import { yupResolver } from '@hookform/resolvers/yup';
import { Alert, App, Avatar, Button, Input, Radio, Select, Skeleton } from 'antd';
import { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslations } from 'next-intl';
import {
  DRIVER_LICENCE_STATE,
  DRIVER_ROSTER_KIND,
  DRIVER_SOURCE,
  PERMISSION,
  driverResponseWindowMinutes,
  type DriverRosterKind,
} from '@xeprime/types';
import { DialogForm } from '@/components/form/DialogForm';
import { ResponsiveDialog } from '@/components/overlay/ResponsiveDialog';
import { ALL_FILTER } from '@/constants/filters';
import { InternalDriverModal } from '@/features/drivers/components/InternalDriverModal';
import { useAssignableDrivers, useUpdateDriverWageSettings } from '@/features/drivers/hooks/use-drivers';
import { useAssignableInternalDrivers } from '@/features/drivers/hooks/use-internal-drivers';
import { usePermissions } from '@/hooks/use-permissions';
import { useAppFormat } from '@/i18n/use-app-format';
import { useDomainLabel } from '@/i18n/use-domain-label';
import { useErrorMessage } from '@/i18n/use-error-message';
import { cx } from '@/lib/cx';
import { useDriverWageQuote } from '../hooks/use-booking';
import { useAssignBookingDriver } from '../hooks/use-booking-mutations';
import type { BookingDetail, DriverWageQuote } from '../types';
import {
  DriverDailyWageFields,
  WAGE_SCOPE,
  useDailyWageSchema,
  type DailyWageValues,
} from './DriverDailyWageFields';
import styles from './ChangeDriverDialog.module.css';

const AVAILABILITY = { FREE: 'free', BUSY: 'busy' } as const;
type Availability = (typeof AVAILABILITY)[keyof typeof AVAILABILITY];
const WAGE_FORM_ID = 'assign-driver-wage-form';

/** Một người trong danh sách chọn — liên kết và nội bộ quy về một hình. */
interface Candidate {
  kind: DriverRosterKind;
  id: string;
  name: string;
  phone: string;
  avatarUrl: string | null;
  busy: boolean;
  /** Chỉ tài xế liên kết. */
  driverType: string | null;
  licenceState: string | null;
  licenceClasses: string[];
  expiredCount: number;
}

/**
 * Gán / đổi tài xế của một đơn có tài xế — Figma `24145:47780` (ADR 0063 · 0075 · 0108). Cột trái:
 * tìm + lọc trạng thái + loại, danh sách tài xế LIÊN KẾT và NỘI BỘ với bằng lái và độ rảnh theo
 * khung giờ của đơn ("Rảnh trong khung giờ" / "Rảnh - N lần không xác nhận" / "Trùng chuyến");
 * "+ Thêm tài xế nội bộ" ở đáy. Cột phải: người đang chọn + tiền công/ngày (chỉ tài xế liên kết).
 *
 * Người BẬN khung giờ không chọn được (server cũng chặn bằng EXCLUDE). Người chưa xác minh bằng lái
 * VẪN chọn được — server không chặn, giao diện cảnh báo đỏ để bên thuê đối chiếu giấy tờ khi giao xe.
 */
export function ChangeDriverDialog({
  booking,
  onClose,
}: {
  booking: BookingDetail;
  onClose: () => void;
}) {
  const t = useTranslations('Drivers.booking.picker');
  const tBooking = useTranslations('Drivers.booking');
  const tAssign = useTranslations('Drivers.wage.assign');
  const tCommon = useTranslations('Common');
  const { message } = App.useApp();
  const fmt = useAppFormat();
  const domainLabel = useDomainLabel();
  const errorMessage = useErrorMessage();
  const { has } = usePermissions();
  const assign = useAssignBookingDriver(booking.id);
  const current = booking.driver ?? null;
  const canAddInternal = has(PERMISSION.DRIVER_MANAGE);

  const [search, setSearch] = useState('');
  const [availability, setAvailability] = useState<Availability | typeof ALL_FILTER>(ALL_FILTER);
  const [kind, setKind] = useState<DriverRosterKind | typeof ALL_FILTER>(ALL_FILTER);
  const [selected, setSelected] = useState<{ kind: DriverRosterKind; id: string } | null>(null);
  const [creatingInternal, setCreatingInternal] = useState(false);

  const pickWindow = {
    pickupAt: booking.pickupAt,
    returnAt: booking.returnAt,
    excludeBookingId: booking.id,
  };
  const linkedQ = useAssignableDrivers(pickWindow);
  const internalQ = useAssignableInternalDrivers(pickWindow);
  const quote = useDriverWageQuote(booking.id, true);

  const candidates = useMemo<Candidate[]>(
    () => [
      ...(linkedQ.data ?? []).map((d) => ({
        kind: DRIVER_ROSTER_KIND.LINKED,
        id: d.id,
        name: d.name,
        phone: d.phone,
        avatarUrl: d.avatarUrl ?? null,
        busy: d.busy,
        driverType: d.driverType,
        licenceState: d.licenceState,
        licenceClasses: d.licenceClasses ?? [],
        expiredCount: d.expiredCount ?? 0,
      })),
      ...(internalQ.data ?? []).map((d) => ({
        kind: DRIVER_ROSTER_KIND.INTERNAL,
        id: d.id,
        name: d.name,
        phone: d.phone,
        avatarUrl: d.photoUrl ?? null,
        busy: d.busy,
        driverType: null,
        licenceState: null,
        licenceClasses: [],
        expiredCount: 0,
      })),
    ],
    [linkedQ.data, internalQ.data],
  );

  const isCurrent = (c: Candidate) =>
    current !== null &&
    current.id === c.id &&
    ((c.kind === DRIVER_ROSTER_KIND.LINKED && current.source === DRIVER_SOURCE.LINKED) ||
      (c.kind === DRIVER_ROSTER_KIND.INTERNAL && current.source === DRIVER_SOURCE.INTERNAL));

  const needle = search.trim().toLowerCase();
  const digits = needle.replace(/\D/g, '');
  const visible = candidates.filter(
    (c) =>
      (kind === ALL_FILTER || c.kind === kind) &&
      (availability === ALL_FILTER || (availability === AVAILABILITY.BUSY) === c.busy) &&
      (!needle ||
        c.name.toLowerCase().includes(needle) ||
        (digits.length >= 3 && c.phone.replace(/\D/g, '').includes(digits))),
  );
  const chosen = selected
    ? (candidates.find((c) => c.kind === selected.kind && c.id === selected.id) ?? null)
    : null;
  const loading = linkedQ.isLoading || internalQ.isLoading;
  const loadError = linkedQ.isError || internalQ.isError;
  const respondMinutes = driverResponseWindowMinutes(new Date(), new Date(booking.pickupAt));

  function assignInternal(id: string) {
    if (assign.isPending) return;
    assign.mutate(
      { internalDriverId: id },
      {
        onSuccess: () => {
          message.success(tBooking('internalAssigned'));
          onClose();
        },
        onError: (err) => message.error(errorMessage(err)),
      },
    );
  }

  const title = current ? t('titleChange') : t('titleAssign');
  const confirmLabel = current ? t('confirmChange') : t('confirmAssign');
  const linkedChosen = chosen?.kind === DRIVER_ROSTER_KIND.LINKED;

  return (
    <ResponsiveDialog
      title={
        <span>
          {title}
          <span className={styles.subtitle}>
            {t('subtitle', {
              code: booking.code,
              range: fmt.rentalRange(booking.pickupAt, booking.returnAt),
            })}
          </span>
        </span>
      }
      open
      size="xl"
      onClose={onClose}
      footer={
        <div className={styles.footer}>
          <Button onClick={onClose} disabled={assign.isPending}>
            {t('back')}
          </Button>
          {linkedChosen ? (
            <Button
              type="primary"
              htmlType="submit"
              form={WAGE_FORM_ID}
              icon={<CheckOutlined />}
              loading={assign.isPending}
              disabled={!quote.data}
            >
              {confirmLabel}
            </Button>
          ) : (
            <Button
              type="primary"
              icon={<CheckOutlined />}
              loading={assign.isPending}
              disabled={!chosen}
              onClick={() => chosen && assignInternal(chosen.id)}
            >
              {confirmLabel}
            </Button>
          )}
        </div>
      }
    >
      <div className={styles.layout}>
        <div className={styles.listColumn}>
          <div className={styles.filters}>
            <Input
              allowClear
              size="large"
              prefix={<SearchOutlined aria-hidden="true" />}
              placeholder={t('search')}
              aria-label={t('searchLabel')}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <Select
              size="large"
              aria-label={t('status')}
              value={availability}
              onChange={setAvailability}
              options={[
                { value: ALL_FILTER, label: t('statusAll') },
                { value: AVAILABILITY.FREE, label: t('statusFree') },
                { value: AVAILABILITY.BUSY, label: t('statusBusy') },
              ]}
            />
            <Select
              size="large"
              aria-label={t('type')}
              value={kind}
              onChange={setKind}
              options={[
                { value: ALL_FILTER, label: t('typeAll') },
                { value: DRIVER_ROSTER_KIND.LINKED, label: t('typeLinked') },
                { value: DRIVER_ROSTER_KIND.INTERNAL, label: t('typeInternal') },
              ]}
            />
          </div>

          {loading ? (
            <Skeleton active avatar paragraph={{ rows: 4 }} />
          ) : loadError ? (
            <Alert
              type="error"
              showIcon
              title={t('loadError')}
              action={
                <Button
                  size="small"
                  onClick={() => {
                    void linkedQ.refetch();
                    void internalQ.refetch();
                  }}
                >
                  {tCommon('actions.retry')}
                </Button>
              }
            />
          ) : visible.length === 0 ? (
            <p className={styles.empty}>
              {candidates.length === 0 ? t('emptyAll') : t('empty')}
            </p>
          ) : (
            <Radio.Group
              className={styles.list}
              aria-label={t('listLabel')}
              value={selected ? `${selected.kind}:${selected.id}` : null}
              onChange={(e) => {
                const [k, id] = String(e.target.value).split(':') as [DriverRosterKind, string];
                setSelected({ kind: k, id });
              }}
            >
              {visible.map((c) => {
                const assigned = isCurrent(c);
                const disabled = c.busy || assigned;
                const value = `${c.kind}:${c.id}`;
                const active = selected?.kind === c.kind && selected.id === c.id;
                return (
                  <label
                    key={value}
                    className={cx(
                      styles.row,
                      active && styles.rowActive,
                      disabled && styles.rowDisabled,
                    )}
                  >
                    <Radio value={value} disabled={disabled} />
                    <Avatar
                      size={36}
                      src={c.avatarUrl ?? undefined}
                      icon={c.avatarUrl ? undefined : <UserOutlined />}
                    />
                    <span className={styles.who}>
                      <span className={styles.name}>{c.name}</span>
                      <span className={styles.meta}>
                        {c.phone}
                        {' - '}
                        {c.kind === DRIVER_ROSTER_KIND.INTERNAL
                          ? t('internal')
                          : domainLabel('driverType', c.driverType ?? '', c.driverType ?? '')}
                      </span>
                    </span>
                    <span className={styles.badgeCell}>
                      {c.kind === DRIVER_ROSTER_KIND.LINKED ? <LicenceBadge candidate={c} /> : null}
                    </span>
                    <span
                      className={cx(
                        styles.availability,
                        assigned
                          ? styles.availInfo
                          : c.busy
                            ? styles.availBusy
                            : c.expiredCount > 0
                              ? styles.availWarn
                              : styles.availFree,
                      )}
                    >
                      {assigned
                        ? t('current')
                        : c.busy
                          ? t('busy')
                          : c.expiredCount > 0
                            ? t('freeExpired', { count: c.expiredCount })
                            : t('free')}
                    </span>
                  </label>
                );
              })}
            </Radio.Group>
          )}

          {canAddInternal ? (
            <Button
              type="link"
              className={styles.addInternal}
              icon={<PlusOutlined />}
              onClick={() => setCreatingInternal(true)}
            >
              {tBooking('addInternal')}
            </Button>
          ) : null}
        </div>

        <aside className={styles.side} aria-label={t('sideTitle')}>
          <h3 className={styles.sideTitle}>{t('sideTitle')}</h3>
          {!chosen ? (
            <p className={styles.empty}>{t('noSelection')}</p>
          ) : (
            <>
              <div className={styles.chosen}>
                <Avatar
                  size={36}
                  src={chosen.avatarUrl ?? undefined}
                  icon={chosen.avatarUrl ? undefined : <UserOutlined />}
                />
                <span className={styles.who}>
                  <span className={styles.name}>{chosen.name}</span>
                  <span className={styles.meta}>{chosen.phone}</span>
                </span>
                {chosen.kind === DRIVER_ROSTER_KIND.LINKED ? (
                  <LicenceBadge candidate={chosen} compact />
                ) : null}
              </div>
              {chosen.kind === DRIVER_ROSTER_KIND.LINKED ? (
                <>
                  {chosen.licenceState !== DRIVER_LICENCE_STATE.VERIFIED ? (
                    <Alert type="warning" showIcon title={t('unverifiedWarning')} />
                  ) : null}
                  {quote.isLoading ? (
                    <Skeleton active paragraph={{ rows: 3 }} />
                  ) : quote.isError || !quote.data ? (
                    <Alert
                      type="error"
                      showIcon
                      title={tAssign('loadError')}
                      action={
                        <Button size="small" onClick={() => void quote.refetch()}>
                          {tAssign('retry')}
                        </Button>
                      }
                    />
                  ) : (
                    <LinkedWageForm
                      // Mỗi người một form — số vừa gõ cho người A không mang sang người B.
                      key={chosen.id}
                      bookingId={booking.id}
                      driverId={chosen.id}
                      quote={quote.data}
                      respondMinutes={respondMinutes}
                      onAssigned={onClose}
                    />
                  )}
                </>
              ) : (
                <p className={styles.note}>{t('internalNote')}</p>
              )}
            </>
          )}
        </aside>
      </div>

      <InternalDriverModal
        open={creatingInternal}
        driver={null}
        onClose={() => setCreatingInternal(false)}
        onSaved={(created) => {
          setKind(ALL_FILTER);
          setSelected({ kind: DRIVER_ROSTER_KIND.INTERNAL, id: created.id });
        }}
      />
    </ResponsiveDialog>
  );
}

/** "✓ Bằng lái B2 - Đã xác thực" / "✕ Chưa xác minh bằng lái" (đỏ) / đang đọc ảnh (xám). */
function LicenceBadge({ candidate, compact = false }: { candidate: Candidate; compact?: boolean }) {
  const t = useTranslations('Drivers.booking.picker');
  const tCard = useTranslations('Drivers.booking.card');
  if (candidate.licenceState === DRIVER_LICENCE_STATE.VERIFIED) {
    const classes = candidate.licenceClasses.join(', ');
    return (
      <span className={cx(styles.licence, styles.licenceOk)}>
        <CheckOutlined aria-hidden="true" />
        {compact
          ? classes
            ? tCard('licence', { classes })
            : t('licenceVerifiedNoClass')
          : classes
            ? t('licenceVerified', { classes })
            : t('licenceVerifiedNoClass')}
      </span>
    );
  }
  if (candidate.licenceState === DRIVER_LICENCE_STATE.PENDING) {
    return <span className={cx(styles.licence, styles.licenceMuted)}>{t('licencePending')}</span>;
  }
  return (
    <span className={cx(styles.licence, styles.licenceBad)}>
      <CloseOutlined aria-hidden="true" />
      {t('licenceNone')}
    </span>
  );
}

/**
 * Tiền công khi gán tài xế LIÊN KẾT (ADR 0075): nhập MỨC/NGÀY — tự điền mức chung — thấy tổng
 * `× N ngày`; khác mức chung thì chọn chỉ chuyến này hay cả các lượt gán sau. Tài xế thấy tổng
 * trước khi nhận; chủ xe trả trực tiếp cho tài xế.
 */
function LinkedWageForm({
  bookingId,
  driverId,
  quote,
  respondMinutes,
  onAssigned,
}: {
  bookingId: string;
  driverId: string;
  quote: DriverWageQuote;
  respondMinutes: number;
  onAssigned: () => void;
}) {
  const t = useTranslations('Drivers.booking.picker');
  const tAssign = useTranslations('Drivers.wage.assign');
  const tForm = useTranslations('Drivers.wage.form');
  const tBooking = useTranslations('Drivers.booking');
  const fmt = useAppFormat();
  const { message } = App.useApp();
  const errorMessage = useErrorMessage();
  const { has } = usePermissions();
  const assign = useAssignBookingDriver(bookingId);
  const saveDefault = useUpdateDriverWageSettings();
  const canSetDefault = has(PERMISSION.DRIVER_MANAGE);

  const schema = useDailyWageSchema(quote);
  const { control, handleSubmit } = useForm<DailyWageValues>({
    resolver: yupResolver(schema),
    defaultValues: {
      // Chỉ mức chung của gian hàng được tự điền — mức gợi ý của nền tảng chỉ là lời nhắc.
      daily: quote.dailyWage === null ? undefined : Number(quote.dailyWage),
      scope: WAGE_SCOPE.TRIP,
      reason: '',
    },
  });
  const busy = assign.isPending || saveDefault.isPending;

  async function submit(values: DailyWageValues) {
    if (busy) return;
    const daily = values.daily;
    const asDefault =
      canSetDefault && values.scope === WAGE_SCOPE.DEFAULT && String(daily) !== quote.dailyWage;
    try {
      // Mức chung TRƯỚC: lượt gán vẫn gửi đúng tổng đã thấy, không phụ thuộc mức chung.
      if (asDefault) await saveDefault.mutateAsync({ dailyWage: String(daily) });
      await assign.mutateAsync({ driverId, wageAmount: String(daily * quote.days) });
      message.success(asDefault ? tForm('savedWithDefault') : tBooking('assigned'));
      onAssigned();
    } catch (err) {
      message.error(errorMessage(err));
    }
  }

  return (
    <DialogForm
      id={WAGE_FORM_ID}
      className={styles.form}
      labelPosition="top"
      onSubmit={(e) => void handleSubmit(submit)(e)}
    >
      <DriverDailyWageFields
        control={control}
        quote={quote}
        canSetDefault={canSetDefault}
        label={t('wageField')}
      />
      <p className={styles.note}>{tAssign('paidDirect')}</p>
      <p className={styles.deadline}>
        <WarningFilled aria-hidden="true" />{' '}
        {t('respondWindow', { duration: fmt.minutesDuration(respondMinutes) })}
      </p>
    </DialogForm>
  );
}
