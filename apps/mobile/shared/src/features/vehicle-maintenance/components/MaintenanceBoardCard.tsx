import { memo, useCallback } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import {
  MAINTENANCE_DUE_STATUS,
  MAINTENANCE_DUE_STATUS_META,
  MAINTENANCE_STATUS_META,
  STATUS_COLOR,
  type MaintenanceDueStatus,
  type MaintenanceStatus,
} from '@xeprime/types';
import { LIST_SEPARATOR, maintenanceCyclePercent } from '@xeprime/domain';
import { Card } from '@/components/ui/Card';
import { CardAccent } from '@/components/ui/CardAccent';
import { CardActionBar, type CardAction } from '@/components/ui/CardActionBar';
import type { IconName } from '@/components/ui/Chip';
import { Divider } from '@/components/ui/DataRow';
import { DetailChevron } from '@/components/ui/DetailArrow';
import { FactRow, type FactItem } from '@/components/ui/FactRow';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { RemoteImage } from '@/components/ui/RemoteImage';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { useAppFormat } from '@/i18n/use-app-format';
import { useDomainLabel } from '@/i18n/domain';
import { colors, fontSize, fontWeight, iconSize, radius, space } from '@/theme/tokens';
import type { BoardAction } from './BoardActionSheets';
import type { MaintenanceBoardItem } from '../api';

/**
 * Ô ảnh xe: VUÔNG, cao xấp xỉ khối định danh cạnh nó (tên + mã/biển số + nhãn hạn ≈ 64pt).
 *
 * Nhỏ hơn ô 96 của `VehicleCard` vì thẻ này không phải hồ sơ xe mà là một VIỆC: phần nặng nhất
 * của nó là khối KM bên dưới, còn ảnh chỉ để nhận ra chiếc xe trong lúc lướt.
 */
const THUMB_SIZE = 64;

/**
 * Một xe trong Trung tâm bảo dưỡng (VEH-09).
 *
 * Ba tầng, theo đúng thứ tự người dùng hỏi: xe NÀO · chu kỳ tới đâu · đang có lịch gì; thao tác
 * đóng chân thẻ thành một thanh phẳng.
 *
 * **Cả thẻ chỉ có MỘT mặt phẳng.** Bản trước đặt ba con số KM lên một khối nền mờ và bốn thao tác
 * lên bốn viên nút có nền — cộng với viên nhãn trạng thái là ba mảng màu chồng nhau trên một tấm
 * rộng 358pt, và mắt không còn chỗ bám. Giờ ranh giới do KẺ MẢNH vạch ra, còn màu để dành cho hai
 * thứ thực sự mang tin: vạch trạng thái ở mép trái và thanh chu kỳ.
 *
 * `memo` như `VehicleCard`/`BookingCard`: thẻ này nằm trong một danh sách dài, và không có nó thì
 * mỗi lần màn render (đổi trang, kéo-làm-mới, mở tấm tác vụ) là mọi thẻ đang hiện vẽ lại dù dữ
 * liệu không đổi.
 */
