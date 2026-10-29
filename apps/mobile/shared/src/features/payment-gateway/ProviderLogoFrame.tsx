import { Image } from 'react-native';
import { XStack } from 'tamagui';
import { useColors } from '@/theme/ThemeProvider';
import { radius, space } from '@/theme/tokens';
import type { ProviderLogo } from './provider-logos';

/** Chiều cao khung logo — chung mọi ví để các thẻ cao bằng nhau. */
const LOGO_FRAME_HEIGHT = 40;
/** Đệm quanh logo NGANG (VNPAY) trong khung viền; logo vuông thì tự lấp đầy khung. */
const LOGO_PADDING = space.sm;
/** Logo của ví vượt hạn mức nhạt đi — vẫn nhận ra ví, nhưng đọc ngay là "không dùng được lúc này". */
const DIMMED_OPACITY = 0.5;

/** Logo gần vuông (MoMo ≈ 1 : 1) là một ô biểu tượng, không phải một chữ ký ngang. */
function isSquareLogo(logo: ProviderLogo) {
  return logo.width / logo.height < 1.5;
}

/**
 * Khung ÔM theo tỉ lệ logo: vuông thì khung vuông cạnh `LOGO_FRAME_HEIGHT`, ngang thì rộng theo tỉ
 * lệ cộng đệm hai bên — không còn khoảng trắng thừa quanh logo vuông.
 */
function frameSize(logo: ProviderLogo) {
  if (isSquareLogo(logo)) return { w: LOGO_FRAME_HEIGHT, h: LOGO_FRAME_HEIGHT };
  const inner = LOGO_FRAME_HEIGHT - LOGO_PADDING * 2;
  return { w: (inner * logo.width) / logo.height + LOGO_PADDING * 2, h: LOGO_FRAME_HEIGHT };
}

function imageStyle(logo: ProviderLogo) {
  // Giữ tỉ lệ gốc — kéo méo logo là vi phạm hướng dẫn thương hiệu.
  if (isSquareLogo(logo)) return { width: LOGO_FRAME_HEIGHT, height: LOGO_FRAME_HEIGHT };
  const height = LOGO_FRAME_HEIGHT - LOGO_PADDING * 2;
  return { width: (height * logo.width) / logo.height, height };
}

/**
 * Logo chính thức của một ví trong khung viền cố định chiều cao — MỘT bản cho cả hàng chọn ví lẫn
 * thẻ trạng thái lượt cổng, để hai nơi đọc ra là cùng một ví.
 */
export function ProviderLogoFrame({
  logo,
  dimmed = false,
}: {
  logo: ProviderLogo;
  dimmed?: boolean;
}) {
  const colors = useColors();
  return (
    <XStack
      {...frameSize(logo)}
      ai="center"
      jc="center"
      br={radius.sm}
      bw={1}
      bc={colors.borderSubtle}
      bg={colors.surface}
      ov="hidden"
      opacity={dimmed ? DIMMED_OPACITY : 1}
    >
      <Image
        source={logo.source}
        style={imageStyle(logo)}
        resizeMode="contain"
        accessible={false}
      />
    </XStack>
  );
}
