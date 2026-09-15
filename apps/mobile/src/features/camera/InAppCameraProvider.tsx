import { Ionicons } from '@expo/vector-icons';
import { CameraView, useCameraPermissions, type CameraType, type FlashMode } from 'expo-camera';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Image, Modal, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { Button } from '@/components/ui/Button';
import { fieldFontSize, iconSize, radius, sizing, space } from '@/theme/tokens';
import {
  CameraPermissionDeniedError,
  registerInAppCameraHost,
  type CapturedPhoto,
} from './in-app-camera';

/**
 * Chất lượng JPEG lúc chụp. Bản nén thật vẫn do `pickImages`/`pickHandoverPhoto` làm sau đó ở
 * 0.7 — số này chỉ quyết định file trung gian to bao nhiêu, và trên máy RAM thấp thì file trung
 * gian chính là thứ đáng lo.
 */
const CAPTURE_QUALITY = 0.8;

/** Đường kính nút chụp. Cố ý lớn hơn `sizing.touchTarget`: nó là mục tiêu ngón cái khi giơ máy. */
const SHUTTER_SIZE = 72;

/**
 * Khung ngắm luôn ĐEN và chữ trên nó luôn TRẮNG, kể cả khi app đổi chủ đề — đây là mặt kính máy
 * ảnh, không phải một trang nội dung, nên nó không lấy màu từ bảng token của chủ đề.
 */
const ON_CAMERA = '#fff';
const VIEWFINDER = '#000';

const styles = StyleSheet.create({
  root: { backgroundColor: VIEWFINDER, flex: 1 },
  camera: { flex: 1 },
  preview: { flex: 1, resizeMode: 'contain' },
  shutterRing: {
    alignItems: 'center',
    borderColor: ON_CAMERA,
    borderRadius: SHUTTER_SIZE / 2,
    borderWidth: 4,
    height: SHUTTER_SIZE,
    justifyContent: 'center',
    width: SHUTTER_SIZE,
  },
  shutterCore: {
    backgroundColor: ON_CAMERA,
    borderRadius: (SHUTTER_SIZE - 16) / 2,
    height: SHUTTER_SIZE - 16,
    width: SHUTTER_SIZE - 16,
  },
  iconButton: {
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.45)',
    borderRadius: radius.pill,
    height: sizing.touchTarget,
    justifyContent: 'center',
    width: sizing.touchTarget,
  },
  spacer: { width: sizing.touchTarget },
});

const FLASH_ICON = {
  off: 'flash-off-outline',
  auto: 'flash-outline',
  on: 'flash',
} as const satisfies Record<FlashMode, string>;

/** `off → auto → on → off`. Ba trạng thái trên MỘT nút: thanh trên chật không nuôi nổi ba nút. */
const NEXT_FLASH = { off: 'auto', auto: 'on', on: 'off' } as const satisfies Record<
  FlashMode,
  FlashMode
>;

type Resolver = (photo: CapturedPhoto | null) => void;

/**
 * Máy ảnh chạy TRONG app, thay cho `ImagePicker.launchCameraAsync`.
 *
 * Lý do tồn tại nằm ở docblock của `captureInAppPhoto` — tóm tắt: mở app Máy ảnh của hệ điều
 * hành đẩy XePrime xuống nền, và Android giết nó ở đó để lấy RAM cho máy ảnh. Màn này không bao
 * giờ rời app, nên không có gì để hệ điều hành giết.
 *
 * Mount MỘT lần ở layout gốc. Nó không vẽ gì cho tới khi có người gọi `captureInAppPhoto()`, nên
 * `CameraView` — vốn giữ một phiên camera của phần cứng — chỉ tồn tại đúng lúc đang chụp.
 */
