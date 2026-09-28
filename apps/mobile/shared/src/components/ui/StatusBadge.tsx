import { Text, XStack } from 'tamagui';
import { STATUS_COLOR, type StatusColor } from '@xeprime/types';
import { colors, fontSize, fontWeight, radius, space } from '@/theme/tokens';
import { estimateTextWidth } from './text-fit';

/**
 * Nhãn trạng thái dùng chung — bản native của `<Tag color>` bên web.
 *
 * `STATUS_COLOR` (`@xeprime/types`) là bảng màu NGỮ NGHĨA, và file này là chỗ DUY NHẤT dịch vai
 * trò đó sang token native: mỗi màn tự chọn màu cho `active` thì "Đang thuê" xanh ở danh sách và
 * cam ở chi tiết.
 *
 * Nhãn CHỮ không sinh ở đây — nơi gọi dịch qua `useDomainLabel()` rồi truyền vào, vì mỗi miền có
 * namespace riêng (`bookingStatus`, `customerTripStage`, `handoverStatus`…).
 */
const TONE: Readonly<Record<StatusColor, { fg: string; bg: string }>> = {
  [STATUS_COLOR.NEUTRAL]: { fg: colors.textMuted, bg: colors.surfaceMuted },
  [STATUS_COLOR.INFO]: { fg: colors.info, bg: colors.infoSurface },
  [STATUS_COLOR.PROCESSING]: { fg: colors.info, bg: colors.infoSurface },
  [STATUS_COLOR.SUCCESS]: { fg: colors.success, bg: colors.successSurface },
  [STATUS_COLOR.WAITING]: { fg: colors.warning, bg: colors.warningSurface },
  [STATUS_COLOR.WARNING]: { fg: colors.warning, bg: colors.warningSurface },
  [STATUS_COLOR.DANGER]: { fg: colors.danger, bg: colors.dangerSurface },
  // Hai vai này chưa có token riêng ở native; dùng nhấn thương hiệu thay vì bịa một màu tím.
  [STATUS_COLOR.SPECIAL]: { fg: colors.primaryActive, bg: colors.primaryLight },
  [STATUS_COLOR.ACCENT]: { fg: colors.primaryActive, bg: colors.primaryLight },
};

export function statusTone(color: StatusColor): { fg: string; bg: string } {
  return TONE[color];
}

/**
 * Cỡ chữ của biến thể `xs` — bậc DƯỚI mọi bậc của thang chữ, nên không có token cho nó.
 *
 * Thang chữ Figma dừng ở 11 vì trên web nhãn trạng thái luôn nằm trong một hàng chữ bình thường.
 * Bậc này dành cho hai chỗ mà bề rộng khả dụng KHÔNG phải bề rộng thẻ:
 *
 * - Nhãn nằm ĐÈ lên ảnh — ở đó chữ 12px làm viên nhãn chiếm gần trọn ảnh, không còn nhìn ra ảnh
 *   chụp cái gì.
 * - Cột phải của một DÒNG XEM NHANH dày (dải đơn/phiếu ở Tổng quan) — viên nhãn ở đó chia chỗ với
 *   một số tiền trên cùng một cột hẹp, và ở 12px nó đọc ra to ngang dòng dữ liệu bên trái.
 *
 * Giữ ở 10 chứ không nhỏ hơn, và luôn `semibold`, để vẫn đọc được trên nền ảnh.
 */
const XS_FONT_SIZE = 10;

/**
 * Hệ số dòng của chữ trong viên — PHẢI khai tường minh.
 *
 * `fos` ở đây nhận một SỐ chứ không phải token cỡ chữ, nên Tamagui không suy ra được
 * `lineHeight` tương ứng và rơi về dòng của cỡ mặc định (24pt cho chữ 12pt). Trên Android, hộp
 * dòng cao hơn glyph nhiều như vậy đẩy chữ lệch khỏi nền viên: chữ nổi lên trên còn nền tụt
 * xuống dưới — đúng cảnh vỡ của nhãn "Thu"/"Chi" ở tấm trượt Danh mục thu/chi.
 *
 * 1.35 là bậc chật vừa đủ ôm cả dấu tiếng Việt ("Đã duyệt", "Chờ") mà không thổi viên cao lên.
 */
const LINE_HEIGHT_RATIO = 1.35;

/**
 * `sm` cho nhãn phụ nằm trong một hàng dày đặc (thẻ danh sách).
 * `xs` cho nhãn nằm ĐÈ lên ảnh, nơi bề rộng bị chặn bởi tấm ảnh — xem {@link XS_FONT_SIZE}.
 */
export type BadgeSize = 'xs' | 'sm' | 'md';

