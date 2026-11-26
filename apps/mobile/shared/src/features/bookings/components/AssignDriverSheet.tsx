import { Ionicons } from '@/components/icons/Ionicons';
import { memo, useMemo, useState } from 'react';
import { Pressable } from 'react-native';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import {
  DRIVER_LICENCE_STATE,
  DRIVER_ROSTER_KIND,
  DRIVER_SOURCE,
  PERMISSION,
  STATUS_COLOR,
  type DriverRosterKind,
} from '@xeprime/types';
import { LIST_SEPARATOR } from '@xeprime/domain';
import { Avatar } from '@/components/ui/Avatar';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Button } from '@/components/ui/Button';
import { Callout } from '@/components/ui/Callout';
import { Chip } from '@/components/ui/Chip';
import { SearchInput } from '@/components/ui/SearchInput';
import { Skeleton } from '@/components/ui/Skeleton';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { usePermissions } from '@/features/auth/hooks/use-permissions';
import { InternalDriverFormSheet } from '@/features/drivers/components/InternalDriverFormSheet';
import { useAssignableInternalDrivers } from '@/features/drivers/hooks/use-internal-drivers';
import { useAppFormat } from '@/i18n/use-app-format';
import { useDomainLabel } from '@/i18n/domain';
import { useColors } from '@/theme/ThemeProvider';
import { fontSize, fontWeight, iconSize, radius, sizing, space } from '@/theme/tokens';
import { useAssignableDrivers } from '../hooks/use-bookings';
import type { BookingDetail } from '../api';

const ALL = 'all';
const AVAILABILITY = { FREE: 'free', BUSY: 'busy' } as const;
type Availability = (typeof AVAILABILITY)[keyof typeof AVAILABILITY] | typeof ALL;

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
  onSelect,
}: {
  open: boolean;
  onClose: () => void;
  booking: BookingDetail;
  pending?: boolean;
  selectedId?: string | null;
  linkedOnly?: boolean;
  onSelect: (candidate: DriverCandidate) => void;
}) {
  const colors = useColors();
  const t = useTranslations('Drivers.booking.picker');
  const tBooking = useTranslations('Drivers.booking');
  const tActions = useTranslations('Common.actions');
  const fmt = useAppFormat();
  const { has } = usePermissions();
  const canAddInternal = !linkedOnly && has(PERMISSION.DRIVER_MANAGE);
  const [search, setSearch] = useState('');
  const [availability, setAvailability] = useState<Availability>(ALL);
  const [kind, setKind] = useState<DriverRosterKind | typeof ALL>(ALL);
  const [creatingInternal, setCreatingInternal] = useState(false);

  const window = { pickupAt: booking.pickupAt, returnAt: booking.returnAt, excludeBookingId: booking.id };
  const linkedQ = useAssignableDrivers(window, open);
  const internalQ = useAssignableInternalDrivers(window, open && !linkedOnly);
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
      (kind === ALL || c.kind === kind) &&
      (availability === ALL || (availability === AVAILABILITY.BUSY) === c.busy) &&
      (!needle ||
        c.name.toLowerCase().includes(needle) ||
        (digits.length >= 3 && c.phone.replace(/\D/g, '').includes(digits))),
  );
  const loading = linkedQ.isLoading || (!linkedOnly && internalQ.isLoading);
  const loadError = linkedQ.isError || (!linkedOnly && internalQ.isError);

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title={current ? t('titleChange') : t('titleAssign')}
      subtitle={t('subtitle', {
        code: booking.code,
        range: fmt.rentalRange(booking.pickupAt, booking.returnAt),
      })}
    >
      <YStack gap={space.sm}>
        <SearchInput value={search} onChange={setSearch} label={t('searchLabel')} placeholder={t('search')} />
        <XStack gap={space.xs} flexWrap="wrap" accessibilityLabel={t('status')}>
          {([ALL, AVAILABILITY.FREE, AVAILABILITY.BUSY] as const).map((value) => (
            <Chip
              key={value}
              size="sm"
              selected={availability === value}
              label={
                value === ALL ? t('statusAll') : value === AVAILABILITY.FREE ? t('statusFree') : t('statusBusy')
              }
              onPress={() => setAvailability(value)}
            />
          ))}
        </XStack>
        {linkedOnly ? null : (
          <XStack gap={space.xs} flexWrap="wrap" accessibilityLabel={t('type')}>
            {([ALL, DRIVER_ROSTER_KIND.LINKED, DRIVER_ROSTER_KIND.INTERNAL] as const).map((value) => (
              <Chip
                key={value}
                size="sm"
                selected={kind === value}
                label={
                  value === ALL
                    ? t('typeAll')
                    : value === DRIVER_ROSTER_KIND.LINKED
                      ? t('typeLinked')
                      : t('typeInternal')
                }
                onPress={() => setKind(value)}
              />
            ))}
          </XStack>
        )}

        {loading ? (
          <YStack gap={space.sm}>
            <Skeleton height={56} />
            <Skeleton height={56} />
            <Skeleton height={56} />
          </YStack>
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
        ) : visible.length === 0 ? (
          <Text col={colors.textMuted} fos={fontSize.bodySm}>
            {candidates.length === 0
              ? linkedOnly
                ? tBooking('pickerEmpty')
                : t('emptyAll')
              : t('empty')}
          </Text>
        ) : (
          <YStack gap={space.sm} accessibilityLabel={t('listLabel')}>
            {visible.map((c) => (
              <CandidateRow
                key={`${c.kind}:${c.id}`}
                candidate={c}
                current={isCurrent(c)}
                disabled={pending}
                onPress={onSelect}
              />
            ))}
          </YStack>
        )}

        {canAddInternal ? (
          <XStack>
            <Button
              label={tBooking('addInternal')}
              icon="add"
              variant="ghost"
              size="sm"
              block={false}
              onPress={() => setCreatingInternal(true)}
            />
          </XStack>
        ) : null}
      </YStack>

      {canAddInternal ? (
        <InternalDriverFormSheet
          open={creatingInternal}
          driver={null}
          onClose={() => setCreatingInternal(false)}
          onSaved={(created) =>
            // Web chọn luôn người vừa thêm — ở app, chuyển thẳng sang bước xác nhận gán.
            onSelect({
              kind: DRIVER_ROSTER_KIND.INTERNAL,
              id: created.id,
              name: created.name,
              phone: created.phone,
              avatarUrl: created.photoUrl ?? null,
              busy: false,
              driverType: null,
              licenceState: null,
              licenceClasses: [],
              expiredCount: 0,
            })
          }
        />
      ) : null}
    </BottomSheet>
  );
}

