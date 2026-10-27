import { useState } from 'react';
import { Image } from 'react-native';
import { Text, YStack } from 'tamagui';
import { bankInitials, bankLogoUrl } from '@xeprime/domain';
import { colors, fontSize, fontWeight } from '@/theme/tokens';

/**
 * Logo ngân hàng theo MÃ VietQR — bản native của `BankLogo` trên web. Mã lạ hoặc ảnh hỏng ⇒ lùi
 * về chữ viết tắt (`bankInitials`), không bao giờ là một ô ảnh vỡ. Trang trí thuần: tên ngân
 * hàng luôn đứng cạnh bằng chữ.
 */
export function BankLogo({ code, size, radius }: { code: string; size: number; radius: number }) {
  const [failed, setFailed] = useState(false);
  const url = bankLogoUrl(code);

  return (
    <YStack
      w={size}
      h={size}
      br={radius}
      bw={1}
      bc={colors.borderSubtle}
      bg={colors.surface}
      ai="center"
      jc="center"
      overflow="hidden"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {url && !failed ? (
        <Image
          source={{ uri: url }}
          style={{ width: size, height: size, transform: [{ scale: 1.3 }] }}
          resizeMode="contain"
          onError={() => setFailed(true)}
        />
      ) : (
        <Text col={colors.text} fos={fontSize.label} fow={fontWeight.bold}>
          {bankInitials(code)}
        </Text>
      )}
    </YStack>
  );
}
