import { useEffect, useMemo, useState } from 'react';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import {
  DRIVER_LICENCE_STATE,
  DRIVER_ROSTER_KIND,
  DRIVER_SOURCE,
  type DriverRosterKind,
} from '@xeprime/types';
import { LIST_SEPARATOR } from '@xeprime/domain';
import { Avatar } from '@/components/ui/Avatar';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Button } from '@/components/ui/Button';
import { Callout } from '@/components/ui/Callout';
import { SelectControl } from '@/components/ui/SelectControl';
import { Skeleton } from '@/components/ui/Skeleton';
import { useAssignableInternalDrivers } from '@/features/drivers/hooks/use-internal-drivers';
import { useAppFormat } from '@/i18n/use-app-format';
import { useDomainLabel } from '@/i18n/domain';
import { useColors } from '@/theme/ThemeProvider';
import { fontSize, space } from '@/theme/tokens';
import { useAssignableDrivers, useDriverWageQuote } from '../hooks/use-bookings';
import { AssignDriverWageStep, type AssignWageStepState } from './AssignDriverWageSheet';
import { InfoHint } from '@/components/ui/InfoHint';
import type { BookingDetail } from '../api';

/** Một ứng viên của bộ chọn — tài xế liên kết hoặc tài xế nội bộ (web `ChangeDriverDialog.Candidate`). */
export interface DriverCandidate {
  kind: DriverRosterKind;
  id: string;
  name: string;
  phone: string;
  avatarUrl: string | null;
  busy: boolean;
  driverType: string | null;
  licenceState: string | null;
  licenceClasses: string[];
  expiredCount: number;
}

/**
 * Bộ chọn tài xế của đơn — native port of web `ChangeDriverDialog` (25/11/2026): MỘT danh sách gộp
 * tài xế LIÊN KẾT (ADR 0063) + NỘI BỘ (ADR 0108) cho khung giờ của đơn, tìm theo tên/SĐT, lọc trạng
 * thái (rảnh / trùng chuyến) và loại. Người bận hoặc đang gán hiện mờ, không chọn được. Có quyền
 * `drivers.manage` thì "Thêm tài xế nội bộ" ngay tại đây — người vừa thêm được chọn luôn.
 *
 * Chọn xong, màn gọi quyết bước kế: liên kết ⇒ tấm tiền công; nội bộ ⇒ xác nhận rồi gán thẳng.
 * `linkedOnly` (hộp Sửa đơn) — chỉ tài xế liên kết, như `BookingFormDialog` của web.
 */
