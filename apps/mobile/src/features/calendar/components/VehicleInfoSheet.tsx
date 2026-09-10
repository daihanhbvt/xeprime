import { Ionicons } from '@expo/vector-icons';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import {
  PERMISSION,
  VEHICLE_OPERATION_STATUS,
  VEHICLE_OPERATION_STATUS_META,
  VEHICLE_TYPE,
} from '@xeprime/types';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Button } from '@/components/ui/Button';
import type { IconName } from '@/components/ui/Chip';
import { RemoteImage } from '@/components/ui/RemoteImage';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { usePermissions } from '@/features/auth/hooks/use-permissions';
import { useAppFormat } from '@/i18n/use-app-format';
import { useDomainLabel } from '@/i18n/domain';
import { colors, fontSize, fontWeight, iconSize, radius, space } from '@/theme/tokens';
import type { CalendarResource } from '../api';

/** Ảnh nhận diện ở đầu thẻ — đủ lớn để nhận ra chiếc xe, không lớn tới mức đẩy dữ liệu xuống. */
const HERO = 64;

/**
 * Thẻ thông tin xe mở từ cột xe — bản native của popover `ResourceCell` bên web.
 *
 * Cần thiết hơn hẳn ở đây so với web: cột xe trên app hẹp hơn nhiều, tên xe bị cắt, và ở chế độ
 * thu gọn thì chỉ còn tấm ảnh — nên đây là chỗ DUY NHẤT đọc được đủ tên, mã, biển số và giá.
 *
 * ## Vì sao không dùng `DataRow` như bản đầu
 *
 * `DataRow` là hàng "nhãn trái — giá trị phải" của các màn CHI TIẾT, nơi một màn có mười lăm hàng
 * và sự đều đặn chính là thứ giúp dò tìm. Ở đây chỉ có bốn mẩu, và chúng không cùng loại: mã và
 * biển số là ĐỊNH DANH (đọc để đối chiếu với chiếc xe trước mặt), còn giá là CON SỐ (đọc để trả
 * lời khách). Bày cả bốn thành bốn hàng chữ xám như nhau thì phải đọc hết mới thấy thứ cần.
 *
 * Nên: định danh nằm ngay dưới tên, dạng viên có biểu tượng; giá tách thành một khối riêng tô
 * theo `colors.price` — cùng màu web dùng cho giá (`--xp-gold-deep`) và cùng màu chấm giá riêng
 * trên lưới, nên người dùng đã học màu đó ở lưới thì gặp lại đúng nó ở đây.
 *
 * DỮ LIỆU và QUYỀN giữ nguyên bản web: cùng bốn trường, cùng luật chỉ nêu trạng thái vận hành khi
 * nó đáng chú ý, cùng `VEHICLE_VIEW` gác lối sang hồ sơ xe.
 */
