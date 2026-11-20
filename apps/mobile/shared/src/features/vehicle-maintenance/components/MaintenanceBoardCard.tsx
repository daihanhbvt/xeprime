import { memo, useCallback, useState, type ReactNode } from 'react';
import { Ionicons } from '@/components/icons/Ionicons';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import {
  MAINTENANCE_DUE_STATUS,
  MAINTENANCE_DUE_STATUS_META,
  MAINTENANCE_STATUS,
  STATUS_COLOR,
  type MaintenanceDueStatus,
} from '@xeprime/types';
import { maintenanceCyclePercent } from '@xeprime/domain';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { IconButton } from '@/components/ui/IconButton';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { RemoteImage } from '@/components/ui/RemoteImage';
import { FactRow } from '@/components/ui/FactRow';
import { Pill, pillToneOfStatusColor } from '@/components/ui/Pill';
import { useAppFormat } from '@/i18n/use-app-format';
import { useDomainLabel } from '@/i18n/domain';
import { useColors } from '@/theme/ThemeProvider';
import { fontSize, fontWeight, iconSize, radius, space, typeScale } from '@/theme/tokens';
import type { BoardAction } from './BoardActionSheets';
import type { MaintenanceBoardItem } from '../api';
import { layout } from '@/theme/layout';

/** Ảnh xe 80 × 52 - cùng thẻ Lịch sử đơn thuê. */
const THUMB_W = 80;
const THUMB_H = 52;
const body = { fos: typeScale.body.fontSize, lh: typeScale.body.lineHeight } as const;

/**
 * Một xe trên bảng bảo dưỡng — bản native của `MaintenanceBoardRow` web (sổ redesign §3.8).
 *
 * Đúng các khối của web, xếp dọc cho khổ điện thoại: vạch tông theo hạn (mép trái) → xe (ảnh, tên,
 * biển số, "Bảo dưỡng gần nhất") → Odo hiện tại + mốc tiếp theo → chu kỳ (viên hạn + còn bao xa,
 * thanh %, câu chu kỳ) → ô lịch (đã lên lịch / đang bảo dưỡng, hoặc "Chưa có lịch" + mức cần) →
 * hàng nút: Cập nhật ODO · Lên lịch / Lên lịch ngay / Sửa lịch · "…" (xem xe, hoàn tất, huỷ lịch).
 * Gói `read_only`: thao tác GHI khoá chứ không ẩn; "Xem chi tiết xe" không bao giờ khoá.
 */
