import { Ionicons } from '@expo/vector-icons';
import type { ReactNode } from 'react';
import { Pressable } from 'react-native';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { Card } from '@/components/ui/Card';
import { InlineAction } from '@/components/ui/InlineAction';
import { IconDisc } from '@/components/ui/IconDisc';
import { MiniRowsSkeleton } from '@/components/ui/Skeleton';
import type { IconName } from '@/components/ui/Chip';
import { colors, fontSize, fontWeight, iconSize, space } from '@/theme/tokens';

/**
 * Bốn tông của một khối Tổng quan — nền đầu khối và màu đĩa hình.
 *
 * Có bảng này vì bốn khối xếp chồng nhau trên một màn cuộn: cùng một thẻ trắng, cùng một hàng
 * tiêu đề xám thì mắt trượt qua cả bốn mà không biết mình đang ở khối nào — người vận hành mở
 * màn buổi sáng phải nhảy thẳng tới "Quá hạn / Trả hôm nay", và họ tìm nó bằng MÀU trước khi kịp
 * đọc chữ.
 *
 * Tông là NGỮ NGHĨA, không phải trang trí: `danger` cho việc phải xử lý hôm nay, `warning` cho
 * việc sắp tới, `success` cho tiền đã vào, `primary` cho một bản kê trung tính. Chọn tông theo
 * "khối này trông sẽ đẹp" là cách màu mất hết nghĩa sau khối thứ ba.
 */
const TONE = {
  primary: { fg: colors.primaryActive, bg: colors.primaryLight },
  info: { fg: colors.info, bg: colors.infoSurface },
  success: { fg: colors.success, bg: colors.successSurface },
  warning: { fg: colors.warning, bg: colors.warningSurface },
  danger: { fg: colors.danger, bg: colors.dangerSurface },
} as const;

export type DashboardPanelTone = keyof typeof TONE;

/** Đĩa hình ở đầu khối — nhỏ hơn đĩa của một ô số, vì đây là nhãn của khối chứ không phải nội dung. */
const HEAD_DISC = 28;

/**
 * Một KHỐI của Tổng quan — tiêu đề + nội dung, với ba trạng thái RIÊNG của chính nó.
 *
 * Điểm quan trọng: mỗi khối tự chịu trách nhiệm về trạng thái của mình. Một khối lỗi KHÔNG được
 * kéo cả màn thành màn lỗi — người vận hành vẫn phải xem được đơn sắp trả khi sổ quỹ hỏng. Đó
 * cũng là lý do `error` là một dòng chữ trong khối chứ không phải một `ScreenError` toàn màn.
 *
 * Lỗi KHÁC rỗng: "Đã có lỗi xảy ra" và "Chưa có đơn nào" là hai sự thật khác nhau, và biến lỗi
 * thành một danh sách rỗng là cách một khối hỏng trông y hệt một gian hàng chưa có việc.
 *
 * **Thân khối KHÔNG có đệm ngang** (`<Card padded={false}>`, đầu khối tự đệm lấy): các dòng bên
 * trong tự đệm để nét kẻ giữa chúng chạy SÁT hai mép thẻ. Kẻ thụt vào hai bên đọc ra như mấy
 * gạch trang trí giữa các dòng, còn kẻ chạm mép mới ra một danh sách. Cái giá là mọi trạng thái
 * không-phải-dòng (chờ, lỗi, rỗng) phải tự khai đệm của mình — xem `PanelBody`.
 */
export function DashboardPanel({
  title,
  icon,
  tone = 'primary',
  loading = false,
  error = false,
  empty,
  extra,
  onRetry,
  action,
  children,
}: {
  title: string;
  icon: IconName;
  tone?: DashboardPanelTone;
  loading?: boolean;
  error?: boolean;
  /** Câu hiện khi KHÔNG có dòng nào và cũng không lỗi. */
  /** Chữ của khối rỗng — bỏ trống khi khối tự vẽ trạng thái rỗng trong `children`. */
  empty?: string;
  /** Chú thích nhỏ bên phải đầu khối ("7 ngày tới", "90 ngày qua"). */
  extra?: string;
  /** Có thì trạng thái lỗi kèm "Thử lại" — lỗi tạm thời không bắt người dùng kéo cả màn. */
  onRetry?: () => void;
  /**
   * Lối "mở cả khối" (Quản lý, Mở, Xem tất cả) — nằm TRÊN dải đầu khối như link ở header bản web,
   * không phải một mũi tên nổi trong thân khối (chồng lên mũi tên của từng hàng).
   */
  action?: { label: string; onPress: () => void };
  children?: ReactNode;
}) {
  const tStates = useTranslations('Common.states');
  const tActions = useTranslations('Common.actions');
  const skin = TONE[tone];
  const hasRows = Boolean(children);

  return (
    <Card padded={false}>
      <XStack
        ai="center"
        gap={space.sm}
        px={space.md}
        py={space.sm}
        bg={skin.bg}
        borderBottomWidth={1}
        bc={colors.borderSubtle}
      >
        {/*
          Đĩa ĐẶC + glyph trắng, không phải hình trần: đầu khối đã nằm trên một dải đã tô màu, và
          một biểu tượng cùng tông đặt trên nền cùng tông thì gần như tàng hình.
        */}
        <IconDisc icon={icon} tone={skin.fg} size={HEAD_DISC} filled />
        {/*
          Tiêu đề khối ở bậc `bodySm` + ĐẬM, không phải `body`.
          Bốn khối xếp chồng nhau, mỗi khối một dải màu: ở bậc 14 chúng đọc ra ngang hàng với tiêu
          đề trang "Tổng quan" ngay trên, và cả màn hoá ra năm tiêu đề cùng cỡ. Bậc 12 đậm vẫn
          tách khỏi dòng dữ liệu 12 thường bên dưới, mà không tranh vai với tiêu đề trang.
        */}
        <Text f={1} col={colors.text} fos={fontSize.bodySm} fow={fontWeight.bold}>
          {title}
        </Text>
        {extra ? (
          <Text col={colors.textMuted} fos={fontSize.label}>
            {extra}
          </Text>
        ) : null}
        {action ? (
          <Pressable
            onPress={action.onPress}
            accessibilityRole="link"
            accessibilityLabel={action.label}
            hitSlop={space.sm}
          >
            <XStack ai="center" gap={2}>
              <Text col={colors.primaryActive} fos={fontSize.label} fow={fontWeight.semibold}>
                {action.label}
              </Text>
              <Ionicons name="chevron-forward" size={iconSize.sm} color={colors.primaryActive} />
            </XStack>
          </Pressable>
        ) : null}
      </XStack>

      {loading ? (
        <MiniRowsSkeleton />
      ) : error ? (
        <PanelBody>
          <XStack ai="center" gap={space.xs}>
            <Ionicons name="alert-circle" size={iconSize.sm} color={colors.danger} />
            <Text f={1} col={colors.danger} fos={fontSize.bodySm}>
              {tStates('error')}
            </Text>
            {onRetry ? <InlineAction label={tActions('retry')} onPress={onRetry} /> : null}
          </XStack>
        </PanelBody>
      ) : hasRows ? (
        children
      ) : empty ? (
        <PanelBody>
          <Text col={colors.textMuted} fos={fontSize.bodySm}>
            {empty}
          </Text>
        </PanelBody>
      ) : null}
    </Card>
  );
}

/** Đệm cho phần nội dung KHÔNG phải danh sách — xem docblock của {@link DashboardPanel}. */
function PanelBody({ children }: { children: ReactNode }) {
  return (
    <YStack px={space.md} py={space.md}>
      {children}
    </YStack>
  );
}
