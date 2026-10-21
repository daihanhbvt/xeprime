import { useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { ActivityIndicator, Pressable, StyleSheet } from 'react-native';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import type { DriverLicence } from '@/api/driver-licence/api';
import { Button } from '@/components/ui/Button';
import { Callout } from '@/components/ui/Callout';
import { useErrorMessage } from '@/i18n/use-error-message';
import { useImageErrorMessage } from '@/lib/image-permission-message';
import { IMAGE_SOURCE, type ImageSource } from '@/lib/r2-image-upload';
import { useColors } from '@/theme/ThemeProvider';
import { fontSize, fontWeight, iconSize, radius, space } from '@/theme/tokens';
import { useDriverLicenceImage, useSubmitDriverLicence } from '../hooks/use-driver-licence';
import {
  PrepareImageError,
  pickLicenceImage,
  prepareLicenceImage,
  type PrepareImageRejection,
} from '../prepare-licence-image';

/** Tỉ lệ thẻ ID-1 (85,6 × 54 mm) — khung mang dáng mặt trước một tấm bằng lái. */
const CARD_ASPECT = 85.6 / 54;

type StepState = 'done' | 'active' | 'todo';

/**
 * Chụp / chọn ảnh mặt trước bằng lái → GỬI NGAY → tiến trình hiện TẠI CHỖ. Bản native của
 * `DriverLicenceUploader` bên web.
 *
 * Màn cảm ứng nên lối CHÍNH là chạm khung để chụp bằng camera sau (đúng như web trên điện thoại),
 * kèm lối "Chọn ảnh có sẵn". Không có bước "xem lại rồi bấm gửi": chọn xong là tải lên và máy đọc
 * luôn; ảnh không dùng được thì kết quả nói rõ vì sao và khách chụp lại ngay tại đây.
 */
export function DriverLicenceUploader({
  processing,
  onPick,
  onSubmitted,
}: {
  /** Lượt nộp ĐANG ĐƯỢC ĐỌC ở server (`processing`), hoặc `null`. */
  processing: DriverLicence | null;
  /** Khách vừa chọn một ảnh mới — nơi chứa ẩn kết quả CŨ đi. */
  onPick?: () => void;
  /** Tải xong (lượt nộp đã sang "đang đọc"). */
  onSubmitted?: () => void;
}) {
  const colors = useColors();
  const t = useTranslations('DriverLicence');
  const apiErrorMessage = useErrorMessage();
  const imageErrorMessage = useImageErrorMessage(apiErrorMessage);
  const submit = useSubmitDriverLicence();

  const [previewUri, setPreviewUri] = useState<string | null>(null);
  const [preparing, setPreparing] = useState(false);
  const [rejection, setRejection] = useState<PrepareImageRejection | null>(null);
  const [pickError, setPickError] = useState<string | null>(null);

  // Máy đọc xong (lượt nộp rời `processing`): về lại trạng thái chọn ảnh cho lần sau.
  const processingId = processing?.id ?? null;
  const [trackedId, setTrackedId] = useState<string | null>(processingId);
  if (trackedId !== processingId) {
    setTrackedId(processingId);
    if (processingId === null && !submit.isPending) setPreviewUri(null);
  }

  // Mở lại màn giữa lúc máy đang đọc thì không còn ảnh cục bộ — lấy ảnh đã nộp từ server.
  const serverImage = useDriverLicenceImage(processing && !previewUri ? processing.id : null);

  const busy = preparing || submit.isPending || processing !== null;

  async function pick(source: ImageSource) {
    if (busy) return;
    setRejection(null);
    setPickError(null);
    submit.reset();
    let raw;
    try {
      raw = await pickLicenceImage(source);
    } catch (error) {
      setPickError(imageErrorMessage(error));
      return;
    }
    if (!raw) return; // Huỷ — không phải lỗi.
    onPick?.();
    setPreparing(true);
    let prepared;
    try {
      prepared = await prepareLicenceImage(raw);
    } catch (error) {
      setRejection(error instanceof PrepareImageError ? error.reason : 'unsupported');
      setPreparing(false);
      return;
    }
    setPreviewUri(prepared.uri);
    setPreparing(false);
    submit.mutate(prepared, {
      onSuccess: () => onSubmitted?.(),
      // Tải hỏng: bỏ ảnh xem trước, khách chọn lại ngay ở đây (lỗi hiện bên dưới).
      onError: () => setPreviewUri(null),
    });
  }

  const steps: { key: 'upload' | 'read' | 'check'; state: StepState }[] = [
    { key: 'upload', state: processing ? 'done' : 'active' },
    { key: 'read', state: processing ? 'active' : 'todo' },
    { key: 'check', state: 'todo' },
  ];
  const image = previewUri ?? serverImage.data?.url ?? null;

  return (
    <YStack gap={space.sm}>
      {busy ? (
        <YStack
          w="100%"
          aspectRatio={CARD_ASPECT}
          br={radius.lg}
          ov="hidden"
          bw={1}
          bc={colors.border}
          bg={colors.surfaceMuted}
          ai="center"
          jc="center"
        >
          {image ? (
            <Image
              source={{ uri: image }}
              style={StyleSheet.absoluteFill}
              contentFit="cover"
              accessibilityIgnoresInvertColors
            />
          ) : null}
          <ActivityIndicator color={colors.primary} />
        </YStack>
      ) : (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('picker.tapTitle')}
          onPress={() => void pick(IMAGE_SOURCE.CAMERA)}
        >
          <YStack
            w="100%"
            aspectRatio={CARD_ASPECT}
            br={radius.lg}
            bw={2}
            borderStyle="dashed"
            bc={colors.borderInput}
            bg={colors.surface}
            p={space.md}
          >
            {/* Dải tiêu đề của tấm bằng — chỉ để nhận ra dáng, không chữ. */}
            <YStack
              alignSelf="center"
              w="44%"
              h={6}
              br={radius.pill}
              bg={colors.border}
              mb={space.md}
            />
            <XStack f={1} gap={space.md} ai="center">
              <YStack
                w="26%"
                aspectRatio={3 / 4}
                br={radius.md}
                bw={1}
                bc={colors.border}
                ai="center"
                jc="center"
              >
                <Ionicons name="person" size={iconSize.lg} color={colors.borderInput} />
              </YStack>
              <YStack f={1} gap={space.xs}>
                <Ionicons name="camera-outline" size={iconSize.lg} color={colors.primaryActive} />
                <Text col={colors.text} fos={fontSize.body} fow={fontWeight.semibold}>
                  {t('picker.tapTitle')}
                </Text>
                <Text col={colors.textMuted} fos={fontSize.label}>
                  {t('picker.hint')}
                </Text>
              </YStack>
            </XStack>
          </YStack>
        </Pressable>
      )}

      {busy ? (
        <YStack gap={space.xs} accessibilityLiveRegion="polite">
          <Text col={colors.text} fos={fontSize.body} fow={fontWeight.semibold}>
            {preparing ? t('picker.preparing') : t('progress.title')}
          </Text>
          {steps.map((step) => (
            <XStack key={step.key} gap={space.xs} ai="center">
              {step.state === 'done' ? (
                <Ionicons name="checkmark-circle" size={iconSize.sm} color={colors.success} />
              ) : step.state === 'active' ? (
                <ActivityIndicator size="small" color={colors.primary} />
              ) : (
                <Ionicons name="ellipse-outline" size={iconSize.sm} color={colors.borderInput} />
              )}
              <Text
                col={step.state === 'todo' ? colors.textMuted : colors.text}
                fos={fontSize.bodySm}
                fow={step.state === 'active' ? fontWeight.semibold : fontWeight.regular}
              >
                {t(`progress.steps.${step.key}`)}
              </Text>
            </XStack>
          ))}
          <Text col={colors.textMuted} fos={fontSize.label}>
            {t('progress.hint')}
          </Text>
        </YStack>
      ) : (
        <Button
          label={t('picker.chooseFile')}
          icon="images-outline"
          variant="ghost"
          onPress={() => void pick(IMAGE_SOURCE.LIBRARY)}
        />
      )}

      {rejection ? <Callout tone="warning">{t(`prepare.${rejection}`)}</Callout> : null}
      {pickError ? <Callout tone="danger">{pickError}</Callout> : null}
      {submit.isError ? <Callout tone="danger">{imageErrorMessage(submit.error)}</Callout> : null}
    </YStack>
  );
}