/**
 * Cỡ chữ theo biến thể — thang RIÊNG của viên nhãn, không phải thang chữ của màn hình.
 *
 * `sm` chở gần như toàn bộ nhãn trạng thái của khu quản lý (xe, bảo dưỡng, đơn thuê, khách hàng,
 * thu chi). Ở đó viên nhãn KHÔNG phải nội dung — nó là chú thích cho dòng dữ liệu ngay cạnh.
 * Chạy đúng bậc `label` (12) như web thì trên thẻ 360dp viên nhãn cao xấp xỉ chính dòng tên nó
 * đang chú thích, và một thẻ ba viên đọc ra thành ba mẩu chữ tranh nhau với dữ liệu thật.
 *
 * Bậc 11 (`fontSize.meta`) là ngoại lệ CÓ CHỦ ĐÍCH với ghi chú "không dùng cho chữ đứng một
 * mình" của token đó: chữ ở đây luôn `semibold`, luôn nằm trong một viên có NỀN và VIỀN cùng
 * màu, và luôn kề một dòng 12px làm mốc — đúng ba điều kiện giữ cho bậc này còn đọc được.
 *
 * `md` giữ bậc `label` (12) của Figma vì nó dành cho viên ĐỨNG MỘT MÌNH (hình thức nguồn xe ở
 * trang chi tiết, trạng thái phiếu cạnh số tiền) — chỗ không có dòng nào bên cạnh để đọc ghép.
 */
const FONT_SIZE: Readonly<Record<BadgeSize, number>> = {
  xs: XS_FONT_SIZE,
  sm: fontSize.meta,
  md: fontSize.label,
};

const PADDING_X: Readonly<Record<BadgeSize, number>> = {
  xs: space.xs,
  sm: space.xs,
  md: space.sm,
};

/**
 * KHÔNG đệm dọc — chiều cao viên do hộp dòng quyết định, một mình.
 *
 * {@link LINE_HEIGHT_RATIO} đã chừa sẵn lề: chữ 11pt nằm trong hộp dòng 15pt, tức là còn 2pt
 * trống trên và dưới glyph TRƯỚC KHI cộng bất cứ đệm nào. Thêm đệm là đệm lần thứ hai cho cùng
 * một khoảng trắng, và trên một viên cao 15 thì mỗi pt cộng vào thấy rõ ngay — cột phải các thẻ
 * danh sách là nơi viên nhãn hay cao ngang hai dòng chữ mà chỉ chở một từ.
 *
 * Giữ tên hằng thay vì bỏ hẳn thuộc tính: nó nói rằng số 0 là một QUYẾT ĐỊNH, không phải chỗ ai
 * đó quên đặt đệm.
 */
const PADDING_Y = 0;

const BORDER_WIDTH = 1;

/**
 * Hộp dòng của chữ TRONG một viên nhãn — dùng chung cho mọi viên, không riêng `StatusBadge`.
 *
 * Xuất ra vì `DiscountTag` vẽ đúng cùng một hình và phải cao BẰNG viên nhãn khi hai thứ đứng
 * cạnh nhau trên thẻ xe; xem {@link LINE_HEIGHT_RATIO} để biết vì sao phải khai tường minh.
 */
export function badgeLineHeight(size: number): number {
  return Math.round(size * LINE_HEIGHT_RATIO);
}

/**
 * Bề rộng ÁNG CHỪNG của một viên nhãn — cho nơi cần xếp nhiều viên vào hàng trước khi React
 * Native kịp đo (`packRows`, xem `text-fit.ts`).
 *
 * Nằm ở đây chứ không ở chỗ gọi vì đệm ngang, nét viền và cỡ chữ là của CHÍNH viên nhãn: đổi
 * `px` ở dưới mà phép đo nằm nơi khác thì hai bên lệch nhau ngay, và không có gì báo.
 */
export function estimateStatusBadgeWidth(label: string, size: BadgeSize = 'md'): number {
  return (
    2 * (PADDING_X[size] + BORDER_WIDTH) + estimateTextWidth(label, FONT_SIZE[size], true)
  );
}

export function StatusBadge({
  label,
  color,
  size = 'md',
}: {
  label: string;
  color: StatusColor;
  size?: BadgeSize;
}) {
  const tone = statusTone(color);
  const textSize = FONT_SIZE[size];

  return (
    <XStack
      ai="center"
      alignSelf="flex-start"
      maxWidth="100%"
      bg={tone.bg}
      /*
        VIỀN cùng màu chữ — đúng cách `<Tag>` của AntD dựng nhãn bên web.

        Chỉ nền nhạt thôi thì viên chìm hẳn vào thẻ: trên nền trắng, một mảng xanh 8% với chữ
        xanh đọc ra là chữ có màu chứ không phải một cái nhãn. Nét viền khép khối lại, và nó
        cũng là thứ giữ cho viên còn thấy được khi nằm trên nền đã tô màu (thẻ `muted`,
        `accent`) — chỗ mà nền nhạt của viên gần như trùng với nền dưới nó.
      */
      bw={BORDER_WIDTH}
      bc={tone.fg}
      br={radius.pill}
      px={PADDING_X[size]}
      py={PADDING_Y}
    >
      {/*
        `flexShrink` + `numberOfLines` = cắt bằng dấu "…" thay vì tràn ra ngoài khung.
        Chỉ ăn khi nơi gọi cho khung một bề rộng XÁC ĐỊNH: `maxWidth: '100%'` quy theo bề rộng đã
        resolve của cha, mà cha rộng `auto` thì phần trăm không quy được và viên nhãn cứ thế nở ra.
      */}
      <Text
        flexShrink={1}
        col={tone.fg}
        fos={textSize}
        lh={badgeLineHeight(textSize)}
        fow={fontWeight.semibold}
        numberOfLines={1}
      >
        {label}
      </Text>
    </XStack>
  );
}
