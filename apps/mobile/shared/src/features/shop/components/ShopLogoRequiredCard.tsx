import { useState } from 'react';
import { Text, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { Button } from '@/components/ui/Button';
import { Callout } from '@/components/ui/Callout';
import { Card } from '@/components/ui/Card';
import { useErrorMessage } from '@/i18n/use-error-message';
import { uploadImageToR2, type PickedImage } from '@/lib/r2-image-upload';
import { useColors } from '@/theme/ThemeProvider';
import { fontSize, fontWeight, space } from '@/theme/tokens';
import { uploadsApi } from '../api';
import { useUpdateShopProfile } from '../hooks/use-shop';
import { ShopLogoPicker } from './ShopLogoPicker';

/**
 * Thẻ "Thêm logo gian hàng" của màn chờ kích hoạt (ADR 0103 điều 2) - bản native của web
 * `ShopLogoRequiredStep`. Lưới an toàn cho gian hàng tuyến gói chưa có logo: đăng ký bằng bản app cũ,
 * đăng ký trước ADR 0103, hay tải logo hỏng rồi rời màn.
 *
 * Câu chữ TRUNG TÍNH (`appBody`/`appSave`) - app Partner không nhắc gói. Lưu xong thì cache
 * `shop.current` có logo ⇒ màn tự bỏ thẻ này, không có nút "tiếp tục" tự khai.
 */
export function ShopLogoRequiredCard() {
  const colors = useColors();
  const t = useTranslations('ShopOnboarding.logoStep');
  const errorMessage = useErrorMessage();
  const update = useUpdateShopProfile();
  const [logo, setLogo] = useState<PickedImage | null>(null);
  const [missing, setMissing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    if (saving) return;
    if (!logo) {
      setMissing(true);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const logoUrl = await uploadImageToR2(logo, uploadsApi.shopMedia);
      await update.mutateAsync({ logoUrl });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <YStack gap={space.md}>
        <YStack gap={space.xs}>
          <Text col={colors.text} fos={fontSize.bodyLg} fow={fontWeight.semibold}>
            {t('title')}
          </Text>
          <Text col={colors.textMuted} fos={fontSize.bodySm}>
            {t('appBody')}
          </Text>
        </YStack>
        {error ? <Callout tone="danger">{error}</Callout> : null}
        <ShopLogoPicker
          value={logo}
          onChange={(next) => {
            setLogo(next);
            if (next) setMissing(false);
          }}
          error={missing && !logo ? t('required') : null}
          disabled={saving}
        />
        <Button
          label={t('appSave')}
          icon="checkmark-outline"
          loading={saving}
          onPress={() => void save()}
        />
      </YStack>
    </Card>
  );
}
