import { memo, useCallback, type ReactNode } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { StyleSheet } from 'react-native';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import {
  VEHICLE_OPERATION_STATUS_META,
  VEHICLE_PUBLIC_STATUS_META,
  type VehicleOperationStatus,
  type VehiclePublicStatus,
} from '@xeprime/types';
import { absoluteMoney, isNegativeMoney, subtractMoney, LIST_SEPARATOR } from '@xeprime/domain';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Skeleton } from '@/components/ui/Skeleton';
import { StatusBadge } from '@/components/ui/StatusBadge';
import type { IconName } from '@/components/ui/Chip';
import { useAppFormat } from '@/i18n/use-app-format';
import { useDomainLabel } from '@/i18n/domain';
import { colors, fontSize, fontWeight, iconSize, radius, space } from '@/theme/tokens';
import { VehicleAlertChips } from './VehicleAlertChips';
import type { VehicleAlertGroup, VehicleListItem, VehicleStats } from '../api';

/**
 * Ô ảnh xe: VUÔNG, cao xấp xỉ cột chữ đứng cạnh nó (ba dòng định danh + dải chip ≈ 100pt).
 *
 * Hai bản trước sai theo hai hướng ngược nhau. Ảnh cao cố định cạnh một cột chữ cao hơn để lại
 * khoảng chết ngay dưới ảnh; cho ảnh giãn hết chiều cao thẻ thì thành một dải dọc hẹp — càng
 * xấu, vì ảnh xe vốn NGANG, kéo cao lên chỉ cắt mất hai bên.
 *
 * Con số này ĐI CÙNG quyết định để dải chip nằm trong cột chữ: bỏ chip xuống dưới thì cột chữ
 * chỉ còn ~56pt và 96 lại thừa ra 40pt trống.
 */
const THUMB_SIZE = 96;

/**
 * Số chip cảnh báo hiện trên THẺ; phần dư gộp thành `+N`.
 *
 * Hai, không phải ba: ở 390px mỗi chip chiếm gần trọn một dòng, nên chip thứ ba đẩy thẻ cao
 * thêm một dòng nữa mà không nói thêm được việc gì gấp hơn — server đã sắp theo ưu tiên.
 */
const ALERT_CHIP_LIMIT = 2;

/* `Image` của React Native cần style phẳng — Tamagui không có primitive ảnh thay thế. */
const styles = StyleSheet.create({
  thumb: {
    width: THUMB_SIZE,
    height: THUMB_SIZE,
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceMuted,
    /* Ảnh xe nền trắng (ảnh studio, ảnh chụp tường) chảy thẳng vào nền thẻ nếu không có viền. */
    borderWidth: 1,
    borderColor: colors.borderSubtle,
  },
});

interface VehicleCardProps {
  vehicle: VehicleListItem;
  onPress: (vehicle: VehicleListItem) => void;
  /**
   * Vắng mặt = ẩn nút "Sửa" — đúng `hidden: !canEdit` của web.
   *
   * Quyền đọc ở MÀN, không ở thẻ: thẻ nằm trong một danh sách dài và không nên gọi
   * `usePermissions()` một lần cho mỗi dòng. Và ẩn nút chỉ là trang trí — chặn thật là guard
   * backend (CLAUDE.md §6).
   */
  onEdit?: ((vehicle: VehicleListItem) => void) | undefined;
  onSchedule: (vehicle: VehicleListItem) => void;
  /** Chỉ số của xe này; `undefined` khi chưa tải xong HOẶC khi tải hỏng — hai cờ dưới nói rõ ca nào. */
  stats?: VehicleStats | undefined;
  statsLoading: boolean;
  statsFailed: boolean;
  /** Việc cần làm + KM hiện tại, do server tính. Cùng ba trạng thái với `stats`. */
  alerts?: VehicleAlertGroup | undefined;
  alertsLoading: boolean;
  alertsFailed: boolean;
}

