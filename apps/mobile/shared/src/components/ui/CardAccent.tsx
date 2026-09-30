import { YStack } from 'tamagui';
import type { StatusColor } from '@xeprime/types';
import { statusTone } from './StatusBadge';

/**
 * Bề rộng vạch. Đủ thấy khi lướt, không đủ để thành một khối màu.
 *
 * 4pt là mức mà mắt bắt được cụm đỏ/cam trong một danh sách đang cuộn, còn 6–8pt thì vạch bắt
 * đầu đọc ra như một cột của thẻ và tranh chỗ với chính viên nhãn nó đang tóm tắt.
 */
const ACCENT_WIDTH = 4;

/**
 * Vạch màu ở mép trái thẻ, ăn theo trạng thái — bản native của `border-inline-start` mà thẻ
 * mobile bên web dùng cho dòng quá hạn.
 *
 * Nó tô cho MỌI trạng thái chứ không riêng trạng thái xấu: một mép màu liền mạch cho phép lướt
 * tìm cụm cần chú ý mà không phải đọc từng viên nhãn. Viên nhãn vẫn còn nguyên — vạch là lối vào
 * nhanh, KHÔNG phải thứ thay chữ, vì màu một mình thì trình đọc màn hình không đọc được và người
 * mù màu không phân biệt được.
 *
 * Không có chiều cao riêng: đặt làm con TRỰC TIẾP của một `<XStack>` thì nó tự cao bằng hàng
 * (`alignItems` mặc định của React Native là `stretch`). Cho nó `height` là cách vạch ngắn hơn
 * thẻ đúng bằng phần đệm dưới.
 */
export function CardAccent({ color }: { color: StatusColor }) {
  return <YStack w={ACCENT_WIDTH} bg={statusTone(color).fg} />;
}
