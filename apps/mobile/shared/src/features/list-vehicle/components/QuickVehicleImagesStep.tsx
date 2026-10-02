import { useWatch, type Control } from 'react-hook-form';
import { Text, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { VEHICLE_PUBLIC_MIN_IMAGES } from '@xeprime/types';
import { BlockTitle } from '@/components/ui/BlockTitle';
import { Callout } from '@/components/ui/Callout';
import { Card } from '@/components/ui/Card';
import { ProgressBar } from '@/components/ui/ProgressBar';
import type { UploadMeta, UploadPresign } from '@/api/uploads/api';
import { TypedMediaFields } from '@/features/vehicles/components/TypedMediaFields';
import { colors, fontSize, space } from '@/theme/tokens';
import type { QuickVehicleValues } from '../quick-schema';

/** Bốn góc chụp gợi ý — cùng danh sách và cùng thứ tự với web. */
const ANGLES = ['front', 'rear', 'side', 'interior'] as const;

/**
 * Bước HÌNH ẢNH của wizard đăng xe nhanh — bản native của `QuickVehicleImagesStep`.
 *
 * Ảnh gán theo GÓC CHỤP qua `TypedMediaFields` (ảnh đại diện + `media[{url,type}]`), cùng bảng
 * ảnh với wizard nâng cao — đúng như web.
 *
 * Bộ đếm là thứ quan trọng nhất của màn này: xe muốn LÊN CHỢ phải đủ `VEHICLE_PUBLIC_MIN_IMAGES`
 * ảnh, và người dùng phải biết còn thiếu mấy tấm TRƯỚC khi bấm gửi duyệt — chứ không phải đọc
 * một lỗi từ server sau đó. Đếm theo `Set` vì ảnh đại diện cũng tính, và nó có thể trùng một tấm
 * đã nằm trong thư viện.
 *
 * Thiếu ảnh CHẶN lưu (30/09/2026, như web): xe tạo qua wizard phải đủ điều kiện lên chợ.
 */
export function QuickVehicleImagesStep({
  control,
  presign,
}: {
  control: Control<QuickVehicleValues>;
  /**
   * Lấy chữ ký tải ảnh. Wizard truyền vào thay vì màn này tự gọi `uploadsApi.vehicleImage`:
   * người CHƯA có gian hàng phải mở gian hàng ngay trước tấm ảnh đầu tiên (endpoint presign là
   * tenant-scoped, không có tenant thì 403), và quyết định đó thuộc về wizard, không thuộc về
   * một bước hình ảnh.
   */
  presign: (meta: UploadMeta) => Promise<UploadPresign>;
}) {
  const t = useTranslations('ListYourVehicle.images');

  const mainImageUrl = useWatch({ control, name: 'mainImageUrl' });
  const images = useWatch({ control, name: 'images' }) ?? [];
  const media = useWatch({ control, name: 'media' }) ?? [];
  const vehicleType = useWatch({ control, name: 'vehicleType' });

  // Đếm trên tập URL đã khử trùng (đại diện ∪ thư viện ∪ media) — đúng cách backend đếm.
  const total = new Set([
    ...(mainImageUrl ? [mainImageUrl] : []),
    ...images,
    ...media.map((item) => item.url),
  ]).size;
  const missing = Math.max(0, VEHICLE_PUBLIC_MIN_IMAGES - total);

  return (
    <YStack gap={space.md}>
      <Card>
        <YStack gap={space.md}>
          <BlockTitle>{t('title')}</BlockTitle>
          <Text col={colors.textMuted} fos={fontSize.bodySm}>
            {t('intro')}
          </Text>

          <TypedMediaFields control={control} vehicleType={vehicleType} presign={presign} mainImageRequired />

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
