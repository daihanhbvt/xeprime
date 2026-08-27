import type { ReactNode } from 'react';
import { Image } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { images } from '@/assets';
import { IconButton } from '@/components/ui/IconButton';
import { APP_NAME } from '@/lib/app-name';
import { colors, fontSize, fontWeight, radius, space } from '@/theme/tokens';

/**
 * # HEADER DÙNG CHUNG CỦA TOÀN APP — reuse, đừng dựng cái mới
 *
 * Mọi màn có thanh trên đều đi qua đây. Dựng riêng một hàng `XStack` cho từng màn là cách chắc
 * chắn nhất để mỗi màn một chiều cao, một cỡ chữ và một vùng chạm khác nhau — và người dùng
 * cảm nhận ngay dù không chỉ ra được vì sao.
 *
 * Thiếu thứ bạn cần thì **thêm biến thể vào đây**, không rẽ nhánh ở màn hình.
 *
 * ## Màu
 *
 * Nền mặc định là `background`, KHÔNG phải màu thương hiệu. Gold là màu HÀNH ĐỘNG của app (nút
 * chính, chip đang chọn, giá thuê); tô nó lên dải rộng nhất màn hình thì mọi CTA gold bên dưới
 * mất sức nặng. Header nhận diện bằng **thương hiệu và thứ bậc chữ**, không bằng mảng màu.
 *
 * Cần một màn nhấn mạnh thì dùng `tone="brand"` — có sẵn, nhưng hãy coi nó là ngoại lệ.
 *
 * ## Hai biến thể
 *
 * - `solid` (mặc định): nền đặc, kẻ mảnh phía dưới. Dùng cho màn có nội dung cuộn dưới header.
 * - `overlay`: trong suốt, **nổi lên trên** nội dung (`position: absolute`). Dùng cho màn mở
 *   đầu bằng ảnh tràn viền — nút bấm có nền tròn để đọc được trên mọi tấm ảnh.
 *
 * ## Safe area
 *
 * Header TỰ cộng inset trên ở cả hai biến thể. Vì vậy màn dùng nó **không** được bọc thêm một
 * `SafeAreaView` có cạnh `top` bên ngoài, và `<Screen>` đặt dưới header phải khai
 * `edges={['left', 'right', 'bottom']}` — nếu không phần trên bị đệm hai lần.
 *
 * ## Vùng chạm
 *
 * Nút lui và `right` đều là `IconButton`, tức luôn đủ 44pt/48dp. Đừng truyền `<Pressable>` trần
 * vào `right`.
 *
 * @example
 * // Màn thường
 * <AppHeader title={shop.name} onBack={goBack} />
 *
 * // Màn mở đầu bằng ảnh
 * <AppHeader variant="overlay" onBack={goBack} right={<IconButton … />} />
 */
type Variant = 'solid' | 'overlay';

type Tone = 'surface' | 'brand';

interface AppHeaderProps {
  /** Vắng mặt = không có nút lui (màn gốc của một tab). */
  onBack?: () => void;
  title?: string;
  subtitle?: string;
  /** Khu bên phải — nên là `IconButton` để giữ đúng vùng chạm. */
  right?: ReactNode;
  variant?: Variant;
  /** `brand`: nền gold, chữ tối. Ngoại lệ — đọc phần "Màu" ở trên trước khi dùng. */
  tone?: Tone;
  /** Ẩn tiêu đề ở biến thể `overlay` cho tới khi cuộn qua ảnh (màn chi tiết dùng). */
  showTitle?: boolean;
  /**
   * Bỏ phần đệm safe area của riêng thanh — NƠI GỌI tự lo cạnh trên.
   *
   * Chỉ dùng khi thanh nằm trong một lớp TRƯỢT (màn kết quả tìm xe cho nó lùi lên cùng khối
   * lọc): dải safe area phải đứng yên, nếu không danh sách chạy thẳng lên dưới thanh trạng
   * thái. Màn thường KHÔNG truyền — thanh tự lo cạnh trên là mặc định đúng.
   */
  flushTop?: boolean;
}

export function AppHeader({
  onBack,
  title,
  subtitle,
  right,
  variant = 'solid',
  tone = 'surface',
  showTitle = true,
  flushTop = false,
}: AppHeaderProps) {
  const t = useTranslations('Common.actions');
  const insets = useSafeAreaInsets();
  const overlay = variant === 'overlay';
  const brand = tone === 'brand';

  const bg = brand ? colors.primary : colors.background;
  const fg = brand ? colors.onPrimary : colors.text;
  const fgMuted = brand ? colors.onPrimary : colors.textMuted;

  /**
   * Không có tiêu đề thì đặt thương hiệu vào — một thanh chỉ có mũi tên lui trông như lỗi render.
   * Trừ biến thể nổi trên ảnh: ở đó ảnh đã là nhân vật chính, thêm logo là hai thứ tranh nhau.
   */
  const showBrandMark = !overlay && (!title || !showTitle);

  const bar = (
    <XStack
      ai="center"
      gap={space.xs}
      px={space.sm}
      py={space.xs}
      minHeight={56}
      marginTop={overlay || flushTop ? 0 : insets.top}
      {...(overlay
        ? {}
        : {
            bg,
            borderBottomWidth: 1,
            bc: brand ? colors.primary : colors.borderSubtle,
          })}
    >
      {onBack ? (
        <IconButton
          icon="arrow-back"
          label={t('back')}
          onPress={onBack}
          // Nền tròn ở biến thể nổi: mũi tên trần biến mất trên ảnh sáng.
          tone={overlay ? 'surface' : 'plain'}
        />
      ) : null}

      <YStack f={1} gap={0}>
        {showBrandMark ? (
          <BrandMark tone={tone} />
        ) : showTitle && title ? (
          <>
            <Text col={fg} fos={fontSize.body} fow={fontWeight.semibold} numberOfLines={1}>
              {title}
            </Text>
            {subtitle ? (
              <Text col={fgMuted} fos={fontSize.label} numberOfLines={1}>
                {subtitle}
              </Text>
            ) : null}
          </>
        ) : null}
      </YStack>

      {right}
    </XStack>
  );

  if (!overlay) {
    // Nền phủ luôn dải safe-area để chữ dưới thanh trạng thái không lộ nền trang bên dưới.
    return <YStack bg={bg}>{bar}</YStack>;
  }

  return (
    <YStack pos="absolute" top={0} left={0} right={0} zi={10} pt={insets.top}>
      {bar}
    </YStack>
  );
}

/** Ô logo cạnh tên thương hiệu — cao xấp xỉ một dòng chữ `body` để hai thứ cùng đường chân. */
const BRAND_LOGO = 26;

/** Logo + tên. Ở biến thể nổi trên ảnh thì ẩn — ảnh xe đã là nhân vật chính ở đó. */
function BrandMark({ tone }: { tone: Tone }) {
  return (
    <XStack ai="center" gap={space.xs}>
      <Image
        source={images.logo}
        style={{ width: BRAND_LOGO, height: BRAND_LOGO, borderRadius: radius.sm }}
        resizeMode="contain"
      />
      {/* Một `Text`, một style: tên đọc từ env nên không cắt được thành hai nửa cố định. */}
      <Text
        col={tone === 'brand' ? colors.onPrimary : colors.text}
        fos={fontSize.body}
        fow={fontWeight.bold}
      >
        {APP_NAME}
      </Text>
    </XStack>
  );
}
