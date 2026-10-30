import { BrandLogo } from '@/components/brand/BrandLogo';
import { XStack, YStack } from 'tamagui';
import { HeaderActions } from './HeaderActions';
import { useColors } from '@/theme/ThemeProvider';
import { space } from '@/theme/tokens';
import { HEADER_RULE, HEADER_RULE_OPACITY } from './AppHeader';

/** Logo thanh gốc của app, lớn hơn logo header màn con (`AppHeader` dùng 24). */
const BRAND_LOGO = 30;

export function AppTopBar() {
  const colors = useColors();
  return (
    /*
      Cùng vạch gold đóng đáy như `AppHeader`: thanh gốc của tab và thanh của màn con là CÙNG một
      lớp điều hướng, nên chúng phải kết thúc bằng cùng một nét. Thiếu nó ở đây thì ranh giới
      trên/dưới xuất hiện rồi biến mất mỗi lần người dùng đi vào một màn con và quay ra.
    */
    <YStack bg={colors.background}>
      <XStack
        ai="center"
        jc="space-between"
        gap={space.sm}
        px={space.md}
        py={space.sm}
        bg={colors.background}
      >
        {/*
         * Chỉ mỗi lockup: nó đã có sẵn chữ "xe prime" trong artwork. Bản trước ghép biểu tượng
         * với hai `Text` tô màu tay — nay đặt cạnh lockup sẽ thành tên thương hiệu in hai lần.
         */}
        <BrandLogo height={BRAND_LOGO} />

        <HeaderActions />
      </XStack>
      <YStack h={HEADER_RULE} opacity={HEADER_RULE_OPACITY} bg={colors.primary} />
    </YStack>
  );
}
