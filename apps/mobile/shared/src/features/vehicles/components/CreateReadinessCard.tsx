import { memo } from 'react';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { Ionicons } from '@/components/icons/Ionicons';
import { Card } from '@/components/ui/Card';
import { Pill } from '@/components/ui/Pill';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { useColors } from '@/theme/ThemeProvider';
import { fontSize, fontWeight, iconSize, space } from '@/theme/tokens';

/** Bốn mục "Sẵn sàng gửi duyệt" — cùng thứ tự Figma và web (`CreateVehicleAside`). */
export interface CreateReadiness {
  photos: boolean;
  info: boolean;
  pricing: boolean;
  features: boolean;
  /** Hồ sơ gian hàng đủ điều kiện đăng xe (tuyến gói - ADR 0040 điều 7); vắng = không áp. */
  shop?: boolean;
}

/**
 * Thẻ "Sẵn sàng gửi duyệt x/4" + "Lưu nháp" — bản native của cột phải wizard tạo xe web (Figma
 * `24352:79234`). Trên điện thoại nó đứng đầu mỗi bước thay vì một cột riêng. Chỉ để chủ xe thấy còn
 * thiếu gì; cổng thật vẫn là lượt lưu. "Lưu nháp" chỉ còn trong tấm xác nhận (18/11/2026).
 */
export const CreateReadinessCard = memo(function CreateReadinessCard({
  readiness,
  requiredPhotos,
}: {
  readiness: CreateReadiness;
  requiredPhotos: number;
}) {
  const colors = useColors();
  const t = useTranslations('Vehicles.form.createAside');
  const items = [
    { key: 'photos', done: readiness.photos, label: t('readyPhotos', { count: requiredPhotos }) },
    { key: 'info', done: readiness.info, label: t('readyInfo') },
    { key: 'pricing', done: readiness.pricing, label: t('readyPricing') },
    ...(readiness.shop === undefined
      ? []
      : [{ key: 'shop', done: readiness.shop, label: t('readyShop') }]),
  ];
  const done = items.filter((item) => item.done).length;
  // Tiện ích & mô tả là TUỲ CHỌN (server không đòi) - hiện kèm "Không bắt buộc", không tính vào x/N.
  const optional = { key: 'features', done: readiness.features, label: t('readyFeatures') };

  return (
    <Card>
      <YStack gap={space.sm}>
        <XStack ai="center" jc="space-between">
          <Text col={colors.text} fos={fontSize.bodyLg} fow={fontWeight.semibold}>
            {t('readyTitle')}
          </Text>
          <Text col={colors.warning} fos={fontSize.bodySm} fow={fontWeight.semibold}>
            {t('readyCount', { done, total: items.length })}
          </Text>
        </XStack>
        <ProgressBar percent={(done / items.length) * 100} label={t('readyTitle')} />
        {[...items, optional].map((item) => (
          <XStack
            key={item.key}
            ai="center"
            gap={space.sm}
            accessibilityLabel={`${item.label} ${item.done ? t('srDone') : t('srTodo')}`}
          >
            <Ionicons
              name={item.done ? 'checkmark-circle' : 'checkmark-circle-outline'}
              size={iconSize.sm}
              color={item.done ? colors.primary : colors.borderInput}
            />
            <Text col={item.done ? colors.text : colors.textMuted} fos={fontSize.bodySm} f={1}>
              {item.label}
            </Text>
            {item.key === optional.key ? <Pill label={t('optional')} tone="neutral" /> : null}
          </XStack>
        ))}
      </YStack>
    </Card>
  );
});
