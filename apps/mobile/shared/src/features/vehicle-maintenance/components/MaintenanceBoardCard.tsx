import { Pressable } from 'react-native';
import { memo, useCallback, useState } from 'react';
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
import { LIST_SEPARATOR, maintenanceCyclePercent } from '@xeprime/domain';
import { LineIcon } from '@/components/icons/LineIcon';
import { FONT_FAMILY } from '@/theme/fonts';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { RemoteImage } from '@/components/ui/RemoteImage';
import { Pill, pillToneOfStatusColor } from '@/components/ui/Pill';
import { useAppFormat } from '@/i18n/use-app-format';
import { useDomainLabel } from '@/i18n/domain';
import { useColors } from '@/theme/ThemeProvider';
import { fontWeight, iconSize, radius, space } from '@/theme/tokens';
import type { BoardAction } from './BoardActionSheets';
import type { MaintenanceBoardItem } from '../api';

/** Ảnh xe 60 × 42 - Figma 24512:121709. */
/** Nút ⋮ chỉ 20pt - nới vùng chạm cho đủ sàn ngón tay. */
const KEBAB_SLOP = 12;
const THUMB_W = 60;
const THUMB_H = 42;
/** Cỡ chữ 14/20 và 12/18 của Figma. */
const body = { fos: 14, lh: 20 } as const;
const small = { fos: 12, lh: 18 } as const;

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
  /* Màu theo hạn - Figma 24512:121616 / 121733 / 121921: đỏ · cam · xanh lá. */
  const dueSoon = status === MAINTENANCE_DUE_STATUS.DUE_SOON;
  const barColor = overdue ? colors.danger : dueSoon ? colors.warningVivid : colors.successVivid;
  const remainingColor = overdue ? colors.danger : dueSoon ? colors.warningHigh : colors.success;
  const record = item.activeRecord;
  const missingKm = item.currentOdometerKm == null;
  const percent = maintenanceCyclePercent(item.oilChangeIntervalKm, item.remainingKm);
  const subtitle = item.plateNumber || item.vehicleCode;
  const open = useCallback(() => onPress(item), [onPress, item]);

  const menu = [
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
    if (key === 'complete') onAction({ kind: 'complete', row: item });
    else if (key === 'cancel') onAction({ kind: 'cancel', row: item });
  };

  return (
    /*
      Khuôn thẻ Figma `_Kanban Items` (24512:121616): viền đỏ khi quá hạn, đầu thẻ ảnh 60×42 +
      tên + "biển số · ngày bảo dưỡng gần nhất" + viên hạn; ô xám Odo/mốc/thanh %; ô lịch; hai nút.
      Thao tác phụ (hoàn tất, huỷ lịch) mở bằng nút ⋮ cạnh viên hạn (Figma 24520:21513); KHÔNG có
      "Xem chi tiết" vì chạm thẻ đã mở xe - người dùng chốt 26/11/2026. Không có thao tác nào thì
      ẩn hẳn nút ⋮, không để một nút bấm ra tấm trống.
    */
    <Card
      onPress={open}
      accessibilityLabel={item.vehicleName}
      {...(overdue ? { borderColor: colors.danger } : {})}
    >
      <YStack minWidth={0} gap={12}>
        <XStack ai="flex-start" jc="space-between" gap={space.sm}>
          <XStack ai="center" gap={6} f={1} minWidth={0}>
            <YStack w={THUMB_W} h={THUMB_H} br={radius.sm} ov="hidden" bg={colors.surfaceMuted} flexShrink={0}>
              <RemoteImage
                uri={item.mainImageUrl}
                recyclingKey={item.vehicleId}
                radius={radius.sm}
                fallback={<Ionicons name="car-outline" size={iconSize.md} color={colors.placeholder} />}
              />
            </YStack>
            <YStack f={1} minWidth={0} gap={2}>
              <Text col={colors.text} {...body} fontFamily={FONT_FAMILY.semibold} fow={fontWeight.semibold} numberOfLines={1}>
                {item.vehicleName}
              </Text>
              <Text col={colors.textMuted} {...small} fontFamily={FONT_FAMILY.body} numberOfLines={1}>
                {[subtitle, item.lastCompletedAt ? fmt.date(item.lastCompletedAt) : null]
                  .filter(Boolean)
                  .join(LIST_SEPARATOR)}
              </Text>
            </YStack>
          </XStack>
          <XStack ai="center" gap={space.xs} flexShrink={0}>
            <Pill
              label={domainLabel('maintenanceDueStatus', status, dueMeta.label)}
              tone={pillToneOfStatusColor(tone)}
            />
            {menu.length > 0 ? (
              <Pressable
                onPress={() => setMenuOpen(true)}
                accessibilityRole="button"
                accessibilityLabel={t('board.more', { name: item.vehicleName })}
                hitSlop={KEBAB_SLOP}
              >
                <LineIcon name="menu-kebab" size={iconSize.lg} color={colors.textMuted} />
              </Pressable>
            ) : null}
          </XStack>
        </XStack>

        {/*
          Xe CHƯA CÓ số KM: không có gì để vẽ thanh/mốc - một dòng nhắc cam duy nhất thay cho ô xám
          rỗng; ô lịch chỉ hiện khi đã có phiếu (người dùng 26/11/2026: thẻ cũ "xấu" vì hai dòng
          cùng nói "chưa có số" + thanh rỗng + "Chưa cần cập nhật" mâu thuẫn).
        */}
        {missingKm ? (
          <XStack px={12} py={space.sm} br={radius.control} bg={colors.warningSubtle} ai="center" gap={6}>
            <LineIcon name="info-circle" size={16} color={colors.warningVivid} />
            <Text col={colors.warningHigh} {...small} fontFamily={FONT_FAMILY.body} f={1} minWidth={0}>
              {[t('board.missingOdometer'), t('board.needsOdometer')].join(LIST_SEPARATOR)}
            </Text>
          </XStack>
        ) : (
          /* Ô xám: Odo · mốc tới / thanh 6pt / còn-quá · % chu kỳ. */
        <YStack px={12} py={space.sm} br={radius.control} bg={colors.background} gap={6}>
          <XStack jc="space-between" gap={space.sm}>
            <Text
              col={item.currentOdometerKm == null ? colors.warningStrong : colors.text}
              {...small}
              fontFamily={FONT_FAMILY.semibold}
              fow={fontWeight.semibold}
              numberOfLines={1}
              flexShrink={1}
            >
              {item.currentOdometerKm == null
                ? t('board.missingOdometer')
                : t('board.partnerApp.odometer', { km: fmt.km(item.currentOdometerKm) })}
            </Text>
            <Text col={colors.textMuted} {...small} fontFamily={FONT_FAMILY.body} numberOfLines={1} flexShrink={1}>
              {item.nextMaintenanceKm != null
                ? t('board.partnerApp.nextDue', { km: fmt.km(item.nextMaintenanceKm) })
                : t('board.noNextDue')}
            </Text>
          </XStack>
          <ProgressBar percent={percent ?? 0} size="xs" color={barColor} />
          <XStack jc="space-between" gap={space.sm}>
            {status === MAINTENANCE_DUE_STATUS.UNKNOWN ? null : (
              <Text
                col={remainingColor}
                {...small}
                fontFamily={FONT_FAMILY.semibold}
                fow={fontWeight.semibold}
                numberOfLines={1}
              >
                {fmt.remainingKm(item.remainingKm)}
              </Text>
            )}
            <Text col={colors.textMuted} {...small} fontFamily={FONT_FAMILY.body} numberOfLines={1} flexShrink={1} ml="auto">
              {item.currentOdometerKm == null
                ? t('board.needsOdometer')
                : percent != null && item.oilChangeIntervalKm
                  ? t('board.cycle', {
                      percent: Math.round(percent),
                      interval: fmt.km(item.oilChangeIntervalKm),
                    })
                  : t('board.noCycle')}
            </Text>
          </XStack>
        </YStack>

        )}

        {missingKm && !record ? null : <ScheduleBox item={item} />}

        {/*
          Chân thẻ: vạch mảnh `borderSubtle` ở trên, hai nút CHIA ĐỀU hết bề ngang thẻ (Figma
          24520:21513 - người dùng chốt 26/11/2026).
        */}
        {canCorrectOdometer || canManage ? (
          <XStack
            gap={12}
            pt={12}
            borderTopWidth={1}
            borderTopColor={colors.borderSubtle}
          >
            {canCorrectOdometer ? (
              <YStack f={1} flexBasis={0} minWidth={0}>
                <Button
                  label={t('actions.updateOdometer')}
                  // Thiếu số KM: việc CẦN làm là nhập ODO - nút đó lên vàng, Lên lịch lùi về viền xám.
                  variant={missingKm ? 'gradient' : 'neutral'}
                  size="compact"
                  disabled={writeLocked}
                  onPress={() => onAction({ kind: 'odometer', row: item })}
                />
              </YStack>
            ) : null}
            {canManage ? (
              <YStack f={1} flexBasis={0} minWidth={0}>
                <Button
                  label={record ? t('actions.editSchedule') : t('actions.scheduleNow')}
                  variant={record || missingKm ? 'neutral' : 'gradient'}
                  size="compact"
                  disabled={writeLocked}
                  onPress={() => onAction({ kind: 'schedule', row: item })}
                />
              </YStack>
            ) : null}
          </XStack>
        ) : null}
      </YStack>

      {/* Tấm thao tác mở từ nút ⋮ (Figma 24520:21513). */}
      <BottomSheet
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        title={item.vehicleName}
        chrome="v2"
        headerDivider
      >
        {/*
          MỘT hàng, không icon: "Hủy lịch" viền đỏ bên trái, "Hoàn tất" nền vàng chính bên phải -
          người dùng chốt 26/11/2026 (`menu` xếp Hoàn tất trước nên đảo lại khi vẽ).
        */}
        <XStack gap={12}>
          {[...menu].reverse().map((m) => (
            <YStack key={m.key} f={1} flexBasis={0} minWidth={0}>
              <Button
                label={m.label}
                variant={m.danger ? 'dangerOutline' : 'gradient'}
                disabled={m.write && writeLocked}
                onPress={() => runMenu(m.key)}
              />
            </YStack>
          ))}
        </XStack>
      </BottomSheet>
    </Card>
  );
});