function VehicleCardImpl({
  vehicle,
  onPress,
  onEdit,
  onSchedule,
  stats,
  statsLoading,
  statsFailed,
  alerts,
  alertsLoading,
  alertsFailed,
}: VehicleCardProps) {
  const t = useTranslations('Vehicles.list');
  const fmt = useAppFormat();
  const domainLabel = useDomainLabel();

  const operationStatus = vehicle.operationStatus as VehicleOperationStatus;
  const publicStatus = vehicle.publicStatus as VehiclePublicStatus;
  const operationMeta = VEHICLE_OPERATION_STATUS_META[operationStatus];
  const publicMeta = VEHICLE_PUBLIC_STATUS_META[publicStatus];

  /*
   * Hai dòng định danh, GHÉP CHUỖI đúng như `VehicleListRow` của web — không phải bốn dòng
   * `Nhãn: giá trị`.
   *
   * Web dồn cả bốn mẩu vào MỘT dòng (`mã · biển số · loại / dịch vụ`) và cắt bằng "…" khi hết
   * chỗ; ở bề ngang native, một dòng như thế cắt mất luôn phần dịch vụ. Cắt làm hai dòng theo
   * đúng ranh giới đó là chỗ khác web duy nhất, và không mẩu nào bị mất.
   */
  const identity = [vehicle.code, vehicle.plateNumber].filter(Boolean).join(LIST_SEPARATOR);
  const typeAndService = `${domainLabel('vehicleType', vehicle.vehicleType)} / ${fmt.serviceTypes(vehicle.serviceTypes)}`;

  // Lãi/lỗ chỉ tính khi CẢ HAI vế cùng có mặt — hai trường này vắng khi thiếu quyền `finance.view`.
  const hasFinance = stats?.totalIncome != null && stats?.totalExpense != null;
  const profit = hasFinance ? subtractMoney(stats.totalIncome, stats.totalExpense) : null;
  const atLoss = profit != null && isNegativeMoney(profit);

  /*
   * MỘT hàm mở cho cả thân thẻ lẫn nút "Xem". Viết `() => onPress(vehicle)` ở hai chỗ là hai
   * closure mới mỗi lần render, tức `memo` không bao giờ ăn, mà thẻ này nằm trong một danh sách
   * dài. Cùng khuôn với `BookingCard`.
   */
  const open = useCallback(() => onPress(vehicle), [onPress, vehicle]);

  return (
    <Card onPress={open} accessibilityLabel={vehicle.name}>
      <YStack gap={space.sm}>
        {/*
          TẦNG TRÊN — ảnh xe, khối định danh, và dải chip.

          Chip nằm TRONG cột chữ chứ không phải một hàng riêng bên dưới: ô ảnh cao 96 mà khối
          định danh chỉ ba dòng (~56pt), để chip xuống dưới thì bên phải ảnh hụt gần 40pt trống.
          Kéo chip lên đây thì hai cột cao xấp xỉ nhau và thẻ ngắn đi đúng một hàng.
        */}
        <XStack gap={space.sm} ai="flex-start">
          <YStack w={THUMB_SIZE} h={THUMB_SIZE}>
            {vehicle.mainImageUrl ? (
              /*
                `cover` chứ không `contain`: ảnh xe vốn NGANG còn ô đựng nó VUÔNG, nên `contain`
                sẽ để lại hai dải trắng trên–dưới.
              */
              <Image
                source={{ uri: vehicle.mainImageUrl }}
                style={styles.thumb}
                contentFit="cover"
                cachePolicy="memory-disk"
                transition={150}
                accessible={false}
              />
            ) : (
              <YStack f={1} br={radius.sm} bg={colors.surfaceMuted} ai="center" jc="center">
                <Ionicons name="car-outline" size={iconSize.lg} color={colors.textMuted} />
              </YStack>
            )}
          </YStack>

          <YStack f={1} gap={space.xs}>
            <YStack gap={2}>
              <Text
                col={colors.text}
                fos={fontSize.body}
                fow={fontWeight.bold}
                numberOfLines={2}
              >
                {vehicle.name}
              </Text>
              <Metric>{identity}</Metric>
              <Metric>{typeAndService}</Metric>
            </YStack>

            {/*
              Ba loại chip cùng MỘT dải, theo thứ tự khẩn: vận hành → công khai → việc cần làm.

              Trạng thái vận hành nằm ở đây chứ không đè lên ảnh: nhãn dài nhất
              ("Ngừng khai thác" / "Under maintenance") rộng hơn tấm ảnh, đè lên là phải cắt bằng
              "…" — mà một trạng thái vận hành bị cắt cụt thì đọc ra nghĩa khác hẳn.
            */}
            {alertsLoading ? (
              <Skeleton width="70%" height={18} />
            ) : (
              <XStack flexWrap="wrap" ai="center" gap={space.xs}>
                <StatusBadge
                  label={domainLabel('vehicleOperationStatus', operationStatus, operationMeta.label)}
                  color={operationMeta.color}
                  size="sm"
                />
                <StatusBadge
                  label={domainLabel('vehiclePublicStatus', publicStatus, publicMeta.label)}
                  color={publicMeta.color}
                  size="sm"
                />
                {alertsFailed ? (
                  <Muted>{t('card.alertsUnavailable')}</Muted>
                ) : alerts ? (
                  <VehicleAlertChips alerts={alerts.alerts} max={ALERT_CHIP_LIMIT} />
                ) : null}
              </XStack>
            )}
          </YStack>
        </XStack>

        {/*
          TẦNG DƯỚI — CHỈ SỐ, đặt trên một MẶT PHẲNG RIÊNG nền mờ.

          Trước đây chỉ có một đường kẻ, và thẻ vẫn là một tấm phẳng lì: tám dòng chữ cùng cỡ,
          cùng màu mờ, mắt không có chỗ bám. Cho khối số một nền riêng thì thẻ có hai tầng độ
          sâu, và ba con số vận hành đọc ra là một CỤM chứ không phải ba dòng chữ rời.

          Mỗi dòng một biểu tượng dẫn đầu: ở cỡ 12px, hình vẽ nhận ra nhanh hơn chữ, nên mắt
          nhảy thẳng tới dòng cần đọc thay vì dò từ đầu nhãn.
        */}
        <YStack gap={space.xs} bg={colors.surfaceMuted} br={radius.sm} p={space.sm}>
          {alertsLoading ? (
            <Skeleton width="45%" height={14} />
          ) : alertsFailed || !alerts ? null : (
            <Stat icon="speedometer-outline">
              {t('row.odometer', { value: fmt.km(alerts.currentOdometerKm) })}
            </Stat>
          )}

          {statsLoading ? (
            <>
              <Skeleton width="55%" height={14} />
              <Skeleton width="40%" height={14} />
            </>
          ) : statsFailed || !stats ? (
            <Muted>{t('card.statsUnavailable')}</Muted>
          ) : (
            <>
              <Stat icon="documents-outline" tone={colors.info}>
                {t.rich('row.bookings', {
                  active: stats.activeBookings,
                  done: stats.completedBookings,
                  n: strong,
                })}
              </Stat>
              {/*
                Thu và lãi/lỗ ĐI CHUNG một dòng — hai vế của cùng một phép tính, đọc rời nhau thì
                phải nhớ số dòng trên. Chỉ có khi người xem có quyền `finance.view`.
              */}
              {hasFinance ? (
                <Stat icon="wallet-outline" tone={atLoss ? colors.danger : colors.success}>
                  {t.rich('row.income', {
                    value: fmt.moneyCompact(stats.totalIncome),
                    n: strong,
                  })}
                  {LIST_SEPARATOR}
                  {t.rich(atLoss ? 'row.loss' : 'row.profit', {
                    value: fmt.moneyCompact(absoluteMoney(profit)),
                    n: (chunks) => (
                      <Strong tone={atLoss ? colors.danger : colors.success}>{chunks}</Strong>
                    ),
                  })}
                </Stat>
              ) : null}
            </>
          )}
        </YStack>

        {/*
          Ba nút của web: Xem · Sửa · Lịch (`useVehicleRowActions`).

          "Xem" thay luôn vai mũi tên `>` ở góc — giữ cả hai là ba lối vào cùng một màn (thẻ
          bấm được, mũi tên, nút) trên một bề mặt chỉ rộng 390pt.

          CẢ BA cùng `accent` (nền vàng nhạt, viền và chữ vàng đậm), không phải một vàng hai
          trắng: ba nút này ngang hàng nhau, đều là lối vào một màn khác. Không dùng `primary`
          (nền vàng ĐẶC) vì đó là của hành động chính duy nhất của màn — nút "Thêm xe".

          `shape="square"` để bo góc 10px đúng như `RowActions` của web; pill làm ba viên thuốc
          con nằm cạnh nhau thay vì một nhóm thao tác.

          Mỗi nút bọc trong một `YStack f={1}` để BA CỘT BẰNG NHAU, chữ tự nằm giữa cột của nó.
          Không đặt `f={1}` thẳng lên `Button` được: bề rộng do `Pressable` bọc ngoài quyết định,
          còn `block` của `Button` chỉ tác động lên trục DỌC khi cha là một hàng ngang. Để chúng
          rộng theo chữ thì ba nút so le nhau ("Xem" ngắn hơn "Lịch") và hàng nút đọc ra như bị
          bỏ dở giữa chừng. Ẩn "Sửa" thì hai nút còn lại tự chia đôi.
        */}
        <XStack gap={space.xs}>
          <YStack f={1}>
            <Button
              label={t('actions.viewShort')}
              icon="eye-outline"
              variant="accent"
              size="sm"
              shape="square"
              onPress={open}
            />
          </YStack>
          {onEdit ? (
            <YStack f={1}>
              <Button
                label={t('actions.edit')}
                icon="create-outline"
                variant="accent"
                size="sm"
                shape="square"
                onPress={() => onEdit(vehicle)}
              />
            </YStack>
          ) : null}
          <YStack f={1}>
            <Button
              label={t('actions.schedule')}
              icon="calendar-outline"
              variant="accent"
              size="sm"
              shape="square"
              onPress={() => onSchedule(vehicle)}
            />
          </YStack>
        </XStack>
      </YStack>
    </Card>
  );
}

