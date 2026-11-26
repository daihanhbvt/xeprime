import { memo } from 'react';
import { Pressable } from 'react-native';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { PERMISSION } from '@xeprime/types';
import { FONT_FAMILY } from '@/theme/fonts';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { usePermissions } from '@/features/auth/hooks/use-permissions';
import { useNavigateOnce } from '@/hooks/use-navigate-once';
import { useAppFormat } from '@/i18n/use-app-format';
import { ROUTES } from '@/navigation/routes';
import { useColors } from '@/theme/ThemeProvider';
import { fontWeight, radius, space } from '@/theme/tokens';
import type { MissingOdometerItem } from '../api';

/** Cỡ chữ 14/20 và 12/18 - cùng thẻ bảo dưỡng. */
const body = { fos: 14, lh: 20 } as const;
const small = { fos: 12, lh: 18 } as const;

/**
 * Một việc trong hàng đợi "Thiếu KM trả" — bản native của THẺ mà web dựng ở bề ngang điện thoại
 * (`MissingReturnKmQueue`, nhánh `isMobile`).
 *
 * Cùng bốn dòng và cùng thứ tự với web: tên xe · biển số · `Đơn <mã> · <giờ xác nhận>` ·
 * `KM lúc giao: <số>`, rồi một nút VÀNG ĐẶC chiếm trọn bề ngang. Không thêm icon cảnh báo hay
 * hàng nhãn–giá trị hai cột: cả danh sách này đã là "việc đang thiếu", nhắc lại ở từng dòng chỉ
 * ăn chỗ.
 *
 * Nút chỉ hiện khi có `vehicles.odometer.correct`; thiếu quyền thì nói thẳng cần quyền gì thay vì
 * để một nút bấm vào là báo lỗi.
 */
export const MissingOdometerCard = memo(function MissingOdometerCard({
  item,
  onFix,
}: {
  item: MissingOdometerItem;
  /**
   * Nhận CHÍNH bản ghi, không phải một closure đã đóng sẵn nó.
   *
   * `onFix={() => setResolving(item)}` ở `renderItem` là một hàm mới ở mỗi lượt render, và
   * `memo` so nông nên nó vô hiệu hoá đúng lớp chắn mà `memo` dựng lên. Truyền bản ghi thì
   * nơi gọi `useCallback` được một lần và thẻ chỉ dựng lại khi bản ghi của nó thật sự đổi.
   */
  onFix: (item: MissingOdometerItem) => void;
}) {
  const colors = useColors();
  const t = useTranslations('Bookings.missingKm');
  const fmt = useAppFormat();
  const { has } = usePermissions();
  const navigateOnce = useNavigateOnce();
  const canResolve = has(PERMISSION.VEHICLE_ODOMETER_CORRECT);

  /*
    Cùng khuôn thẻ bảo dưỡng (Figma `_Kanban Items` 24512:121616) - người dùng chốt 25/11/2026:
    đầu thẻ tên xe 14/20 + biển số 12/18; ô xám hai hàng (đơn · giờ xác nhận / người xác nhận ·
    KM lúc giao); vạch ngăn + nút vàng trọn bề ngang, không icon.
  */
  return (
    <Card>
      <YStack gap={12}>
        <Pressable
          onPress={() => navigateOnce(ROUTES.manage.vehicleDetail(item.vehicleId))}
          accessibilityRole="link"
          accessibilityLabel={item.vehicleName}
        >
          <YStack gap={2}>
            <Text col={colors.text} {...body} fontFamily={FONT_FAMILY.semibold} fow={fontWeight.semibold} numberOfLines={1}>
              {item.vehicleName}
            </Text>
            <Text col={colors.textMuted} {...small} fontFamily={FONT_FAMILY.body} numberOfLines={1}>
              {item.plateNumber ?? t('noPlate')}
            </Text>
          </YStack>
        </Pressable>

        <YStack px={12} py={space.sm} br={radius.control} bg={colors.background} gap={6}>
          <XStack jc="space-between" ai="center" gap={space.sm}>
            <Pressable
              onPress={() => navigateOnce(ROUTES.manage.bookingDetail(item.bookingId))}
              accessibilityRole="link"
              accessibilityLabel={t('bookingLine', { code: item.bookingCode })}
              hitSlop={space.xs}
            >
              <Text col={colors.infoStrong} {...small} fontFamily={FONT_FAMILY.semibold} fow={fontWeight.semibold} numberOfLines={1}>
                {t('bookingLine', { code: item.bookingCode })}
              </Text>
            </Pressable>
            <Text col={colors.textMuted} {...small} fontFamily={FONT_FAMILY.body} numberOfLines={1} flexShrink={1}>
              {fmt.dateTime(item.confirmedAt)}
            </Text>
          </XStack>
          {/*
            `fmt.km(null)` tự nói "Chưa có" - biên bản GIAO cũng chưa có số thì không có mốc sàn.
            Người xác nhận đứng trái: người đi sửa cần biết hỏi ai trước khi ghi đè con số.
          */}
          <XStack jc="space-between" ai="center" gap={space.sm}>
            <Text col={colors.textMuted} {...small} fontFamily={FONT_FAMILY.body} numberOfLines={1} flexShrink={1}>
              {item.confirmedByName ?? ''}
            </Text>
            <Text
              col={item.pickupOdometerKm == null ? colors.warningHigh : colors.text}
              {...small}
              fontFamily={FONT_FAMILY.semibold}
              fow={fontWeight.semibold}
              numberOfLines={1}
            >
              {t('pickupKmLine', { value: fmt.km(item.pickupOdometerKm) })}
            </Text>
          </XStack>
        </YStack>

        {canResolve ? (
          <YStack gap={12}>
            <YStack h={1} bg={colors.border} />
            <Button label={t('fix')} variant="gradient" size="compact" onPress={() => onFix(item)} />
          </YStack>
        ) : (
          <Text col={colors.textMuted} {...small} fontFamily={FONT_FAMILY.body}>
            {t('needPermission')}
          </Text>
        )}
      </YStack>
    </Card>
  );
});
