import { Image } from 'react-native';
import { Text, YStack } from 'tamagui';
import { colors, fontWeight, radius } from '@/theme/tokens';

interface AvatarProps {
  name: string;
  url?: string | null;
  size?: number;
}

/**
 * Ảnh đại diện, lùi về chữ cái đầu khi chưa có ảnh — không bao giờ để một ô tròn trống.
 *
 * Nền dùng màu thương hiệu ĐẬM chứ không phải bản nhạt: ô nhạt nằm trên thẻ trắng gần như tàng
 * hình, chữ cái bên trong đọc như một vết bẩn hơn là một avatar.
 */
export function Avatar({ name, url, size = 40 }: AvatarProps) {
  const initial = name.trim().charAt(0).toLocaleUpperCase();

  return (
    <YStack
      w={size}
      h={size}
      br={radius.pill}
      bg={colors.primary}
      ai="center"
      jc="center"
      ov="hidden"
    >
      {url ? (
        <Image source={{ uri: url }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
      ) : (
        <Text col={colors.onPrimary} fos={size / 2.5} fow={fontWeight.bold}>
          {initial || '?'}
        </Text>
      )}
    </YStack>
  );
}
