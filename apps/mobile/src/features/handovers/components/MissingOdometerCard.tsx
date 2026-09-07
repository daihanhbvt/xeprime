import { memo } from 'react';
import { Pressable } from 'react-native';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { PERMISSION } from '@xeprime/types';
import { LIST_SEPARATOR } from '@xeprime/domain';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { usePermissions } from '@/features/auth/hooks/use-permissions';
import { useNavigateOnce } from '@/hooks/use-navigate-once';
import { useAppFormat } from '@/i18n/use-app-format';
import { ROUTES } from '@/navigation/routes';
import { colors, fontSize, fontWeight, space } from '@/theme/tokens';
import type { MissingOdometerItem } from '../api';

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
  onFix: () => void;
}) {
  const t = useTranslations('Bookings.missingKm');
  const fmt = useAppFormat();
  const { has } = usePermissions();
  const navigateOnce = useNavigateOnce();
  const canResolve = has(PERMISSION.VEHICLE_ODOMETER_CORRECT);

  return (
    <Card>
      <YStack gap={space.xs}>
        {/*
          Tên xe và mã đơn đều mở ra hồ sơ tương ứng — hai cái web để là `<Link>`. Tên xe giữ
          màu chữ thường (nó là TIÊU ĐỀ thẻ, tô vàng thì cả danh sách thành một rừng link), mã
          đơn tô vàng vì nó nằm giữa một câu và phải nhìn ra được là bấm được.
        */}
        <Pressable
          onPress={() => navigateOnce(ROUTES.manage.vehicleDetail(item.vehicleId))}
          accessibilityRole="link"
          accessibilityLabel={item.vehicleName}
        >
          <Text col={colors.text} fos={fontSize.body} fow={fontWeight.semibold} numberOfLines={1}>
            {item.vehicleName}
          </Text>
        </Pressable>
        <Text col={colors.textMuted} fos={fontSize.bodySm}>
          {item.plateNumber ?? t('noPlate')}
        </Text>

        <XStack ai="center" flexWrap="wrap">
          <Pressable
            onPress={() => navigateOnce(ROUTES.manage.bookingDetail(item.bookingId))}
            accessibilityRole="link"
            accessibilityLabel={t('bookingLine', { code: item.bookingCode })}
            hitSlop={space.xs}
          >
            <Text col={colors.primaryActive} fos={fontSize.bodySm} fow={fontWeight.medium}>
              {t('bookingLine', { code: item.bookingCode })}
            </Text>
          </Pressable>
          <Text col={colors.textMuted} fos={fontSize.bodySm}>
            {LIST_SEPARATOR}
            {fmt.dateTime(item.confirmedAt)}
          </Text>
        </XStack>
        {/*
          `fmt.km(null)` tự nói "Chưa có" — biên bản GIAO cũng chưa có số thì không có mốc sàn để
          đối chiếu, và dựng 0 km ở đây là bịa ra một số đo.
        */}
        <Text col={colors.textMuted} fos={fontSize.bodySm}>
          {t('pickupKmLine', { value: fmt.km(item.pickupOdometerKm) })}
        </Text>

        {canResolve ? (
          <YStack pt={space.xs}>
            <Button label={t('fix')} onPress={onFix} />
          </YStack>
        ) : (
          <Text col={colors.textMuted} fos={fontSize.label}>
            {t('needPermission')}
          </Text>
        )}
      </YStack>
    </Card>
  );
});
