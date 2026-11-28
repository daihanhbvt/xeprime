import { memo, type ReactNode } from 'react';
import { ActivityIndicator, Pressable } from 'react-native';
import { Text, XStack, YStack } from 'tamagui';
import { LineIcon } from '@/components/icons/LineIcon';
import { Card } from '@/components/ui/Card';
import { RemoteImage } from '@/components/ui/RemoteImage';
import { HandoverSlotSample } from '@/features/handovers/components/HandoverSlotSample';
import { useColors } from '@/theme/ThemeProvider';
import { fontWeight, radius, space, typeScale } from '@/theme/tokens';

/** Figma "Vehice img - Edit" (`24231:106764`): ảnh cao 100 bo 12, thẻ đệm 4 bo 16, hai ô cách 12. */
const TILE_IMAGE_HEIGHT = 100;
const TILE_IMAGE_RADIUS = space.sm + space.xs;
const TILE_PAD = space.xs;
/** Hàng nhãn + icon cao 30 (đệm 4), hai icon cách 6. */
const TILE_LABEL_HEIGHT = 30;
/** Ô trống (Figma `I24231:106993`): hình 68 ở đỉnh, khối chữ bắt đầu ở 63 - đè nhẹ đáy hình. */
const EMPTY_ART = 68;
const EMPTY_TEXT_TOP = 63;
const TILE_ICON_GAP = 6;
/** Hai cột trừ nửa khe; `flexWrap` giữ đủ hai ô một hàng. */
export const VEHICLE_IMAGE_TILE_WIDTH = '47.5%';
export const VEHICLE_IMAGE_TILE_GAP = space.md;

/**
 * MỘT ô ảnh của lưới ảnh xe (Figma "Vehice img - Edit"): ảnh 100 bo 12 (hoặc hình ô trống + nhãn +
 * "JPG, PNG, JPEG, WEBP"), dưới là nhãn góc chụp + Delete 2 · Edit 2. Chỉ VẼ - việc tải/xoá/thay do
 * nơi gọi nối vào (`onPressImage` · `onRemove` · `onReplace`). Dùng chung cho mục Hình ảnh của màn
 * sửa xe và lưới "Ảnh xe" của wizard thêm xe (kể cả ô "Cà vẹt xe").
 */