export const MaintenanceBoardCard = memo(function MaintenanceBoardCard({
  item,
  canManage,
  canCorrectOdometer,
  onPress,
  onAction,
}: {
  item: MaintenanceBoardItem;
  canManage: boolean;
  canCorrectOdometer: boolean;
  onPress: (item: MaintenanceBoardItem) => void;
  onAction: (action: BoardAction) => void;
}) {
  const tTable = useTranslations('Maintenance.table');
  const tActions = useTranslations('Maintenance.actions');
  const tLabels = useTranslations('Common.labels');
  const fmt = useAppFormat();
  const domainLabel = useDomainLabel();

  const dueStatus = item.dueStatus as MaintenanceDueStatus;
  const dueMeta = MAINTENANCE_DUE_STATUS_META[dueStatus];
  const overdue = dueStatus === MAINTENANCE_DUE_STATUS.OVERDUE;
  const percent = maintenanceCyclePercent(item.oilChangeIntervalKm, item.remainingKm);
  const open = useCallback(() => onPress(item), [onPress, item]);

  /*
   * Ba con số của bảng web. "KM hiện tại" trống KHÔNG phải là "0 km": nó là một việc phải làm
   * (đúng nhóm việc "Thiếu KM" của chính bảng này), nên chỗ con số là một viên nhãn cảnh báo —
   * cùng cách ô của web dựng nó.
   */
  const facts: FactItem[] = [
    {
      key: 'currentKm',
      label: tTable('columns.currentKm'),
      ...(item.currentOdometerKm == null
        ? {
            node: (
              <StatusBadge label={tTable('missingKm')} color={STATUS_COLOR.WARNING} size="sm" />
            ),
          }
        : { value: fmt.km(item.currentOdometerKm) }),
    },
    { key: 'nextDue', label: tTable('columns.nextDue'), value: fmt.km(item.nextMaintenanceKm) },
    {
      key: 'lastService',
      label: tTable('columns.lastService'),
      value: item.lastCompletedAt ? fmt.date(item.lastCompletedAt) : tLabels('notAvailable'),
    },
  ];

  /*
   * ĐÚNG bốn thao tác của `MaintenanceBoardTable`, cùng thứ tự và cùng luật ẩn hiện:
   *
   * - "Cập nhật ODO" đọc `vehicles.odometer.correct` — quyền RIÊNG, không nằm trong quyền quản lý
   *   bảo dưỡng: người ghi số KM hằng ngày không phải người được đổi lịch xưởng.
   * - "Lên lịch" ↔ "Sửa lịch" cùng một nút, nhãn đổi theo phiếu đang mở.
   * - "Hoàn tất" và "Hủy lịch" chỉ có nghĩa khi CÓ phiếu đang mở.
   *
   * "Chi tiết" của web không nằm ở đây: cả thẻ đã bắt chạm và có mũi tên `>` — thêm một nút nữa là
   * lối vào thứ ba cho cùng một màn.
   */
  const actions: CardAction[] = [
    ...(canCorrectOdometer
      ? [
          {
            key: 'odometer',
            label: tActions('updateOdometer'),
            icon: 'speedometer-outline' as IconName,
            onPress: () => onAction({ kind: 'odometer', row: item }),
          },
        ]
      : []),
    ...(canManage
      ? [
          {
            key: 'schedule',
            label: item.activeRecord ? tActions('editSchedule') : tActions('schedule'),
            icon: 'calendar-outline' as IconName,
            onPress: () => onAction({ kind: 'schedule', row: item }),
          },
        ]
      : []),
    ...(canManage && item.activeRecord
      ? [
          {
            key: 'complete',
            label: tActions('complete'),
            icon: 'checkmark-outline' as IconName,
            /* Thao tác ĐÓNG việc lại — xanh lá, đối trọng với sắc đỏ của "Hủy lịch" ngay cạnh. */
            tone: 'success' as const,
            onPress: () => onAction({ kind: 'complete', row: item }),
          },
          {
            key: 'cancel',
            label: tActions('cancelSchedule'),
            icon: 'stop-circle-outline' as IconName,
            tone: 'danger' as const,
            onPress: () => onAction({ kind: 'cancel', row: item }),
          },
        ]
      : []),
  ];

  return (
    <Card onPress={open} accessibilityLabel={item.vehicleName} padded={false}>
      <XStack>
        <CardAccent color={dueMeta.color} />

        <YStack f={1} minWidth={0}>
          <YStack p={space.md} gap={space.sm}>
            {/* TẦNG 1 — xe nào: ảnh, tên, mã/biển số, nhãn hạn. */}
            <XStack gap={space.sm} ai="flex-start">
              {/* Viền ở ô ĐỰNG: ảnh xe nền trắng chảy thẳng vào nền thẻ nếu không có nét viền. */}
              <YStack
                w={THUMB_SIZE}
                h={THUMB_SIZE}
                br={radius.sm}
                bw={1}
                bc={colors.borderSubtle}
                ov="hidden"
              >
                <RemoteImage
                  uri={item.mainImageUrl}
                  recyclingKey={item.vehicleId}
                  fallback={
                    <Ionicons name="car-outline" size={iconSize.lg} color={colors.textMuted} />
                  }
                />
              </YStack>

              <YStack f={1} minWidth={0} gap={2}>
                <Text col={colors.text} fos={fontSize.body} fow={fontWeight.bold} numberOfLines={2}>
                  {item.vehicleName}
                </Text>
                <Text col={colors.textMuted} fos={fontSize.bodySm} numberOfLines={1}>
                  {[item.plateNumber, item.vehicleCode].filter(Boolean).join(LIST_SEPARATOR)}
                </Text>

                {/*
                  Nhãn hạn và mũi tên `>` chung một hàng, hai đầu.

                  Mũi tên là DẤU HIỆU thẻ mở ra được, không phải nút — cả thẻ đã bắt chạm. Nó đứng
                  cuối khối định danh chứ không canh giữa cả thẻ: thẻ này cao gần 200pt, và một
                  mũi tên lơ lửng giữa mép phải không còn dính vào thứ gì.
                */}
                <XStack ai="center" jc="space-between" gap={space.xs} pt={2}>
                  <StatusBadge
                    label={domainLabel('maintenanceDueStatus', dueStatus, dueMeta.label)}
                    color={dueMeta.color}
                    size="sm"
                  />
                  <DetailChevron />
                </XStack>
              </YStack>
            </XStack>

            {/*
              TẦNG 2 — CHU KỲ. Ba con số của bảng web thành ba ô BẰNG NHAU, ngăn bằng kẻ dọc: số
              trước, nhãn xuống dưới, đúng nhịp `StatGrid` của app.

              Không nền mờ dưới khối này: kẻ chia đã đủ nói ba ô là một cụm, còn một mảng xám ở
              đây thì đứng ngay cạnh viên nhãn xám của trạng thái và cả thẻ đọc ra lỗ chỗ.

              "KM hiện tại" trống KHÔNG phải là "0 km": nó là một việc phải làm (đúng nhóm việc
              "Thiếu KM" của chính bảng này), nên chỗ con số là một viên nhãn cảnh báo — cùng cách
              ô của web dựng nó.
            */}
            <YStack gap={space.sm}>
              <Divider />

              <FactRow items={facts} />

              {percent != null ? (
                <ProgressBar percent={percent} tone={overdue ? 'exception' : 'active'} size="sm" />
              ) : null}

              {/*
                Câu "còn / quá hạn bao nhiêu" dựng ở MỘT chỗ (`fmt.remainingKm`) — web dùng đúng
                hàm đó, nên bảng này và tab bảo dưỡng không thể nói khác nhau về cùng một chiếc xe.

                Chu kỳ đi LIỀN sau số còn lại: "Còn 4.100 km" một mình không nói được nhiều hay
                ít; 4.100 trên chu kỳ 5.000 là vừa thay, trên chu kỳ 20.000 là sắp tới hạn. Cùng
                khoá `Maintenance.table.cycle` với web, kể cả khoảng trắng và dấu ngoặc.
              */}
              <Text
                col={overdue ? colors.danger : colors.textMuted}
                fos={fontSize.bodySm}
                fow={fontWeight.medium}
              >
                {fmt.remainingKm(item.remainingKm)}
                {item.oilChangeIntervalKm
                  ? tTable('cycle', { value: fmt.km(item.oilChangeIntervalKm) })
                  : ''}
              </Text>
            </YStack>

            {/*
              TẦNG 3 — LỊCH ĐANG MỞ, cột `openSchedule` của web: nhãn trạng thái phiếu + hạng mục
              + ngày dự kiến. Thiếu nó thì hai xe cùng "Trong chu kỳ" trông y hệt nhau, dù một
              chiếc đã có thợ hẹn và một chiếc thì chưa ai đụng tới.
            */}
            {item.activeRecord ? (
              <XStack ai="center" flexWrap="wrap" gap={space.xs}>
                <StatusBadge
                  label={domainLabel(
                    'maintenanceStatus',
                    item.activeRecord.status,
                    MAINTENANCE_STATUS_META[item.activeRecord.status as MaintenanceStatus]?.label,
                  )}
                  color={
                    MAINTENANCE_STATUS_META[item.activeRecord.status as MaintenanceStatus]?.color ??
                    STATUS_COLOR.NEUTRAL
                  }
                  size="sm"
                />
                <Text col={colors.textMuted} fos={fontSize.bodySm}>
                  {[
                    domainLabel('maintenanceType', item.activeRecord.type),
                    item.activeRecord.plannedStartAt
                      ? fmt.date(item.activeRecord.plannedStartAt)
                      : null,
                  ]
                    .filter(Boolean)
                    .join(LIST_SEPARATOR)}
                </Text>
              </XStack>
            ) : null}
          </YStack>

          <CardActionBar actions={actions} />
        </YStack>
      </XStack>
    </Card>
  );
});