const CandidateRow = memo(function CandidateRow({
  candidate,
  current,
  disabled,
  onPress,
}: {
  candidate: DriverCandidate;
  current: boolean;
  disabled: boolean;
  onPress: (candidate: DriverCandidate) => void;
}) {
  const colors = useColors();
  const t = useTranslations('Drivers.booking.picker');
  const domainLabel = useDomainLabel();
  const unavailable = candidate.busy || current || disabled;
  const internal = candidate.kind === DRIVER_ROSTER_KIND.INTERNAL;
  const classes = candidate.licenceClasses.join(', ');

  const availabilityText = current
    ? t('current')
    : candidate.busy
      ? t('busy')
      : candidate.expiredCount > 0
        ? t('freeExpired', { count: candidate.expiredCount })
        : t('free');
  const availabilityColor = current
    ? STATUS_COLOR.INFO
    : candidate.busy
      ? STATUS_COLOR.DANGER
      : candidate.expiredCount > 0
        ? STATUS_COLOR.WARNING
        : STATUS_COLOR.SUCCESS;

  return (
    <Pressable
      onPress={() => onPress(candidate)}
      disabled={unavailable}
      accessibilityRole="button"
      accessibilityState={{ selected: current, disabled: unavailable }}
    >
      <XStack
        ai="center"
        gap={space.md}
        p={space.md}
        br={radius.lg}
        bw={1}
        bg={current ? colors.surfaceSelected : colors.surface}
        bc={current ? colors.primary : colors.border}
        minHeight={sizing.touchTarget}
        opacity={candidate.busy || disabled ? 0.45 : 1}
      >
        <Avatar name={candidate.name} url={candidate.avatarUrl} size={36} />
        <YStack f={1} gap={2} minWidth={0}>
          <Text col={colors.text} fos={fontSize.body} fow={fontWeight.medium} numberOfLines={1}>
            {candidate.name}
          </Text>
          <Text col={colors.textMuted} fos={fontSize.label} numberOfLines={1}>
            {[
              candidate.phone,
              internal
                ? t('internal')
                : domainLabel('driverType', candidate.driverType ?? '', candidate.driverType ?? ''),
            ].join(LIST_SEPARATOR)}
          </Text>
          <XStack gap={space.xs} flexWrap="wrap">
            {internal ? null : (
              <StatusBadge
                size="sm"
                /* Web `LicenceBadge`: xác thực xanh, đang đọc xám, chưa xác minh đỏ. */
                color={
                  candidate.licenceState === DRIVER_LICENCE_STATE.VERIFIED
                    ? STATUS_COLOR.SUCCESS
                    : candidate.licenceState === DRIVER_LICENCE_STATE.PENDING
                      ? STATUS_COLOR.NEUTRAL
                      : STATUS_COLOR.DANGER
                }
                label={
                  candidate.licenceState === DRIVER_LICENCE_STATE.VERIFIED
                    ? classes
                      ? t('licenceVerified', { classes })
                      : t('licenceVerifiedNoClass')
                    : candidate.licenceState === DRIVER_LICENCE_STATE.PENDING
                      ? t('licencePending')
                      : t('licenceNone')
                }
              />
            )}
            <StatusBadge size="sm" color={availabilityColor} label={availabilityText} />
          </XStack>
        </YStack>
        {current ? (
          <Ionicons name="checkmark-circle" size={iconSize.lg} color={colors.primaryActive} />
        ) : null}
      </XStack>
    </Pressable>
  );
});
