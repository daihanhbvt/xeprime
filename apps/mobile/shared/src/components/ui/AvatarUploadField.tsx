import { ActivityIndicator, Pressable } from 'react-native';
import { Text, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { useController, type Control, type FieldValues, type Path } from 'react-hook-form';
import type { UploadMeta, UploadPresign } from '@/api/vehicles/api';
import { Avatar } from './Avatar';
import { Button } from './Button';
import { useImageUpload } from './use-image-upload';
import { useColors } from '@/theme/ThemeProvider';
import { fontSize, radius, space } from '@/theme/tokens';

/** Web `AvatarUploadField` mặc định `size = 104`. */
const AVATAR_SIZE = 104;
/** Chữ lỗi không tràn rộng hơn khối ảnh nhiều (web `.error { max-width: 220px }`). */
const ERROR_MAX_WIDTH = 220;

interface Props<T extends FieldValues> {
  control: Control<T>;
  name: Path<T>;
  /** Tên dựng chữ cái đầu khi chưa có ảnh (web `fallbackName`). */
  fallbackName: string;
  /** Tiêu đề tấm chọn nguồn ảnh (Chụp ảnh / Thư viện) - không vẽ thành nhãn trên ô. */
  title: string;
  presign: (meta: UploadMeta) => Promise<UploadPresign>;
  disabled?: boolean;
}

/**
 * Ô ẢNH ĐẠI DIỆN dạng TRÒN - bản native của web `AvatarUploadField` (người dùng chốt 19/11/2026:
 * "ảnh đại diện hình tròn như website"): ảnh tròn 104 căn giữa (chưa có ảnh thì chữ cái đầu trên
 * nền gold), nút nhỏ có máy ảnh "Tải ảnh lên" / "Thay đổi" ngay dưới, lỗi căn giữa dưới nút.
 * Chạm vào ảnh cũng mở bảng chọn - đó là chỗ ngón tay tìm tới đầu tiên trên mobile.
 *
 * Cùng đường tải với `ImageUploadField` (`useImageUpload`: chọn/chụp rồi PUT thẳng lên R2 qua
 * presign), chỉ khác hình. Không có nút xoá - ảnh này bắt buộc với chủ xe cá nhân (web cũng không).
 */
export function AvatarUploadField<T extends FieldValues>({
  control,
  name,
  fallbackName,
  title,
  presign,
  disabled = false,
}: Props<T>) {
  const colors = useColors();
  const t = useTranslations('Common.components.imageUpload');
  const { field, fieldState } = useController({ control, name });
  const url = (field.value as string | null | undefined) || null;

  const upload = useImageUpload({
    title,
    presign,
    remaining: 1,
    onUploaded: (uploaded) => field.onChange(uploaded[0]),
  });
  const blocked = disabled || upload.busy;

  return (
    <YStack ai="center" gap={space.sm}>
      <Pressable
        onPress={upload.open}
        disabled={blocked}
        accessibilityRole="imagebutton"
        accessibilityLabel={url ? t('change') : t('upload')}
      >
        <YStack
          br={radius.pill}
          bw={fieldState.error ? 2 : 1}
          bc={fieldState.error ? colors.danger : colors.primary}
          p={2}
        >
          <Avatar name={fallbackName} url={url} size={AVATAR_SIZE} gradient />
          {upload.busy ? (
            <YStack
              position="absolute"
              t={2}
              l={2}
              w={AVATAR_SIZE}
              h={AVATAR_SIZE}
              br={radius.pill}
              ai="center"
              jc="center"
              bg={colors.overlay}
            >
              <ActivityIndicator color={colors.textInverse} />
            </YStack>
          ) : null}
        </YStack>
      </Pressable>

      <Button
        label={url ? t('change') : t('upload')}
        icon="camera-outline"
        variant="secondary"
        size="sm"
        shape="square"
        block={false}
        align="center"
        loading={upload.busy}
        disabled={blocked}
        onPress={upload.open}
      />

      {fieldState.error?.message ? (
        <Text
          maxWidth={ERROR_MAX_WIDTH}
          ta="center"
          col={colors.danger}
          fos={fontSize.bodySm}
          accessibilityRole="alert"
        >
          {fieldState.error.message}
        </Text>
      ) : null}

      {upload.sheet}
    </YStack>
  );
}