export const MaintenanceBoardCard = memo(function MaintenanceBoardCard({
  item,
  canManage,
  canCorrectOdometer,
  writeLocked = false,
  onPress,
  onAction,
}: {
  item: MaintenanceBoardItem;
  canManage: boolean;
  canCorrectOdometer: boolean;
  /** Gói ở `read_only` (ADR 0027 điều 3): thao tác GHI khoá chứ không ẩn — web `writeBlock`. */
  writeLocked?: boolean;
  onPress: (item: MaintenanceBoardItem) => void;
  onAction: (action: BoardAction) => void;
}) {
  const colors = useColors();
  const t = useTranslations('Maintenance');
  const fmt = useAppFormat();
  const domainLabel = useDomainLabel();
  const [menuOpen, setMenuOpen] = useState(false);

  const status = item.dueStatus as MaintenanceDueStatus;
  const dueMeta = MAINTENANCE_DUE_STATUS_META[status];
  const tone = status === MAINTENANCE_DUE_STATUS.OK ? STATUS_COLOR.INFO : dueMeta.color;
  const overdue = status === MAINTENANCE_DUE_STATUS.OVERDUE;
  const barColor =
    tone === STATUS_COLOR.DANGER
      ? colors.danger
      : tone === STATUS_COLOR.WARNING || tone === STATUS_COLOR.WAITING
        ? colors.warning
        : colors.info;
  const record = item.activeRecord;
  const percent = maintenanceCyclePercent(item.oilChangeIntervalKm, item.remainingKm);
  const subtitle = item.plateNumber || item.vehicleCode;
  const open = useCallback(() => onPress(item), [onPress, item]);
  const bold = (chunks: ReactNode) => (
    <Text col={colors.text} fow={fontWeight.semibold}>
      {chunks}
    </Text>
  );

  const menu = [
    { key: 'detail', label: t('actions.detail'), danger: false, show: true, write: false },
    {
      key: 'complete',
      label: t('actions.complete'),
      danger: false,
      show: canManage && !!record,
      write: true,
    },
    {
      key: 'cancel',
      label: t('actions.cancelSchedule'),
      danger: true,
      show: canManage && !!record,
      write: true,
    },
  ].filter((m) => m.show);

  const runMenu = (key: string) => {
    setMenuOpen(false);
    if (key === 'detail') open();
    else if (key === 'complete') onAction({ kind: 'complete', row: item });
    else if (key === 'cancel') onAction({ kind: 'cancel', row: item });
  };

  return (
    /*
      Khuôn thẻ của app KHÁCH: không vạch màu mép trái - mức khẩn đã nói bằng viên hạn + thanh %
      chu kỳ (cùng `tone`). Người dùng chốt 10/11/2026: màn quản lý lấy phong cách app khách.
    */
    <Card onPress={open} accessibilityLabel={item.vehicleName}>
      <YStack minWidth={0} gap={space.sm}>
        {/* Đầu thẻ như thẻ Đơn thuê: biển số / mã xe trái, viên hạn + nút ⋯ phải. */}
        <XStack ai="center" jc="space-between" gap={space.sm}>
          <Text col={colors.text} {...body} fow={fontWeight.medium} numberOfLines={1} flexShrink={1}>
            {subtitle ? `#${subtitle}` : item.vehicleName}
          </Text>
          <XStack ai="center" gap={space.xs}>
            <Pill
              label={domainLabel('maintenanceDueStatus', status, dueMeta.label)}
              tone={pillToneOfStatusColor(tone)}
            />
            <IconButton
              icon="ellipsis-horizontal"
              label={t('board.more', { name: item.vehicleName })}
              compact
              onPress={() => setMenuOpen(true)}
            />
          </XStack>
        </XStack>

        {/* Xe: ảnh 80 × 52 + tên + lần bảo dưỡng gần nhất. */}
        <XStack gap={12} ai="center">
          <YStack w={THUMB_W} h={THUMB_H} br={radius.sm} ov="hidden" bg={colors.surfaceMuted} flexShrink={0}>
            <RemoteImage
              uri={item.mainImageUrl}
              recyclingKey={item.vehicleId}
              radius={radius.sm}
              fallback={<Ionicons name="car-outline" size={iconSize.md} color={colors.placeholder} />}
            />
          </YStack>
          <YStack f={1} minWidth={0} gap={2}>
            <Text col={colors.text} {...body} fow={fontWeight.semibold} numberOfLines={1}>
              {item.vehicleName}
            </Text>
            <Text col={colors.textMuted} {...body} numberOfLines={1}>
              {item.lastCompletedAt
                ? t.rich('board.lastService', { date: fmt.date(item.lastCompletedAt), b: bold })
                : t('board.noLastService')}
            </Text>
          </YStack>
        </XStack>

        {/* Các dòng nhãn/giá trị cùng khuôn thẻ danh sách. */}
        <FactRow
          label={t('board.odometer')}
          {...(item.currentOdometerKm == null ? { tone: colors.warningStrong } : {})}
          sub={
            item.nextMaintenanceKm != null
              ? t('board.nextDueShort', { km: fmt.km(item.nextMaintenanceKm) })
              : t('board.noNextDue')
          }
        >
          {item.currentOdometerKm == null
            ? t('board.missingOdometer')
            : `${fmt.kmNumber(item.currentOdometerKm)} ${t('board.kmUnit')}`}
        </FactRow>
        {status === MAINTENANCE_DUE_STATUS.UNKNOWN ? null : (
          <FactRow label={t('board.remaining')} {...(overdue ? { tone: colors.danger } : {})}>
            {fmt.remainingKm(item.remainingKm)}
          </FactRow>
        )}
        <YStack gap={space.xs}>
          {/* Màu thanh theo hạn như web (`--tone`): trong chu kỳ = xanh da trời, sắp đến hạn = cam, quá hạn = đỏ; cao 8 như web. */}
          <ProgressBar percent={percent ?? 0} size="md" color={barColor} />
          <Text col={colors.textMuted} fos={fontSize.label}>
            {item.currentOdometerKm == null
              ? t('board.needsOdometer')
              : percent != null && item.oilChangeIntervalKm
                ? t('board.cycle', {
                    percent: Math.round(percent),
                    interval: fmt.km(item.oilChangeIntervalKm),
                  })
                : t('board.noCycle')}
          </Text>
        </YStack>

        <ScheduleBox item={item} />

        {/* Hai nút một hàng, vàng + icon (chuẩn tấm "Thao tác"). */}
        {canCorrectOdometer || canManage ? (
          <XStack gap={space.sm} pt={space.xs}>
            {canCorrectOdometer ? (
              <YStack flexGrow={1} flexShrink={1} flexBasis="auto" minWidth={0}>
                <Button
                  label={t('actions.updateOdometer')}
                  icon="speedometer-outline"
                  variant="gradient"
                  size="compact"
                  disabled={writeLocked}
                  onPress={() => onAction({ kind: 'odometer', row: item })}
                />
              </YStack>
            ) : null}
            {canManage ? (
              <YStack flexGrow={1} flexShrink={1} flexBasis="auto" minWidth={0}>
                <Button
                  label={
                    record
                      ? t('actions.editSchedule')
                      : overdue
                        ? t('actions.scheduleNow')
                        : t('actions.schedule')
                  }
                  icon="calendar-outline"
                  variant="gradient"
                  size="compact"
                  disabled={writeLocked}
                  onPress={() => onAction({ kind: 'schedule', row: item })}
                />
              </YStack>
            ) : null}
          </XStack>
        ) : null}
      </YStack>

      <BottomSheet open={menuOpen} onClose={() => setMenuOpen(false)} title={item.vehicleName}>
        <YStack gap={space.sm}>
          {menu.map((m) => (
            <Button
              key={m.key}
              label={m.label}
              variant={m.danger ? 'dangerOutline' : 'outline'}
              disabled={m.write && writeLocked}
              onPress={() => runMenu(m.key)}
            />
          ))}
        </YStack>
      </BottomSheet>
    </Card>
  );
});