export function InAppCameraProvider() {
  const t = useTranslations('Common.camera');
  const insets = useSafeAreaInsets();
  const [permission, requestPermission] = useCameraPermissions();

  const cameraRef = useRef<CameraView>(null);
  const resolverRef = useRef<Resolver | null>(null);

  const [open, setOpen] = useState(false);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [facing, setFacing] = useState<CameraType>('back');
  const [flash, setFlash] = useState<FlashMode>('off');
  const [preview, setPreview] = useState<CapturedPhoto | null>(null);

  /** Đóng màn và TRẢ LỜI promise đúng một lần — bỏ sót một nhánh là nơi gọi treo vĩnh viễn. */
  const finish = useCallback((photo: CapturedPhoto | null) => {
    const resolve = resolverRef.current;
    resolverRef.current = null;
    setOpen(false);
    setPreview(null);
    setReady(false);
    setBusy(false);
    resolve?.(photo);
  }, []);

  useEffect(() => {
    registerInAppCameraHost(async () => {
      const granted = permission?.granted ? permission : await requestPermission();
      if (!granted.granted) throw new CameraPermissionDeniedError();

      /*
       * Huỷ lượt trước nếu còn treo. Xảy ra khi người dùng chạm hai ô ảnh gần như cùng lúc: chỉ
       * có MỘT màn camera, nên lượt cũ phải được trả lời chứ không bị bỏ rơi.
       */
      resolverRef.current?.(null);

      return new Promise<CapturedPhoto | null>((resolve) => {
        resolverRef.current = resolve;
        setPreview(null);
        setOpen(true);
      });
    });

    return () => registerInAppCameraHost(null);
  }, [permission, requestPermission]);

  async function capture() {
    if (!ready || busy) return;
    setBusy(true);
    try {
      /*
       * KHÔNG bật `skipProcessing`: nó bỏ cả khâu xoay ảnh theo cảm biến, nên mọi tấm chụp dọc
       * lên R2 đều nằm ngang — web hiện ảnh bằng `<img>`, vốn không đọc EXIF để tự xoay lại.
       */
      const shot = await cameraRef.current?.takePictureAsync({
        quality: CAPTURE_QUALITY,
        exif: false,
        imageType: 'jpg',
      });
      if (shot) setPreview({ uri: shot.uri, width: shot.width, height: shot.height });
    } finally {
      setBusy(false);
    }
  }

  /** Người dùng đã từ chối vĩnh viễn — chỉ còn đường vào Cài đặt, nói ra thay vì để họ chạm mãi. */
  const blocked = permission != null && !permission.granted && !permission.canAskAgain;

  return (
    <Modal
      visible={open}
      animationType="slide"
      statusBarTranslucent
      onRequestClose={() => finish(null)}
    >
      <View style={styles.root}>
        {preview ? (
          <Image source={{ uri: preview.uri }} style={styles.preview} />
        ) : (
          <CameraView
            ref={cameraRef}
            style={styles.camera}
            facing={facing}
            flash={flash}
            // Tiếng màn trập không giúp gì khi chụp hiện trạng xe, và rất chói trong gara kín.
            animateShutter={false}
            mute
            onCameraReady={() => setReady(true)}
            onMountError={() => finish(null)}
          />
        )}

        <XStack
          pos="absolute"
          top={insets.top + space.sm}
          left={space.md}
          right={space.md}
          jc="space-between"
          ai="center"
        >
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('close')}
            onPress={() => finish(null)}
            style={styles.iconButton}
          >
            <Ionicons name="close" size={iconSize.lg} color={ON_CAMERA} />
          </Pressable>

          {preview ? null : (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('flash')}
              onPress={() => setFlash(NEXT_FLASH[flash])}
              style={styles.iconButton}
            >
              <Ionicons name={FLASH_ICON[flash]} size={iconSize.lg} color={ON_CAMERA} />
            </Pressable>
          )}
        </XStack>

        <YStack
          pos="absolute"
          bottom={0}
          left={0}
          right={0}
          pb={insets.bottom + space.lg}
          px={space.lg}
        >
          {blocked ? (
            <Text col={ON_CAMERA} fos={fieldFontSize.message} ta="center" pb={space.md}>
              {t('permissionBlocked')}
            </Text>
          ) : null}

          {preview ? (
            <XStack gap={space.sm}>
              <YStack flexShrink={0}>
                <Button
                  label={t('retake')}
                  variant="ghost"
                  block={false}
                  onPress={() => setPreview(null)}
                />
              </YStack>
              <YStack f={1}>
                <Button
                  label={t('usePhoto')}
                  icon="checkmark-outline"
                  onPress={() => finish(preview)}
                />
              </YStack>
            </XStack>
          ) : (
            <XStack ai="center" jc="space-between">
              {/* Giữ nút chụp ở CHÍNH GIỮA màn: nó cân với nút lật máy ở mép phải. */}
              <View style={styles.spacer} />

              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t('shutter')}
                accessibilityState={{ disabled: !ready || busy }}
                disabled={!ready || busy}
                onPress={() => void capture()}
                style={styles.shutterRing}
              >
                {busy ? (
                  <ActivityIndicator color={ON_CAMERA} />
                ) : (
                  <View style={[styles.shutterCore, { opacity: ready ? 1 : 0.4 }]} />
                )}
              </Pressable>

              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t('flip')}
                onPress={() => setFacing((current) => (current === 'back' ? 'front' : 'back'))}
                style={styles.iconButton}
              >
                <Ionicons name="camera-reverse-outline" size={iconSize.lg} color={ON_CAMERA} />
              </Pressable>
            </XStack>
          )}
        </YStack>
      </View>
    </Modal>
  );
}
