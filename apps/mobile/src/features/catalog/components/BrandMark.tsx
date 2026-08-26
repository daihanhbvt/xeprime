import { Image } from 'react-native';
import { Text, YStack } from 'tamagui';
import { vehicleBrandKey } from '@xeprime/types';
import { colors, fontSize, fontWeight, radius } from '@/theme/tokens';
import { BRAND_ART } from '../brand-art';

const SIZE = 18;

/**
 * Logo hãng xe cho chip bộ lọc — bản native của `BrandMark` bên web, cùng nét vẽ và cùng luật:
 * tra theo `vehicleBrandKey`, không có thì monogram chữ cái đầu.
 *
 * Ảnh là PNG sinh từ chính SVG của web (`scripts/sync-brand-art.mjs`) chứ không vẽ lại: web
 * vẫn là nguồn duy nhất, còn RN thì không đọc được SVG nếu không cắm `react-native-svg` —
 * native module mà Expo Go không mang.
 *
 * Hãng do shop tự nhập (ngoài danh mục) vì thế vẫn hiện tử tế thay vì một ô trống.
 */
export function BrandMark({ brand }: { brand: string }) {
  const key = vehicleBrandKey(brand);
  const art = key ? BRAND_ART[key] : undefined;

  if (art) return <Image source={art} style={{ width: SIZE, height: SIZE }} resizeMode="contain" />;

  return (
    <YStack w={SIZE} h={SIZE} br={radius.pill} bg={colors.primaryLight} ai="center" jc="center">
      <Text col={colors.primaryActive} fos={fontSize.label} fow={fontWeight.bold}>
        {brand.trim().charAt(0).toUpperCase() || '?'}
      </Text>
    </YStack>
  );
}
