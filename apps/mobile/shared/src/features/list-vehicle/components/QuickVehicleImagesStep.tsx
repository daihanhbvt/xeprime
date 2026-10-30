import { useWatch, type Control } from 'react-hook-form';
import { Text, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { missingVehicleImageTypes, requiredVehicleImageTypes } from '@xeprime/types';
import { BlockTitle } from '@/components/ui/BlockTitle';
import { Callout } from '@/components/ui/Callout';
import { Card } from '@/components/ui/Card';
import { ProgressBar } from '@/components/ui/ProgressBar';
import type { UploadMeta, UploadPresign } from '@/api/uploads/api';
import { TypedMediaFields } from '@/features/vehicles/components/TypedMediaFields';
import { useColors } from '@/theme/ThemeProvider';
import { fontSize, space } from '@/theme/tokens';
import type { QuickVehicleValues } from '../quick-schema';

/**
 * Bước HÌNH ẢNH của wizard đăng xe nhanh — bản native của `QuickVehicleImagesStep`.
 *
 * Ảnh gán theo GÓC CHỤP qua `TypedMediaFields` (`media[{url,type}]`), cùng bảng ảnh với wizard
 * nâng cao — đúng như web. Ảnh bìa không có ô riêng: nó là ảnh mặt trước, server suy ra khi lưu.
 *
 * Bộ đếm là thứ quan trọng nhất của màn này, và nó đếm GÓC chứ không đếm tấm (07/10/2026): ô tô
 * 5, xe máy 2. Một con số chung "tối thiểu 4 ảnh" vừa cho năm tấm ảnh mặt trước đi qua, vừa báo
 * thiếu với một chiếc xe máy đã có đủ hai tấm cần thiết.
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
  const colors = useColors();
  const t = useTranslations('ListYourVehicle.images');

  const media = useWatch({ control, name: 'media' }) ?? [];
  const vehicleType = useWatch({ control, name: 'vehicleType' });

  // Đếm theo GÓC đã có — đúng phép kiểm của schema và của backend.
  const required = requiredVehicleImageTypes(vehicleType).length;
  const missing = missingVehicleImageTypes(vehicleType, media).length;
  const done = required - missing;

  return (
    <YStack gap={space.md}>
      <Card>
        <YStack gap={space.md}>
          <BlockTitle>{t('title')}</BlockTitle>
          <Text col={colors.textMuted} fos={fontSize.bodySm}>
            {t('intro')}
          </Text>

          <TypedMediaFields control={control} vehicleType={vehicleType} presign={presign} />

          {/*
            Thanh tiến độ ĐI KÈM con số, đúng `<Progress>` của web: "2/4" là một phép tính, còn
            một vạch đầy hai phần là thứ đọc được bằng một cái liếc.
          */}
          <ProgressBar
            percent={required === 0 ? 100 : (done / required) * 100}
            tone={missing > 0 ? 'active' : 'success'}
            size="sm"
            label={t('counter', { count: done, min: required })}
          />

          {missing > 0 ? (
            <Callout tone="info">{t('missing', { count: missing })}</Callout>
          ) : (
            <Callout tone="success">{t('enough')}</Callout>
          )}
        </YStack>
      </Card>
    </YStack>
  );
}