export function VehicleInfoSheet({
  resource,
  onClose,
  onOpenVehicle,
}: {
  resource: CalendarResource | null;
  onClose: () => void;
  onOpenVehicle: (vehicleId: string) => void;
}) {
  const t = useTranslations('Calendar');
  const tCommon = useTranslations('Common.actions');
  const fmt = useAppFormat();
  const domainLabel = useDomainLabel();
  const { has } = usePermissions();

  const statusMeta = resource
    ? VEHICLE_OPERATION_STATUS_META[
        resource.operationStatus as keyof typeof VEHICLE_OPERATION_STATUS_META
      ]
    : undefined;
  /** Web chỉ nêu trạng thái khi nó ĐÁNG CHÚ Ý — "đang sẵn sàng"/"đang thuê" không nói thêm gì. */
  const showStatus =
    resource !== null &&
    resource.operationStatus !== VEHICLE_OPERATION_STATUS.AVAILABLE &&
    resource.operationStatus !== VEHICLE_OPERATION_STATUS.RENTING;

  return (
    <BottomSheet
      open={resource !== null}
      onClose={onClose}
      title={resource?.name ?? ''}
      subtitle={t('vehicleCard.heading')}
      footer={
        resource ? (
          <>
            {has(PERMISSION.VEHICLE_VIEW) ? (
              <Button
                label={t('vehicleCard.openVehicle')}
                icon="car-sport-outline"
                onPress={() => onOpenVehicle(resource.vehicleId)}
              />
            ) : null}
            <Button
              label={tCommon('close')}
              icon="close-outline"
              variant="ghost"
              onPress={onClose}
            />
          </>
        ) : null
      }
    >
      {resource ? (
        <YStack gap={space.md}>
          {/* ── Nhận diện: ảnh + tên + hai viên định danh ─────────────────── */}
          <XStack gap={space.sm} ai="center">
            <YStack
              w={HERO}
              h={HERO}
              br={radius.md}
              ov="hidden"
              bg={colors.surfaceMuted}
              bw={1}
              bc={colors.border}
            >
              <RemoteImage
                uri={resource.mainImageUrl}
                recyclingKey={resource.id}
                fallback={
                  <Ionicons
                    name={
                      resource.vehicleType === VEHICLE_TYPE.MOTORBIKE
                        ? 'bicycle-outline'
                        : 'car-outline'
                    }
                    size={iconSize.lg}
                    color={colors.placeholder}
                  />
                }
              />
            </YStack>

            <YStack f={1} gap={space.xs} minWidth={0}>
              <Text col={colors.text} fos={fontSize.body} fow={fontWeight.semibold}>
                {resource.name}
              </Text>
              <XStack gap={space.xs} flexWrap="wrap">
                {resource.plateNumber ? (
                  <IdentityPill icon="pricetag-outline" value={resource.plateNumber} strong />
                ) : null}
                <IdentityPill icon="barcode-outline" value={resource.code} />
              </XStack>
            </YStack>
          </XStack>

          {/*
            Trạng thái vận hành — chỉ khi đáng chú ý, và ở NGAY dưới phần nhận diện.

            Nó là lý do người ta mở thẻ này ra trong tình huống bất thường ("sao chiếc này không
            nhận đơn được?"), nên nó không được nằm dưới đáy sau hai dòng giá.
          */}
          {showStatus && statusMeta ? (
            <XStack ai="center" gap={space.xs}>
              <Text col={colors.textMuted} fos={fontSize.label}>
                {t('vehicleCard.operationStatus')}
              </Text>
              <StatusBadge
                label={domainLabel(
                  'vehicleOperationStatus',
                  resource.operationStatus,
                  statusMeta.label,
                )}
                color={statusMeta.color}
              />
            </XStack>
          ) : null}

          {/*
            Khối GIÁ — tô theo `colors.price`, cùng màu web dùng cho giá và cùng màu chấm giá
            riêng trên lưới. Ẩn hẳn khi xe không có giá nào: một khối rỗng ở đây nói ít hơn là
            không có khối nào.
          */}
          {resource.weekdayPrice || resource.hourlyPrice ? (
            <XStack
              gap={space.md}
              p={space.sm}
              br={radius.md}
              bg={colors.primaryLight}
              bw={1}
              bc={colors.primary}
            >
              {resource.weekdayPrice ? (
                <PriceBlock
                  icon="today-outline"
                  label={t('vehicleCard.dailyPrice')}
                  value={fmt.money(resource.weekdayPrice)}
                />
              ) : null}
              {resource.hourlyPrice ? (
                <PriceBlock
                  icon="time-outline"
                  label={t('vehicleCard.hourlyPrice')}
                  value={fmt.money(resource.hourlyPrice)}
                />
              ) : null}
            </XStack>
          ) : null}
        </YStack>
      ) : null}
    </BottomSheet>
  );
}

/**
 * Viên ĐỊNH DANH — biển số hoặc mã xe.
 *
 * Biển số đậm hơn mã vì nó là thứ người trực đối chiếu với chiếc xe đang đứng trước mặt; mã xe
 * chỉ dùng khi tra trong hệ thống. `selectable` để copy được — mã xe hay phải dán sang chỗ khác.
 */
function IdentityPill({
  icon,
  value,
  strong = false,
}: {
  icon: IconName;
  value: string;
  strong?: boolean;
}) {
  return (
    <XStack
      ai="center"
      gap={4}
      px={space.xs}
      py={2}
      br={radius.sm}
      bg={colors.surfaceMuted}
      bw={1}
      bc={colors.border}
    >
      <Ionicons name={icon} size={iconSize.xs} color={colors.textMuted} />
      <Text
        col={strong ? colors.text : colors.textMuted}
        fos={fontSize.label}
        fow={strong ? fontWeight.semibold : fontWeight.medium}
        selectable
      >
        {value}
      </Text>
    </XStack>
  );
}

/** Một mức giá trong khối giá — nhãn nhỏ ở trên, con số đậm ở dưới. */
function PriceBlock({ icon, label, value }: { icon: IconName; label: string; value: string }) {
  return (
    <YStack f={1} gap={2} minWidth={0}>
      <XStack ai="center" gap={4}>
        <Ionicons name={icon} size={iconSize.xs} color={colors.primaryActive} />
        <Text col={colors.primaryActive} fos={fontSize.label} numberOfLines={1}>
          {label}
        </Text>
      </XStack>
      <Text col={colors.price} fos={fontSize.bodySm} fow={fontWeight.bold} numberOfLines={1}>
        {value}
      </Text>
    </YStack>
  );
}