/**
 * Ô lịch - Figma 24512:121669 / 121887 / 121978: MỘT dòng 12/18.
 * Có phiếu: "Đã lên lịch | ngày" trái + hạng mục phải. Chưa có mà quá hạn / sắp hạn:
 * "Chưa có lịch · mức cần" kèm icon (i) trên nền đỏ / cam nhạt; còn lại: hai đầu trái-phải.
 */
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
      <SplitRow
        bg={colors.infoLow}
        leftColor={colors.infoStrong}
        rightColor={colors.infoStrong}
        left={
          inProgress
            ? date
              ? t('board.inProgressSince', { date })
              : t('board.inProgress')
            : date
              ? t('board.scheduledOn', { date })
              : t('board.scheduled')
        }
        right={domainLabel('maintenanceType', record.type)}
      />
    );
  }

  const urgent = status === MAINTENANCE_DUE_STATUS.OVERDUE;
  if (urgent || status === MAINTENANCE_DUE_STATUS.DUE_SOON) {
    const tint = urgent ? colors.danger : colors.warningVivid;
    return (
      <XStack
        px={12}
        py={space.sm}
        br={radius.sm}
        bg={urgent ? colors.dangerSurfaceStrong : colors.warningSubtle}
        ai="center"
        gap={6}
      >
        <LineIcon name="info-circle" size={16} color={tint} />
        <Text col={tint} {...small} fontFamily={FONT_FAMILY.body} numberOfLines={1} flexShrink={1}>
          {[t('board.noSchedule'), urgent ? t('board.needNow') : t('board.needSoon')].join(LIST_SEPARATOR)}
        </Text>
      </XStack>
    );
  }

  return (
    <SplitRow
      bg={colors.surfaceMuted}
      leftColor={colors.textMuted}
      rightColor={colors.textMuted}
      left={t('board.noSchedule')}
      right={t('board.partnerApp.notYet')}
    />
  );
}

/** Ô một dòng: chữ trái + chữ phải, nền/màu theo trạng thái (Figma 24512:121887 / 121978). */
function SplitRow({
  left,
  right,
  bg,
  leftColor,
  rightColor,
}: {
  left: string;
  right: string;
  bg: string;
  leftColor: string;
  rightColor: string;
}) {
  return (
    <XStack px={12} py={space.sm} br={radius.sm} bg={bg} jc="space-between" gap={space.sm}>
      <Text col={leftColor} {...small} fontFamily={FONT_FAMILY.body} numberOfLines={1} flexShrink={1}>
        {left}
      </Text>
      <Text col={rightColor} {...small} fontFamily={FONT_FAMILY.body} numberOfLines={1} flexShrink={1}>
        {right}
      </Text>
    </XStack>
  );
}
