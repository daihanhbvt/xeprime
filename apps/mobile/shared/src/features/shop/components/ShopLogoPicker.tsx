import { useState } from 'react';
import { Image } from 'expo-image';
import { ActivityIndicator, Pressable, StyleSheet } from 'react-native';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { IMAGE_UPLOAD_MAX_BYTES } from '@xeprime/types';
import { useAppToast } from '@/components/feedback/use-app-toast';
import { Ionicons } from '@/components/icons/Ionicons';
import { Button } from '@/components/ui/Button';
import { FieldLabel, FieldMessage } from '@/components/ui/Field';
import { ImageSourceSheet } from '@/components/ui/ImageSourceSheet';
import { getErrorMessage } from '@/lib/get-error-message';
import { useImageErrorMessage } from '@/lib/image-permission-message';
import { pickImages, type ImageSource, type PickedImage } from '@/lib/r2-image-upload';
import { useColors } from '@/theme/ThemeProvider';
import { fontWeight, space, typeScale } from '@/theme/tokens';

/** Cùng giới hạn với web `ShopLogoPicker`. */
const LOGO_MAX_MB = Math.round(IMAGE_UPLOAD_MAX_BYTES / (1024 * 1024));

/** Ô logo vuông 96, bo 16, viền 1.5 - cùng số với web `ShopLogoPicker.module.css` `.tile`. */
const TILE = 96;
const TILE_RADIUS = 16;
const TILE_BORDER = 1.5;
/** Biểu tượng cửa hàng 24 + chữ "Tải logo" dòng 18 (web `.placeholder`). */
const TILE_ICON = 24;
const TILE_LABEL_LINE_HEIGHT = 18;

/**
 * Ô "Logo gian hàng" (ADR 0103) - bản native của web `ShopLogoPicker`: chọn ảnh và XEM TRƯỚC ở máy,
 * CHƯA tải lên. Đường ký URL ảnh gian hàng (`/uploads/shop-media/presign`) cần một gian hàng, nên
 * nơi gọi tải ảnh lên sau `POST /tenants` (form đăng ký) - hoặc ngay lúc lưu khi gian hàng đã có.
 *
 * Giao diện GIỐNG web (người dùng chốt 20/11/2026 theo ảnh web): nhãn `FieldLabel` · ô 96 bo 16 viền
 * 1.5 (trống: viền đứt `primary-glow`, nền `primary-subtle`, biểu tượng cửa hàng `ShopOutlined` 24 +
 * "Tải logo"; có ảnh: viền liền xám, ảnh lấp ô) · bên phải gợi ý 14/20 rồi nút trắng viền xám có
 * biểu tượng tải lên (`CloudUploadOutlined`, như AntD `Button` của web). Chạm ô hay nút đều mở cùng tấm chọn nguồn ảnh (chụp / thư viện) - không có xoá.
 */
export function ShopLogoPicker({
  value,
  onChange,
  error,
  disabled = false,
}: {
  value: PickedImage | null;
  onChange: (next: PickedImage | null) => void;
  /** Câu lỗi dưới ô - `null` khi không lỗi. */
  error?: string | null;
  disabled?: boolean;
}) {
  const colors = useColors();
  const t = useTranslations('ShopOnboarding.signup.fields.logo');
  const toast = useAppToast();
  const errorMessage = useImageErrorMessage(getErrorMessage);
  const [choosing, setChoosing] = useState(false);
  const [busy, setBusy] = useState(false);
  const blocked = disabled || busy;
  const invalid = Boolean(error) && !value;

  async function pick(source: ImageSource) {
    setChoosing(false);
    setBusy(true);
    try {
      const [image] = await pickImages(source, 1);
      if (image) onChange(image);
    } catch (err) {
      toast.showError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  const open = () => setChoosing(true);

  return (
    <YStack gap={space.xs}>
      <FieldLabel label={t('label')} required />
      <XStack ai="center" gap={space.md}>
        <Pressable
          onPress={open}
          disabled={blocked}
          accessibilityRole="imagebutton"
          accessibilityLabel={value ? t('change') : t('choose')}
          accessibilityState={{ disabled: blocked, busy }}
          style={({ pressed }) => (pressed ? styles.pressed : null)}
        >
          <YStack
            w={TILE}
            h={TILE}
            br={TILE_RADIUS}
            overflow="hidden"
            ai="center"
            jc="center"
            gap={space.xs}
            bw={TILE_BORDER}
            // Trống: khung chờ viền đứt vàng; có ảnh: viền liền xám, nền thẻ (web `.tileFilled`).
            borderStyle={value ? 'solid' : 'dashed'}
            bc={invalid ? colors.danger : value ? colors.border : colors.primaryGlow}
            bg={value ? colors.surface : colors.primarySubtle}
          >
            {value ? (
              <Image
                source={{ uri: value.uri }}
                style={styles.preview}
                contentFit="cover"
                accessibilityLabel={t('previewAlt')}
              />
            ) : busy ? (
              <ActivityIndicator color={colors.primaryStrong} />
            ) : (
              <>
                <Ionicons name="storefront-outline" size={TILE_ICON} color={colors.primaryStrong} />
                <Text
                  col={colors.primaryStrong}
                  fos={typeScale.body.fontSize}
                  lh={TILE_LABEL_LINE_HEIGHT}
                  fow={fontWeight.semibold}
                >
                  {t('tile')}
                </Text>
              </>
            )}
          </YStack>
        </Pressable>

        <YStack f={1} minWidth={0} gap={space.sm} ai="flex-start">
          <Text col={colors.placeholder} fos={typeScale.body.fontSize} lh={typeScale.body.lineHeight}>
            {t('hint', { maxMb: LOGO_MAX_MB })}
          </Text>
          <Button
            label={value ? t('change') : t('choose')}
            variant="neutral"
            // Cỡ nhỏ (cao 32, chữ 14) như AntD `Button` mặc định của web - nút phụ cạnh ô logo.
            size="sm"
            icon="cloud-upload-outline"
            block={false}
            onPress={open}
            disabled={blocked}
            loading={busy}
          />
        </YStack>
      </XStack>
      <FieldMessage error={error ?? undefined} />
      <ImageSourceSheet
        open={choosing}
        onClose={() => setChoosing(false)}
        title={t('label')}
        hint={t('hint', { maxMb: LOGO_MAX_MB })}
        onPick={(source) => void pick(source)}
        // Không có "Xoá ảnh": logo là BẮT BUỘC, xoá chỉ để lại ô trống phải chọn lại - chỉ cho ĐỔI ảnh
        // (người dùng chốt 20/11/2026).
      />
    </YStack>
  );
}

const styles = StyleSheet.create({
  pressed: { opacity: 0.85 },
  preview: { height: '100%', width: '100%' },
});
