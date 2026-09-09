import type { ReactNode } from 'react';
import { Fragment } from 'react';
import { Text, XStack, YStack } from 'tamagui';
import { colors, fontSize, fontWeight, space } from '@/theme/tokens';

export interface FactItem {
  /** Khoá React — dùng luôn khoá message của nhãn, đừng lấy chỉ số mảng. */
  readonly key: string;
  readonly label: string;
  readonly value?: string;
  /**
   * Màu CHỮ SỐ — chỉ đặt khi con số đang cần chú ý (lỗ, quá hạn). Tô cả hàng thì không ô nào nổi
   * lên nữa và màu hết còn nghĩa "để ý cái này".
   */
  readonly tone?: string;
  /** Thay con số bằng một phần tử — viên nhãn "Thiếu KM", hay một khung chờ. */
  readonly node?: ReactNode;
}

/**
 * Số ô mỗi hàng. HAI, không phải ba.
 *
 * Ba ô trên một thẻ rộng 358pt cho mỗi ô chưa tới 100pt, mà nhãn tiếng Việt ở đây dài hơn thế:
 * "Số KM hiện tại", "Đang chạy / Xong", "Mốc tiếp theo". Kết quả là nhãn bị cắt bằng "…" và con
 * số phải co lại mới vừa — cả hàng đọc ra như vỡ. Hai ô cho mỗi ô ~155pt: nhãn nằm trọn, số giữ
 * nguyên cỡ, và hàng thứ hai chỉ tốn thêm ~34pt.
 */
const COLUMNS = 2;

/**
 * Dải chỉ số GỌN trong một thẻ danh sách: giá trị đứng trước, nhãn xuống dưới, các ô chia đều bề
 * ngang và ngăn nhau bằng kẻ dọc mảnh.
 *
 * Khác `<StatGrid>` ở CHỖ DÙNG, không phải ở hình: `StatGrid` là bảng chỉ số của một MÀN (số cỡ
 * `h4`, đệm 16, huy hiệu tròn, kẻ chia thành ô) — đặt nó vào một thẻ danh sách thì mỗi thẻ cao
 * thêm gần trăm điểm và bảng số giành mất vai chính của chính bản ghi. Dải này giữ đúng nhịp chữ
 * của thẻ.
 *
 * Con số ở bậc `body` + `bold`, đậm hơn hẳn nhãn: đây là phần trả lời "bản ghi này đang ra sao",
 * và ở bậc nhỏ hơn thì cả cụm đọc thành một dòng chú thích chân thẻ mà mắt lướt thẳng qua.
 *
 * Hàng cuối thiếu ô thì ô còn lại chiếm trọn bề ngang. Đó là hành vi ĐÚNG: chèn một ô rỗng cho
 * đủ lưới là vẽ ra một cột trống mà người đọc sẽ đi tìm nội dung của nó.
 */
export function FactRow({ items }: { items: readonly FactItem[] }) {
  if (items.length === 0) return null;

  const rows: FactItem[][] = [];
  for (let index = 0; index < items.length; index += COLUMNS) {
    rows.push(items.slice(index, index + COLUMNS));
  }

  return (
    <YStack gap={space.sm}>
      {rows.map((row) => (
        <XStack key={row.map((item) => item.key).join('-')} ai="flex-start">
          {row.map((item, index) => (
            <Fragment key={item.key}>
              {index > 0 ? <Rule /> : null}
              <Cell item={item} />
            </Fragment>
          ))}
        </XStack>
      ))}
    </YStack>
  );
}

function Cell({ item }: { item: FactItem }) {
  return (
    <YStack f={1} minWidth={0} gap={2}>
      {item.node ?? (
        <Text
          col={item.tone ?? colors.text}
          fos={fontSize.body}
          fow={fontWeight.bold}
          numberOfLines={1}
        >
          {item.value}
        </Text>
      )}
      <Text col={colors.textMuted} fos={fontSize.label} numberOfLines={1}>
        {item.label}
      </Text>
    </YStack>
  );
}

/** Kẻ dọc giữa hai ô — `alignSelf: stretch` để nó cao bằng hàng, không bằng nội dung ô nào. */
function Rule() {
  return <YStack w={1} bg={colors.borderSubtle} alignSelf="stretch" mx={space.sm} />;
}
