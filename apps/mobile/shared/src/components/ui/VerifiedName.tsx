import { Text, XStack } from 'tamagui';
import { colors, fontSize, fontWeight } from '@/theme/tokens';
import { VerifiedMark } from './VerifiedMark';

/**
 * TÊN + CON DẤU — nửa còn lại của định dạng nhận diện chuẩn của XePrime.
 *
 * Nửa kia là `Avatar` (`verifiedLabel` cho vòng gold + con dấu đè ảnh). Đủ bộ, một chủ gian hàng
 * hiện ra giống hệt nhau ở mọi màn:
 *
 *   ảnh viền gold có dấu · TÊN MÀU CHỮ THƯỜNG · con dấu ngay sau tên
 *
 * Tên giữ MÀU CHỮ THƯỜNG, không tô gold: gold đã nằm ở vòng ảnh và hai con dấu, và một cái tên
 * gold trên nền sáng vừa tuột ngưỡng tương phản vừa làm khối này trông như quảng cáo. Thứ đã xác
 * thực là CON NGƯỜI/GIAN HÀNG, không phải cái tên.
 *
 * Là component chứ không phải một đoạn JSX chép năm lần: định dạng này sống ở thẻ xe, trang chi
 * tiết xe, đầu trang gian hàng, đầu trang hồ sơ và thẻ người dùng trong menu. Năm bản sao là năm
 * cơ hội để một chỗ quên mất con dấu, hoặc để `flexShrink` rơi mất và tên dài đẩy dấu ra khỏi màn.
 */
export function VerifiedName({
  name,
  verifiedLabel,
  size = fontSize.bodySm,
  weight = fontWeight.semibold,
  color = colors.text,
  center = false,
  numberOfLines = 1,
  markSize,
  decorativeMark = false,
}: {
  name: string;
  /** Có nhãn = ĐÃ xác thực, vẽ con dấu. Vắng = tài khoản thường, không có dấu nào. */
  verifiedLabel?: string;
  size?: number;
  weight?: string;
  color?: string;
  center?: boolean;
  numberOfLines?: number;
  /** Mặc định nhỉnh hơn chữ một bậc; truyền tay khi hàng quá hẹp. */
  markSize?: number;
  /** Bật khi con dấu trên ảnh ngay cạnh đã đọc lên câu ấy rồi — tránh đọc hai lần. */
  decorativeMark?: boolean;
}) {
  return (
    <XStack ai="center" jc={center ? 'center' : 'flex-start'} gap={3} maxWidth="100%">
      {/*
        `flexShrink` phải khai TƯỜNG MINH: React Native mặc định 0, không phải 1 như CSS — thiếu
        nó thì tên dài giữ nguyên bề rộng tự nhiên và đẩy con dấu tràn khỏi thẻ.

        Dấu nằm NGOÀI phần tử cắt chữ, nên tên bị "…" thì dấu vẫn còn nguyên.
      */}
      <Text
        flexShrink={1}
        col={color}
        fos={size}
        fow={weight}
        ta={center ? 'center' : 'left'}
        numberOfLines={numberOfLines}
      >
        {name}
      </Text>
      {verifiedLabel ? (
        <VerifiedMark
          label={verifiedLabel}
          size={markSize ?? Math.max(14, Math.round(size * 1.15))}
          decorative={decorativeMark}
        />
      ) : null}
    </XStack>
  );
}
