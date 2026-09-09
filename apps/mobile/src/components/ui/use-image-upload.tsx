import { useState, type ReactNode } from 'react';
import { Text, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import type { UploadMeta, UploadPresign } from '@/api/vehicles/api';
import { BottomSheet } from './BottomSheet';
import { Button } from './Button';
import { useAppToast } from '@/components/feedback/use-app-toast';
import { useErrorMessage } from '@/i18n/use-error-message';
import { useImageErrorMessage } from '@/lib/image-permission-message';
import { IMAGE_SOURCE, pickImages, uploadImageToR2, type ImageSource } from '@/lib/r2-image-upload';
import { colors, fieldFontSize, space } from '@/theme/tokens';

interface Options {
  /** Tiêu đề tấm chọn nguồn — nhãn của chính ô ảnh. */
  title: string;
  /**
   * Gợi ý kích thước, hiện NGAY TRONG tấm chọn.
   *
   * Đúng lúc người dùng sắp mở thư viện là lúc duy nhất "1600×600px" còn hành động được; một
   * dòng chú thích nằm dưới khung ảnh thì đọc sau khi đã chọn xong, tức đọc để tiếc.
   */
  hint?: string;
  presign: (meta: UploadMeta) => Promise<UploadPresign>;
  /** Còn nhận thêm được mấy tấm — 1 cho ô ảnh đơn, `max - đã có` cho thư viện. */
  remaining?: number;
  onUploaded: (urls: readonly string[]) => void;
  /**
   * Bỏ tấm ảnh đang có. Truyền vào thì tấm chọn mọc thêm một mục "Xoá ảnh".
   *
   * Ở TRONG tấm chọn chứ không phải một nút thùng rác đè lên ảnh: khung ảnh của hồ sơ gian hàng
   * là ảnh bìa tràn viền và logo tròn 72dp, chỗ mà một nút phá huỷ nằm sẵn trên mặt là thứ ngón
   * tay chạm nhầm khi chỉ định cuộn trang.
   */
  onRemove?: () => void;
}

export interface ImageUpload {
  /** Đang chọn hoặc đang tải lên — nơi gọi khoá vùng chạm và đổi biểu tượng theo cờ này. */
  busy: boolean;
  open: () => void;
  /** Tấm chọn nguồn. Nơi gọi PHẢI render, nếu không `open()` mở ra một tấm không tồn tại. */
  sheet: ReactNode;
}

/**
 * Chọn/chụp ảnh rồi tải thẳng lên R2 — phần LOGIC của mọi ô ảnh trong app.
 *
 * Tách khỏi `ImageUploadField` khi hồ sơ gian hàng cần đúng chuỗi thao tác này dưới một hình hài
 * khác hẳn (ảnh bìa tràn viền + logo tròn đè lên nó). Chép lại `pickImages → uploadImageToR2 →
 * toast lỗi` là chép luôn cả bẫy `Content-Length` của presign và câu lỗi riêng cho trường hợp
 * người dùng từ chối quyền máy ảnh.
 *
 * Ảnh tải lên NGAY khi chọn, không đợi bấm Lưu: url mới là thứ đi vào payload, và một form giữ
 * file nhị phân trong bộ nhớ tới lúc submit là ngần ấy lần có thể mất trắng khi app bị hệ điều
 * hành thu hồi.
 */
export function useImageUpload({
  title,
  hint,
  presign,
  remaining = 1,
  onUploaded,
  onRemove,
}: Options): ImageUpload {
  const t = useTranslations('Common.image');
  const toast = useAppToast();
  /* Thiếu quyền máy ảnh/thư viện có câu riêng — xem `useImageErrorMessage`. */
  const errorMessage = useImageErrorMessage(useErrorMessage());

  const [choosing, setChoosing] = useState(false);
  const [busy, setBusy] = useState(false);

  async function add(source: ImageSource) {
    setChoosing(false);
    setBusy(true);
    try {
      const picked = await pickImages(source, remaining);
      if (picked.length === 0) return;

      /*
       * MỖI tấm thành công báo ngay, KHÔNG đợi cả lô xong: `onUploaded` nhận toàn bộ phần đã
       * thành công CỘNG DỒN của chính lượt chọn này (không phải chỉ tấm vừa xong), nên nơi gọi
       * (vốn ghép `[...urls, ...uploaded]` từ state chụp lúc render) luôn tính lại đúng, dù gọi
       * nhiều lần trong cùng một `add()`. Trước đây gom hết vào một mảng rồi gọi MỘT LẦN sau
       * vòng lặp — tấm thứ 7/10 lỗi thì 6 tấm đã tải lên R2 (và đã tốn tiền lưu trữ) bị vứt bỏ
       * hoàn toàn, người dùng phải chọn lại từ đầu.
       */
      const uploaded: string[] = [];
      const failures: unknown[] = [];
      for (const image of picked) {
        try {
          uploaded.push(await uploadImageToR2(image, presign));
          onUploaded([...uploaded]);
        } catch (error) {
          failures.push(error);
        }
      }

      if (failures.length > 0) toast.showError(errorMessage(failures[0]));
    } catch (error) {
      toast.showError(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  return {
    busy,
    open: () => setChoosing(true),
    sheet: (
      <BottomSheet open={choosing} onClose={() => setChoosing(false)} title={title}>
        <YStack gap={space.sm}>
          {hint ? (
            <Text col={colors.textMuted} fos={fieldFontSize.message}>
              {hint}
            </Text>
          ) : null}
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
          {onRemove ? (
            <Button
              label={t('removeImage')}
              icon="trash-outline"
              variant="danger"
              onPress={() => {
                setChoosing(false);
                onRemove();
              }}
            />
          ) : null}
        </YStack>
      </BottomSheet>
    ),
  };
}
