import { useWatch, type Control } from 'react-hook-form';
import { Text, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { VEHICLE_PUBLIC_MIN_IMAGES } from '@xeprime/types';
import { BlockTitle } from '@/components/ui/BlockTitle';
import { Callout } from '@/components/ui/Callout';
import { Card } from '@/components/ui/Card';
import { ImageUploadField } from '@/components/ui/ImageUploadField';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { uploadsApi } from '@/api/uploads/api';
import { colors, fontSize, space } from '@/theme/tokens';
import type { QuickVehicleValues } from '../quick-schema';

/** Bốn góc chụp gợi ý — cùng danh sách và cùng thứ tự với web. */
const ANGLES = ['front', 'rear', 'side', 'interior'] as const;

/**
 * Bước HÌNH ẢNH của wizard đăng xe nhanh — bản native của `QuickVehicleImagesStep`.
 *
 * Bộ đếm là thứ quan trọng nhất của màn này: xe muốn LÊN CHỢ phải đủ `VEHICLE_PUBLIC_MIN_IMAGES`
 * ảnh, và người dùng phải biết còn thiếu mấy tấm TRƯỚC khi bấm gửi duyệt — chứ không phải đọc
 * một lỗi từ server sau đó. Đếm theo `Set` vì ảnh đại diện cũng tính, và nó có thể trùng một tấm
 * đã nằm trong thư viện.
 *
 * Thiếu ảnh KHÔNG chặn lưu: xe vẫn lưu nháp được, chỉ là chưa gửi duyệt được.
 */
export function QuickVehicleImagesStep({ control }: { control: Control<QuickVehicleValues> }) {
  const t = useTranslations('ListYourVehicle.images');
  const tForm = useTranslations('Vehicles.form.media');

  const mainImageUrl = useWatch({ control, name: 'mainImageUrl' });
  const images = useWatch({ control, name: 'images' });

  const total = new Set([...(mainImageUrl ? [mainImageUrl] : []), ...(images ?? [])]).size;
  const missing = Math.max(0, VEHICLE_PUBLIC_MIN_IMAGES - total);

  return (
    <YStack gap={space.md}>
      <Card>
        <YStack gap={space.md}>
          <BlockTitle>{t('title')}</BlockTitle>
          <Text col={colors.textMuted} fos={fontSize.bodySm}>
            {t('intro')}
          </Text>

          <ImageUploadField
            control={control}
            name="mainImageUrl"
            label={tForm('mainImage')}
            emptyLabel={tForm('addMainImage')}
            hint={t('mainImageHelp')}
            presign={uploadsApi.vehicleImage}
          />
          <ImageUploadField
            control={control}
            name="images"
            label={tForm('gallery')}
            presign={uploadsApi.vehicleImage}
            multiple
          />

          {/*
            Thanh tiến độ ĐI KÈM con số, đúng `<Progress>` của web: "2/4" là một phép tính, còn
            một vạch đầy hai phần là thứ đọc được bằng một cái liếc.
          */}
          <ProgressBar
            percent={(total / VEHICLE_PUBLIC_MIN_IMAGES) * 100}
            tone={missing > 0 ? 'active' : 'success'}
            size="sm"
            label={t('counter', { count: total, min: VEHICLE_PUBLIC_MIN_IMAGES })}
          />

          {missing > 0 ? (
            <Callout tone="info">{t('missing', { count: missing })}</Callout>
          ) : (
            <Callout tone="success">{t('enough')}</Callout>
          )}
        </YStack>
      </Card>

      <Card tone="muted" lift="flat">
        <YStack gap={space.xs}>
          <Text col={colors.text} fos={fontSize.bodySm}>
            {t('anglesTitle')}
          </Text>
          {ANGLES.map((angle) => (
            <Text key={angle} col={colors.textMuted} fos={fontSize.label}>
              · {t(`angles.${angle}` as never)}
            </Text>
          ))}
        </YStack>
      </Card>
    </YStack>
  );
}
