import { Image } from 'expo-image';
import { StyleSheet } from 'react-native';
import { Text, YStack } from 'tamagui';
import { colors, fontWeight, radius } from '@/theme/tokens';
import { VerifiedMark } from './VerifiedMark';

interface AvatarProps {
  name: string;
  url?: string | null;
  size?: number;
  /**
   * Vòng nhấn thương hiệu quanh ảnh — dành cho GIAN HÀNG đã xác minh (ADR 0028).
   *
   * Là một vòng RỜI có khe trắng chứ không phải viền dán sát: nền avatar vốn đã là gold đặc, nên
   * một viền gold sát mép sẽ tan vào chính nó và không nói được gì. Prop `size` vẫn là cỡ của ẢNH —
   * vòng cộng thêm ra ngoài, nên bật/tắt nó không làm ảnh to nhỏ theo.
   */
  ring?: boolean;
  /**
   * Nghĩa của dấu xác thực — có nhãn là VẼ con dấu đè góc dưới-phải, và bật luôn vòng nhấn.
   *
   * Nhận NHÃN chứ không phải một cờ `boolean`: con dấu là nơi duy nhất nói "đã xác thực" trên một
   * khối chỉ có ảnh và tên, nên nó phải đọc lên được. Một `verified` kiểu boolean sẽ đẻ ra ba nơi
   * gọi quên mất phần chữ.
   *
   * `ring` một mình (không nhãn) dành cho chỗ con dấu đã nằm SẴN cạnh tên — thẻ xe — để không có
   * hai con dấu trong cùng một hàng.
   */
  verifiedLabel?: string;
}

/**
 * Ảnh đại diện, lùi về chữ cái đầu khi chưa có ảnh — không bao giờ để một ô tròn trống.
 *
 * Nền dùng màu thương hiệu ĐẬM chứ không phải bản nhạt: ô nhạt nằm trên thẻ trắng gần như tàng
 * hình, chữ cái bên trong đọc như một vết bẩn hơn là một avatar.
 */
const styles = StyleSheet.create({
  image: { width: '100%', height: '100%' },
});

/** Vòng nhấn: 2dp viền + 2dp khe — đủ thấy ở cỡ thẻ mà không biến avatar thành một cái huy hiệu. */
const RING_WIDTH = 2;
const RING_GAP = 2;

/**
 * Vòng vẽ vào BÊN TRONG `size`, không cộng ra ngoài.
 *
 * `size` là đường kính NGOÀI, luôn luôn — nên một hàng danh sách có cả gian hàng lẫn chủ xe cá
 * nhân thì mọi ảnh cùng một đường kính và cùng một trục. Cộng ra ngoài thì mỗi nơi gọi phải tự
 * trừ đi 8 để bù, và đủ ba nơi quên là ba hàng cao thấp lệch nhau trong cùng một danh sách.
 */
const INNER_INSET = (RING_WIDTH + RING_GAP) * 2;

/**
 * Con dấu bằng ~1/3 đường kính ảnh, sàn 14dp.
 *
 * Tỉ lệ chứ không phải một hằng: cùng một component đang đeo dấu cho ảnh 34dp trong menu và ảnh
 * 88dp ở đầu trang hồ sơ. Một cỡ cố định thì hoặc mất hút ở chỗ này, hoặc che mất mặt người ở chỗ
 * kia. Sàn 14dp vì dưới ngưỡng đó các răng cưa của con dấu nát thành một chấm tròn.
 */
const MARK_MIN = 14;
const markSizeFor = (size: number) => Math.max(MARK_MIN, Math.round(size * 0.32));

/**
 * Con dấu nằm VẮT NGANG mép ảnh: tâm dấu rơi đúng lên đường tròn, nửa trong nửa ngoài.
 *
 * Phải tính bằng hình học chứ không đặt `bottom: 0; right: 0` — đó là góc của HÌNH VUÔNG bao
 * ngoài, mà ảnh thì tròn, nên ở góc ấy đường tròn đã cong vào trong `r(1 − cos45°) ≈ 0.146·d`.
 * Dấu đặt ở góc vuông trông như đang lơ lửng ngoài ảnh, và chỉ một phần nhỏ của nó chồng lên.
 *
 * Điểm 45° trên đường tròn cách mép phải (và mép dưới) của hình vuông đúng `0.1464·size`. Đặt
 * TÂM dấu vào đó ⇒ lệch `0.1464·size − mark/2` tính từ mép, số âm thì phần thừa tràn ra ngoài.
 */
const EDGE_45 = (1 - Math.SQRT1_2) / 2;
const markOffsetFor = (size: number) => EDGE_45 * size - markSizeFor(size) / 2;

export function Avatar({ name, url, size = 40, ring = false, verifiedLabel }: AvatarProps) {
  const initial = name.trim().charAt(0).toLocaleUpperCase();

  const hasRing = ring || verifiedLabel != null;
  const inner = hasRing ? size - INNER_INSET : size;

  const circle = (
    <YStack
      w={inner}
      h={inner}
      br={radius.pill}
      bg={colors.primary}
      ai="center"
      jc="center"
      ov="hidden"
    >
      {url ? (
        <Image source={{ uri: url }} style={styles.image} contentFit="cover" cachePolicy="memory-disk" />
      ) : (
        <Text col={colors.onPrimary} fos={inner / 2.5} fow={fontWeight.bold}>
          {initial || '?'}
        </Text>
      )}
    </YStack>
  );

  if (!hasRing) return circle;

  const ringed = (
    <YStack
      w={size}
      h={size}
      br={radius.pill}
      bw={RING_WIDTH}
      bc={colors.primary}
      bg={colors.surface}
      ai="center"
      jc="center"
    >
      {circle}
    </YStack>
  );

  if (!verifiedLabel) return ringed;

  return (
    <YStack>
      {ringed}
      {/*
        Đĩa trắng sau con dấu KHÔNG phải trang trí: dấu đè lên mép ảnh, và một ảnh đại diện tối
        màu sẽ nuốt mất phần răng cưa gold của nó.
      */}
      <YStack
        pos="absolute"
        bottom={markOffsetFor(size)}
        right={markOffsetFor(size)}
        br={radius.pill}
        bg={colors.surface}
        p={1}
        ai="center"
        jc="center"
      >
        <VerifiedMark label={verifiedLabel} size={markSizeFor(size)} />
      </YStack>
    </YStack>
  );
}