export const VehicleImageTile = memo(function VehicleImageTile({
  uri,
  label,
  imageLabel,
  emptyHint,
  badge,
  onPressImage,
  imagePressDisabled = false,
  pressLabel,
  onRemove,
  removeLabel,
  onReplace,
  replaceLabel,
  replaceDisabled = false,
  busy = false,
  selected = false,
  error = false,
  dropTarget,
  footer,
}: {
  /** Ảnh đang có (URL hoặc tệp cục bộ) - `null` = ô trống. */
  uri: string | null;
  /** Nhãn NGẮN dưới ảnh ("Mặt trước"). */
  label: string;
  /** Nhãn trình đọc màn hình cho tấm ảnh. */
  imageLabel: string;
  /** Dòng phụ của ô trống (định dạng ảnh nhận). */
  emptyHint: string;
  /** Viên trên góc ảnh ("Ảnh bìa"). */
  badge?: string | null;
  onPressImage?: () => void;
  imagePressDisabled?: boolean;
  pressLabel: string;
  onRemove?: (() => void) | null;
  removeLabel?: string;
  onReplace?: (() => void) | null;
  replaceLabel?: string;
  replaceDisabled?: boolean;
  /** Đang tải/đọc ảnh - phủ vòng xoay lên ảnh. */
  busy?: boolean;
  /** Ảnh đang được nhấc (chế độ đổi chỗ). */
  selected?: boolean;
  /** Ô bắt buộc còn trống sau khi đã bấm Tiếp tục - viền đỏ. */
  error?: boolean;
  /** Ô là đích thả của chế độ đổi chỗ - chạm cả thẻ để thả. */
  dropTarget?: { onPress: () => void; label: string } | null;
  footer?: ReactNode;
}) {
  const colors = useColors();
  return (
    <YStack w={VEHICLE_IMAGE_TILE_WIDTH}>
      <Card
        padded={false}
        lift="flat"
        {...(error ? { borderColor: colors.danger } : {})}
        {...(dropTarget ? { onPress: dropTarget.onPress, accessibilityLabel: dropTarget.label } : {})}
      >
        <YStack
          p={TILE_PAD}
          gap={TILE_PAD}
          {...(dropTarget ? { bw: 1, bc: colors.primary, br: radius.card } : {})}
        >
          <Pressable
            disabled={imagePressDisabled || !onPressImage}
            accessibilityRole="button"
            accessibilityLabel={pressLabel}
            onPress={onPressImage}
          >
            <YStack
              h={TILE_IMAGE_HEIGHT}
              br={TILE_IMAGE_RADIUS}
              ov="hidden"
              bg={colors.background}
              {...(uri ? {} : { ai: 'center' as const })}
              {...(selected ? { bw: 3, bc: colors.primary } : {})}
            >
              {uri ? (
                <RemoteImage
                  uri={uri}
                  fallback={null}
                  contentFit="cover"
                  accessibilityLabel={imageLabel}
                />
              ) : (
                <>
                  {/* Figma "Empty State" 68 sát mép trên - cùng hình ô trống của ảnh bàn giao. */}
                  <HandoverSlotSample width={EMPTY_ART} />
                  <YStack pos="absolute" top={EMPTY_TEXT_TOP} left={0} right={0} ai="center" gap={2}>
                    <Text
                      col={colors.placeholder}
                      fos={typeScale.label.fontSize}
                      lh={typeScale.label.lineHeight}
                      ta="center"
                    >
                      {label}
                    </Text>
                    <Text
                      col={colors.textPlaceholder}
                      fos={typeScale.caption.fontSize}
                      lh={typeScale.caption.lineHeight}
                      ta="center"
                    >
                      {emptyHint}
                    </Text>
                  </YStack>
                </>
              )}
              {uri && badge ? (
                <YStack
                  pos="absolute"
                  top={space.sm}
                  right={space.sm}
                  px={space.sm}
                  py={2}
                  br={radius.pill}
                  bw={1}
                  bc={colors.brandBorder}
                  bg={colors.brandLow}
                >
                  <Text
                    col={colors.brandLink}
                    fos={typeScale.label.fontSize}
                    lh={typeScale.label.lineHeight}
                    fow={fontWeight.medium}
                  >
                    {badge}
                  </Text>
                </YStack>
              ) : null}
              {busy ? (
                <YStack
                  pos="absolute"
                  top={0}
                  left={0}
                  right={0}
                  bottom={0}
                  ai="center"
                  jc="center"
                  bg={colors.overlay}
                  accessibilityRole="progressbar"
                >
                  <ActivityIndicator color={colors.primary} />
                </YStack>
              ) : null}
            </YStack>
          </Pressable>

          {/* Nhãn góc chụp + Delete 2 · Edit 2 (Figma, khung 20, cách 6). */}
          <XStack h={TILE_LABEL_HEIGHT} p={TILE_PAD} ai="center" gap={TILE_ICON_GAP}>
            <Text
              f={1}
              minWidth={0}
              col={colors.textMuted}
              fos={typeScale.label.fontSize}
              lh={typeScale.label.lineHeight}
              fow={fontWeight.medium}
              numberOfLines={1}
            >
              {label}
            </Text>
            {uri && onRemove ? (
              <Pressable
                onPress={onRemove}
                hitSlop={space.sm}
                accessibilityRole="button"
                accessibilityLabel={removeLabel ?? label}
              >
                <LineIcon name="delete-2" size={20} color={colors.placeholder} />
              </Pressable>
            ) : null}
            {uri && onReplace ? (
              <Pressable
                onPress={onReplace}
                hitSlop={space.sm}
                disabled={replaceDisabled}
                accessibilityRole="button"
                accessibilityLabel={replaceLabel ?? label}
              >
                <LineIcon name="edit" color={colors.placeholder} />
              </Pressable>
            ) : null}
          </XStack>
          {footer}
        </YStack>
      </Card>
    </YStack>
  );
});