/**
 * Bộ dựng phần `<n>` dùng chung cho mọi dòng có nhãn.
 *
 * Khai ở module scope, không phải trong thân component: viết `(chunks) => <Strong>…` ngay tại
 * chỗ gọi là tám closure mới mỗi lần render, mà thẻ này nằm trong một danh sách dài.
 */
const strong = (chunks: ReactNode) => <Strong>{chunks}</Strong>;

/**
 * Một dòng trong khối chỉ số: biểu tượng dẫn đầu + chữ.
 *
 * Biểu tượng lấy màu NGỮ NGHĨA của chính con số nó dẫn (đơn = `info`, lãi/lỗ = `success`/
 * `danger`), nên trạng thái tài chính đọc được từ khoé mắt mà không cần đọc chữ. Chữ vẫn mờ:
 * tô cả dòng theo màu thì ba dòng thành ba màu và không dòng nào nổi lên nữa.
 */
function Stat({ icon, tone, children }: { icon: IconName; tone?: string; children: ReactNode }) {
  return (
    <XStack ai="center" gap={space.xs}>
      <Ionicons name={icon} size={iconSize.sm} color={tone ?? colors.textMuted} />
      <Text f={1} col={colors.textMuted} fos={fontSize.bodySm} numberOfLines={1}>
        {children}
      </Text>
    </XStack>
  );
}

/** Một dòng chỉ số ở tầng dưới của thẻ. Cùng cỡ chữ với nhau để bốn dòng đọc thành một khối. */
function Metric({ children }: { children: ReactNode }) {
  return (
    <Text col={colors.textMuted} fos={fontSize.bodySm} numberOfLines={1}>
      {children}
    </Text>
  );
}

function Muted({ children }: { children: string }) {
  return (
    <Text col={colors.textMuted} fos={fontSize.bodySm}>
      {children}
    </Text>
  );
}

/** Phần `<n>` của message: con số được nhấn, chữ dẫn quanh nó vẫn mờ — đúng vai `<b>` của web. */
function Strong({ children, tone }: { children: ReactNode; tone?: string }) {
  return (
    <Text col={tone ?? colors.text} fow={fontWeight.semibold}>
      {children}
    </Text>
  );
}

export const VehicleCard = memo(VehicleCardImpl);
