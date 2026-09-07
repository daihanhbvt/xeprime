import { useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { Pressable, ScrollView, StyleSheet } from 'react-native';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { useController, type Control, type FieldValues, type Path } from 'react-hook-form';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { FieldLabel } from '@/components/ui/Field';
import { PhotoViewer } from '@/components/ui/PhotoViewer';
import { Button } from '@/components/ui/Button';
import { useAppToast } from '@/components/feedback/use-app-toast';
import { useErrorMessage } from '@/i18n/use-error-message';
import { useImageErrorMessage } from '@/lib/image-permission-message';
import {
  IMAGE_SOURCE,
  pickImages,
  uploadImageToR2,
  type ImageSource,
} from '@/lib/r2-image-upload';
import { colors, fontSize, iconSize, radius, sizing, space } from '@/theme/tokens';
import { vehiclesApi } from '../api';

const TILE = 96;

/**
 * Tỉ lệ khung ảnh ĐẠI DIỆN. 16:9 vì đó là tỉ lệ ảnh chợ hiển thị — xem trước sai tỉ lệ thì chủ
 * xe chọn một tấm đẹp ở đây rồi ra chợ bị cắt mất đầu xe.
 */
const COVER_RATIO = 16 / 9;

/** Nền tối mờ dưới hình trắng — đủ tương phản trên cả ảnh nền sáng lẫn nền tối. */
const SCRIM = 'rgba(0,0,0,0.45)';

const styles = StyleSheet.create({
  tile: {
    width: TILE,
    height: TILE,
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceMuted,
  },
  cover: {
    width: '100%',
    aspectRatio: COVER_RATIO,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceMuted,
  },
  coverRemove: { position: 'absolute', top: space.xs, right: space.xs, zIndex: 1 },
  /* Phủ trọn khung để viên camera nằm đúng tâm dù ảnh tỉ lệ nào. */
  coverCenter: { ...StyleSheet.absoluteFillObject },
});

/** Trần thư viện ảnh — khớp `vehicleFormSchema.images.max(20)`. */
export const GALLERY_MAX = 20;

interface Props<T extends FieldValues> {
  control: Control<T>;
  /** Trường giữ MỘT url (ảnh đại diện) hoặc MẢNG url (thư viện) — `multiple` quyết định. */
  name: Path<T>;
  label: string;
  /** Nhãn mang dấu `*` đỏ — ảnh đại diện bắt buộc, thư viện thì không. */
  required?: boolean;
  multiple?: boolean;
  max?: number;
  disabled?: boolean;
}

/**
 * Chọn/chụp ảnh xe rồi tải thẳng lên R2 (VEH-06).
 *
 * Native thay `<input type="file">` của web bằng bảng chọn **Chụp ảnh / Chọn từ thư viện** —
 * đây là khác biệt NĂNG LỰC NỀN TẢNG, không phải khác biệt nghiệp vụ: cùng endpoint presign,
 * cùng trần 20 ảnh, cùng thứ được lưu (một URL công khai).
 *
 * Ảnh tải lên NGAY khi chọn, không đợi bấm Lưu: url mới là thứ đi vào payload, và một form giữ
 * mười file nhị phân trong bộ nhớ tới lúc submit là mười lần có thể mất trắng khi app bị hệ điều
 * hành thu hồi.
 */
export function VehicleImagePicker<T extends FieldValues>({
  control,
  name,
  label,
  required = false,
  multiple = false,
  max = GALLERY_MAX,
  disabled = false,
}: Props<T>) {
  const t = useTranslations('Vehicles.form.media');
  const tCommon = useTranslations('Common.actions');
  const tStates = useTranslations('Common.states');
  const toast = useAppToast();
  /* Thiếu quyền máy ảnh/thư viện có câu riêng — xem `useImageErrorMessage`. */
  const errorMessage = useImageErrorMessage(useErrorMessage());
  const { field, fieldState } = useController({ control, name });

  const [choosing, setChoosing] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const cover = !multiple;
  const urls: string[] = multiple
    ? ((field.value as string[] | null) ?? [])
    : field.value
      ? [field.value as string]
      : [];
  const full = multiple && urls.length >= max;

  async function add(source: ImageSource) {
    setChoosing(false);
    setBusy(true);
    try {
      const remaining = multiple ? max - urls.length : 1;
      const picked = await pickImages(source, remaining);
      if (picked.length === 0) return;

      const uploaded: string[] = [];
      for (const image of picked) {
        uploaded.push(await uploadImageToR2(image, (meta) => vehiclesApi.presignImage(meta)));
      }

      field.onChange(multiple ? [...urls, ...uploaded] : uploaded[0]);
    } catch (error) {
      toast.showError(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  function removeAt(url: string) {
    field.onChange(multiple ? urls.filter((item) => item !== url) : null);
  }

  return (
    <YStack gap={space.xs}>
      <XStack ai="center" jc="space-between">
        {/* Cùng `FieldLabel` với mọi ô nhập khác — khối ảnh không được có kiểu nhãn riêng. */}
        <FieldLabel label={label} required={required} />
        {multiple ? (
          <Text col={colors.textMuted} fos={fontSize.label}>
            {`${urls.length}/${max}`}
          </Text>
        ) : null}
      </XStack>

      {/*
        ẢNH ĐẠI DIỆN: một khung lớn, hai thao tác nằm ĐÈ lên chính tấm ảnh.

        Bản trước treo hai nút "Đổi ảnh" và "Xoá" thành một hàng riêng dưới khung — chiếm thêm
        một hàng, và hai nút chữ to ngang nhau đọc như hai hành động ngang hàng nhau trong khi
        một cái là sửa còn một cái là phá.

        Thao tác đè lên ảnh là ngôn ngữ native quen thuộc, và nó đã có sẵn ngay trong file này:
        các viên ảnh thư viện vốn mang dấu × ở góc. Cùng một khối ảnh thì cùng một cách xoá.

        `cover` chứ không `contain`: ô này 16:9 còn ảnh chụp thì đủ tỉ lệ, nên `contain` để lại
        hai dải xám hai bên và khung đọc ra như ảnh tải hỏng. Lấp đầy khung là cách chợ hiển thị
        tấm ảnh này, nên xem trước ở đây cũng phải lấp đầy.
      */}
      {cover ? (
        <Pressable
          onPress={() => setChoosing(true)}
          disabled={disabled || busy}
          accessibilityRole="imagebutton"
          accessibilityLabel={urls[0] ? t('changeImage') : t('addMainImage')}
        >
          {urls[0] ? (
            <YStack>
              <Image
                source={{ uri: urls[0] }}
                style={styles.cover}
                contentFit="cover"
                cachePolicy="memory-disk"
                accessible={false}
              />

              {disabled ? null : (
                <>
                  {/*
                    Xoá: THÙNG RÁC trên nền trắng ở góc trên phải. Dấu × đọc ra là "đóng/bỏ chọn";
                    thùng rác nói đúng việc đang làm — bỏ hẳn tấm ảnh đã tải lên.
                  */}
                  <Pressable
                    onPress={() => removeAt(urls[0] as string)}
                    accessibilityRole="button"
                    accessibilityLabel={tCommon('delete')}
                    hitSlop={space.xs}
                    style={styles.coverRemove}
                  >
                    <YStack bg={colors.surface} br={radius.pill} p={space.xs}>
                      <Ionicons name="trash-outline" size={iconSize.sm} color={colors.danger} />
                    </YStack>
                  </Pressable>

                  {/*
                    Camera nằm GIỮA ảnh: chạm vào đâu trên ảnh cũng đổi được, và giữa khung là chỗ
                    ngón tay rơi vào đầu tiên. Viên nền tối mờ để hình trắng đọc được trên cả ảnh
                    nền sáng lẫn nền tối.
                  */}
                  <YStack style={styles.coverCenter} ai="center" jc="center" pointerEvents="none">
                    <YStack bg={SCRIM} br={radius.pill} p={space.sm}>
                      <Ionicons name="camera" size={iconSize.lg} color={colors.textInverse} />
                    </YStack>
                  </YStack>

                </>
              )}
            </YStack>
          ) : (
            <YStack
              style={styles.cover}
              ai="center"
              jc="center"
              gap={space.xs}
              bw={1}
              bc={colors.borderInput}
              borderStyle="dashed"
            >
              <Ionicons
                name={busy ? 'cloud-upload-outline' : 'image-outline'}
                size={iconSize.lg}
                color={colors.textMuted}
              />
              <Text col={colors.textMuted} fos={fontSize.bodySm}>
                {t('addMainImage')}
              </Text>
            </YStack>
          )}
        </Pressable>
      ) : (
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <XStack gap={space.xs}>
            {urls.map((url) => (
              <YStack key={url}>
                {/*
                  Chạm viên ảnh = XEM TOÀN MÀN. Trước đó viên ảnh trơ: chỉ có dấu xoá ở góc, còn
                  chạm vào ảnh không làm gì — mà việc đầu tiên ai cũng thử với một tấm ảnh nhỏ là
                  chạm vào để xem to. Ở 96pt không nhìn ra vết xước hay móp, tức không kiểm được
                  đúng thứ người ta mở thư viện ra để kiểm.
                */}
                <Pressable
                  onPress={() => setPreview(url)}
                  accessibilityRole="imagebutton"
                  accessibilityLabel={label}
                >
                  <Image
                    source={{ uri: url }}
                    style={styles.tile}
                    cachePolicy="memory-disk"
                    accessible={false}
                  />
                </Pressable>
                {disabled ? null : (
                  <Pressable
                    onPress={() => removeAt(url)}
                    accessibilityRole="button"
                    accessibilityLabel={tCommon('delete')}
                    style={{ position: 'absolute', top: 2, right: 2 }}
                  >
                    <YStack bg={colors.surface} br={radius.pill} p={2}>
                      <Ionicons name="close" size={iconSize.sm} color={colors.danger} />
                    </YStack>
                  </Pressable>
                )}
              </YStack>
            ))}
  
            {disabled || full ? null : (
              <Pressable
                onPress={() => setChoosing(true)}
                disabled={busy}
                accessibilityRole="button"
                accessibilityLabel={label}
                style={[
                  styles.tile,
                  {
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderWidth: 1,
                    borderColor: colors.borderInput,
                    minWidth: sizing.touchTarget,
                  },
                ]}
              >
                <Ionicons
                  name={busy ? 'cloud-upload-outline' : 'add'}
                  size={iconSize.md}
                  color={colors.textMuted}
                />
              </Pressable>
            )}
          </XStack>
        </ScrollView>
      )}

      {fieldState.error?.message ? (
        <Text col={colors.danger} fos={fontSize.label}>
          {fieldState.error.message}
        </Text>
      ) : null}

      <PhotoViewer
        url={preview}
        unavailableLabel={tStates('imageUnavailable')}
        onClose={() => setPreview(null)}
      />

      <BottomSheet open={choosing} onClose={() => setChoosing(false)} title={label}>
        <YStack gap={space.sm}>
          <Button
            label={t('takePhoto')}
            icon="camera-outline"
            variant="secondary"
            onPress={() => void add(IMAGE_SOURCE.CAMERA)}
          />
          <Button
            label={t('chooseFromLibrary')}
            icon="images-outline"
            variant="secondary"
            onPress={() => void add(IMAGE_SOURCE.LIBRARY)}
          />
        </YStack>
      </BottomSheet>
    </YStack>
  );
}
