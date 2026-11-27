import { useState } from 'react';
import { Image } from 'react-native';
import { Text, YStack } from 'tamagui';
import { bankInitials, bankLogoUrl } from '@xeprime/domain';
import { useColors } from '@/theme/ThemeProvider';
import { fontSize, fontWeight } from '@/theme/tokens';

/**
 * Logo ngân hàng theo MÃ VietQR — bản native của `BankLogo` trên web. Mã lạ hoặc ảnh hỏng ⇒ lùi
 * về chữ viết tắt (`bankInitials`), không bao giờ là một ô ảnh vỡ. Trang trí thuần: tên ngân
 * hàng luôn đứng cạnh bằng chữ.
 */
export function BankLogo({
  code,
  size,
  radius,
  fit = 'zoom',
  width,
  plain = false,
}: {
  code: string;
  size: number;
  /** Bề ngang riêng (ô chữ nhật cho logo ngang) - mặc định bằng `size`. */
  width?: number;
  /** Không viền, không nền - logo đứng trơn trên thẻ (kiểu thẻ tài khoản của app ngân hàng). */
  plain?: boolean;
  radius: number;
  /**
   * `zoom` (mặc định) phóng 1,3 để logo vuông lấp ô nhỏ; `contain` hiện TRỌN logo, chừa lề -
   * dùng cho ô lớn, nơi logo ngang (Techcombank…) bị `zoom` cắt mép.
   */
  fit?: 'zoom' | 'contain';
}) {
  const colors = useColors();
  const [failed, setFailed] = useState(false);
  const url = bankLogoUrl(code);

  return (
    <YStack
      w={width ?? size}
      h={size}
      br={radius}
      bw={plain ? 0 : 1}
      bc={colors.borderSubtle}
      bg={plain ? 'transparent' : colors.surface}
      ai={plain ? 'flex-start' : 'center'}
      jc="center"
      overflow="hidden"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {url && !failed ? (
        <Image
          source={{ uri: url }}
          style={
            fit === 'contain'
              ? plain
                ? { width: width ?? size, height: size }
                : { width: (width ?? size) * 0.9, height: size * 0.9 }
              : { width: size, height: size, transform: [{ scale: 1.3 }] }
          }
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