export function AssignDriverSheet({
  open,
  onClose,
  booking,
  pending = false,
  selectedId,
  linkedOnly = false,
  prefetch = false,
  onSelect,
  onAssigned,
}: {
  /** Tải sẵn danh sách lúc vào màn (đóng tấm vẫn giữ cache) - mở tấm là có ngay, làm mới ngầm. */
  prefetch?: boolean;
  open: boolean;
  onClose: () => void;
  booking: BookingDetail;
  pending?: boolean;
  selectedId?: string | null;
  linkedOnly?: boolean;
  onSelect: (candidate: DriverCandidate) => void;
  /**
   * Có ⇒ tài xế LIÊN KẾT đi tiếp sang bước tiền công NGAY TRONG tấm này (không mở tấm mới);
   * gán xong gọi hàm này. Không có ⇒ giữ hành vi cũ: `onSelect` cho mọi người.
   */
  onAssigned?: () => void;
}) {
  const colors = useColors();
  const t = useTranslations('Drivers.booking.picker');
  const tBooking = useTranslations('Drivers.booking');
  const tActions = useTranslations('Common.actions');
  const fmt = useAppFormat();
  const domainLabel = useDomainLabel();
  const [search, setSearch] = useState('');
  const [pickedKey, setPickedKey] = useState<string | null>(null);
  // Bước 2 (tiền công) trong cùng tấm: người đã chọn + điều khiển do bước con báo lên.
  const [wageState, setWageState] = useState<AssignWageStepState | null>(null);
  const tWage = useTranslations('Drivers.wage.assign');
  // Cùng khoá cache với màn chi tiết (đã tải sẵn) - sang bước 2 là có số ngay.
  const wageQuote = useDriverWageQuote(booking.id, Boolean(onAssigned) && (open || prefetch));

  const window = { pickupAt: booking.pickupAt, returnAt: booking.returnAt, excludeBookingId: booking.id };
  const linkedQ = useAssignableDrivers(window, open || prefetch);
  const internalQ = useAssignableInternalDrivers(window, (open || prefetch) && !linkedOnly);
  // Mở tấm: hiện ngay dữ liệu cũ, làm mới ngầm (không skeleton).
  useEffect(() => {
    if (!open) return;
    void linkedQ.refetch();
    if (!linkedOnly) void internalQ.refetch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  const current = booking.driver ?? null;

  const candidates = useMemo<DriverCandidate[]>(
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
      ...(linkedOnly ? [] : (internalQ.data ?? [])).map((d) => ({
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
    [linkedQ.data, internalQ.data, linkedOnly],
  );

  /** Dòng phụ của một lựa chọn: SĐT · loại · bằng lái · rảnh/trùng chuyến (web `ChangeDriverDialog`). */
  const candidateHint = (c: DriverCandidate, isCur: boolean): string => {
    const internal = c.kind === DRIVER_ROSTER_KIND.INTERNAL;
    const classes = c.licenceClasses.join(', ');
    const licence = internal
      ? null
      : c.licenceState === DRIVER_LICENCE_STATE.VERIFIED
        ? classes
          ? t('licenceVerified', { classes })
          : t('licenceVerifiedNoClass')
        : c.licenceState === DRIVER_LICENCE_STATE.PENDING
          ? t('licencePending')
          : t('licenceNone');
    const availability = isCur
      ? t('current')
      : c.busy
        ? t('busy')
        : c.expiredCount > 0
          ? t('freeExpired', { count: c.expiredCount })
          : t('free');
    return [
      c.phone,
      internal ? t('internal') : domainLabel('driverType', c.driverType ?? '', c.driverType ?? ''),
      licence,
      availability,
    ]
      .filter(Boolean)
      .join(LIST_SEPARATOR);
  };

  /* "Đang gán" = đúng người + đúng nguồn (id liên kết và id danh bạ không chung không gian). */
  const isCurrent = (c: DriverCandidate) =>
    selectedId !== undefined
      ? c.kind === DRIVER_ROSTER_KIND.LINKED && selectedId === c.id
      : current !== null &&
        current.id === c.id &&
        ((c.kind === DRIVER_ROSTER_KIND.LINKED && current.source === DRIVER_SOURCE.LINKED) ||
          (c.kind === DRIVER_ROSTER_KIND.INTERNAL && current.source === DRIVER_SOURCE.INTERNAL));

  const needle = search.trim().toLowerCase();
  const digits = needle.replace(/\D/g, '');
  const visible = candidates.filter(
    (c) =>
      (!needle ||
        c.name.toLowerCase().includes(needle) ||
        (digits.length >= 3 && c.phone.replace(/\D/g, '').includes(digits))),
  );
  const loading = linkedQ.isLoading || (!linkedOnly && internalQ.isLoading);
  const loadError = linkedQ.isError || (!linkedOnly && internalQ.isError);

  const keyOf = (c: DriverCandidate) => `${c.kind}:${c.id}`;
  // Mặc định ô chọn hiện người đang gán; "Tiếp tục" chỉ bật khi chọn người KHÁC.
  const currentKey = candidates.find((c) => isCurrent(c));
  const shownKey = pickedKey ?? (currentKey ? keyOf(currentKey) : null);
  const pickedRaw = candidates.find((c) => keyOf(c) === pickedKey) ?? null;
  const picked = pickedRaw && !isCurrent(pickedRaw) ? pickedRaw : null;
  const options = visible.map((c) => ({
    value: keyOf(c),
    label: c.name,
    hint: candidateHint(c, isCurrent(c)),
    leading: <Avatar name={c.name} url={c.avatarUrl} size={36} />,
    valueLeading: <Avatar name={c.name} url={c.avatarUrl} size={24} />,
    // Người trùng chuyến / đang gán: hiện mờ, không chọn được (web).
    disabled: c.busy || isCurrent(c),
  }));

  // MỘT bước (người dùng 28/11/2026): chọn tài xế LIÊN KẾT ⇒ ô tiền công + phạm vi áp dụng hiện
  // ngay bên dưới ô chọn, nút chân tấm gán luôn. Tài xế nội bộ (không tiền công) đi `onSelect`.
  const wageFor = onAssigned && picked?.kind === DRIVER_ROSTER_KIND.LINKED ? picked : null;
  const reset = () => {
    setPickedKey(null);
    setWageState(null);
  };
  const title = current ? t('titleChange') : t('titleAssign');
  const wageBusy = wageFor ? (wageState?.busy ?? false) : false;

  return (
    <BottomSheet
      open={open}
      onClose={() => {
        reset();
        onClose();
      }}
      title={title}
      {...(wageFor && wageState
        ? { titleAdornment: <InfoHint content={wageState.notes} label={title} /> }
        : {})}
      subtitle={t('subtitle', {
        code: booking.code,
        range: fmt.rentalRange(booking.pickupAt, booking.returnAt),
      })}
      chrome="v2"
      headerDivider
      footer={
        <XStack gap={space.md}>
          <YStack f={1}>
            <Button
              label={t('back')}
              variant="outline"
              disabled={pending || wageBusy}
              onPress={() => {
                reset();
                onClose();
              }}
            />
          </YStack>
          <YStack f={1}>
            <Button
              label={wageFor ? tWage('submit') : tActions('next')}
              variant="gradient"
              loading={pending || wageBusy}
              disabled={!picked || (wageFor !== null && !wageState)}
              onPress={() => {
                if (!picked) return;
                if (wageFor) {
                  wageState?.submit();
                  return;
                }
                setPickedKey(null);
                onSelect(picked);
              }}
            />
          </YStack>
        </XStack>
      }
    >
      <YStack gap={space.md}>
        {loading ? (
          <Skeleton height={64} />
        ) : loadError ? (
          <Callout tone="danger" title={t('loadError')}>
            <XStack>
              <Button
                label={tActions('retry')}
                variant="secondary"
                size="sm"
                block={false}
                onPress={() => {
                  void linkedQ.refetch();
                  if (!linkedOnly) void internalQ.refetch();
                }}
              />
            </XStack>
          </Callout>
        ) : candidates.length === 0 ? (
          <Text col={colors.textMuted} fos={fontSize.bodySm}>
            {linkedOnly ? tBooking('pickerEmpty') : t('emptyAll')}
          </Text>
        ) : (
          <SelectControl
            label={t('sideTitle')}
            value={shownKey}
            options={options}
            onChange={(key) => {
              setWageState(null);
              setPickedKey(key);
            }}
            placeholder={t('noSelectionApp')}
            onSearch={setSearch}
            searchPlaceholder={t('search')}
            emptyText={t('empty')}
            required
          />
        )}
        {wageFor ? (
          wageQuote.data ? (
            <AssignDriverWageStep
              key={wageFor.id}
              bookingId={booking.id}
              driver={wageFor}
              licenceUnverified={
                wageFor.licenceState != null && wageFor.licenceState !== DRIVER_LICENCE_STATE.VERIFIED
              }
              pickupAt={booking.pickupAt}
              quote={wageQuote.data}
              onState={setWageState}
              onAssigned={() => {
                reset();
                onAssigned?.();
              }}
            />
          ) : wageQuote.isError ? (
            <Callout tone="danger" title={tWage('loadError')}>
              <XStack>
                <Button
                  label={tActions('retry')}
                  variant="secondary"
                  size="sm"
                  block={false}
                  onPress={() => void wageQuote.refetch()}
                />
              </XStack>
            </Callout>
          ) : (
            <Skeleton height={120} />
          )
        ) : null}
      </YStack>
    </BottomSheet>
  );
}