/** Ô lịch: phiếu đang mở hoặc lời nhắc theo tình trạng chu kỳ — `ScheduleBox` của web. */
function ScheduleBox({ item }: { item: MaintenanceBoardItem }) {
  const colors = useColors();
  const t = useTranslations('Maintenance');
  const fmt = useAppFormat();
  const domainLabel = useDomainLabel();
  const record = item.activeRecord;
  const status = item.dueStatus as MaintenanceDueStatus;

  if (record) {
    const inProgress = record.status === MAINTENANCE_STATUS.IN_PROGRESS;
    const date = record.plannedStartAt ? fmt.date(record.plannedStartAt) : null;
    return (
      <YStack px={layout.padX} py={space.sm} br={radius.lg} bg={colors.infoSurface} gap={2}>
        <Text col={colors.infoStrong} fos={fontSize.body} fow={fontWeight.semibold}>
          {inProgress
            ? date
              ? t('board.inProgressSince', { date })
              : t('board.inProgress')
            : date
              ? t('board.scheduledOn', { date })
              : t('board.scheduled')}
        </Text>
        <Text col={colors.infoStrong} fos={typeScale.body.fontSize}>
          {domainLabel('maintenanceType', record.type)}
        </Text>
      </YStack>
    );
  }

  const urgent = status === MAINTENANCE_DUE_STATUS.OVERDUE;
  return (
    <YStack
      px={layout.padX}
      py={space.sm}
      br={radius.lg}
      bw={1}
      borderStyle="dashed"
      bc={urgent ? colors.danger : colors.border}
      bg={urgent ? colors.dangerSurface : colors.background}
      gap={2}
    >
      <Text
        col={urgent ? colors.danger : colors.text}
        fos={fontSize.body}
        fow={fontWeight.semibold}
      >
        {t('board.noSchedule')}
      </Text>
      <Text col={urgent ? colors.danger : colors.textMuted} fos={typeScale.body.fontSize}>
        {urgent
          ? t('board.needNow')
          : status === MAINTENANCE_DUE_STATUS.DUE_SOON
            ? t('board.needSoon')
            : t('board.notYet')}
      </Text>
    </YStack>
  );
}
