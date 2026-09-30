import type { ReactNode } from 'react';
import { Image, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { images, logoWidth } from '@/assets';
import { IconButton } from '@/components/ui/IconButton';
import { APP_NAME } from '@/lib/app-name';
import { colors, fontSize, fontWeight, radius, space } from '@/theme/tokens';

const APP_HEADER_HEIGHT = 56;

/**
 * Nét VẠCH THƯƠNG HIỆU đóng đáy thanh trên.
 *
 * 2pt chứ không phải 1: một nét 1pt đọc ra là đường kẻ chia ô, còn ở 2pt màu gold thành một dải
 * có chủ ý — thứ chia thanh điều hướng khỏi nội dung mà không cần đổ bóng. Dày hơn nữa thì nó
 * bắt đầu tranh chú ý với chính nút hành động màu gold bên trong thanh.
 */
export const HEADER_RULE = 2;

/**
 * Độ đậm của vạch: cùng token gold, kéo mờ bớt.
 *
 * Gold đặc ở 2pt đọc ra như một dải trang trí và tranh chú ý với nút hành động cũng màu gold
 * trong thanh. Làm nhạt thì nó lùi về đúng vai một RANH GIỚI. Không đổi sang một mã màu nhạt
 * viết tay: bảng màu chỉ có gold đặc và gold-wash (gần trắng, tàng hình trên nền trang).
 */
export const HEADER_RULE_OPACITY = 0.45;

type Variant = 'solid' | 'overlay';

type Tone = 'surface' | 'brand';

interface AppHeaderProps {
  /** Vắng mặt = không có nút lui (màn gốc của một tab). */
  onBack?: () => void;
  title?: string;
  subtitle?: string;
  /**
   * Nhãn nhỏ đứng NGAY CẠNH tiêu đề — mức rủi ro của khách, trạng thái lưu trữ của một hồ sơ.
   *
   * Ở cạnh cái tên chứ không phải một hàng riêng dưới thân trang: đây là thứ định tính chính
   * đối tượng đang mở, nên nó phải đọc được cùng lúc với tên, và nó phải còn nhìn thấy khi
   * người dùng đã cuộn qua vài khối. Một hàng nhãn nằm trong thân trang thì cuộn là mất.
   *
   * Tiêu đề co lại nhường chỗ cho nhãn (nhãn không co) — một cái tên bị cắt bằng "…" vẫn nhận
   * ra được, còn "Từ chối phục…" thì mất đúng phần nói ra hệ quả.
   */
  badge?: ReactNode;
  /**
   * Điều khiển NGỮ CẢNH đứng ở DÒNG PHỤ, thay chỗ `subtitle`.
   *
   * Có khe này vì khu quản lý cần một bộ chọn phạm vi (chi nhánh đang xem) luôn nhìn thấy được:
   * nó từng là một DẢI RIÊNG dưới thanh trên, tức mọi màn quản lý mất thêm một hàng ~34dp cộng
   * một nét kẻ cho đúng một mẩu chữ. Dòng phụ vốn đã ở đó và chỉ chở một lời chào — đổi lời chào
   * lấy thứ người dùng thật sự thao tác là lãi hai lần.
   *
   * KHÔNG dùng để nhét nút bấm chung chung: hành động thuộc về `right`. Đây là chỗ cho thứ trả
   * lời câu "tôi đang xem phạm vi nào", và nó phải tự co lại trong bề ngang còn thừa.
   */
  context?: ReactNode;
  /**
   * Ảnh nhận diện đứng NGAY TRƯỚC tiêu đề — mặt gian hàng ở màn trò chuyện.
   *
   * Khác `left`: `left` THAY nút lui, còn khe này đứng cùng lúc với nó. Một màn trò chuyện cần
   * cả hai — lui về hộp thư, và biết mình đang nói với ai mà không phải đọc chữ.
   *
   * Không co lại (`flexShrink` mặc định 0 trong React Native): tên dài thì tên tự cắt, ảnh giữ
   * nguyên. Một avatar bị bóp méo còn khó nhận ra hơn là không có.
   */
  avatar?: ReactNode;
  /** Khu bên phải — nên là `IconButton` để giữ đúng vùng chạm. */
  right?: ReactNode;
  /**
   * Thay chỗ nút lui bằng một nút khác — khu quản lý đặt nút mở Drawer vào đây.
   *
   * Không phải "thêm vào bên trái": một thanh vừa có mũi tên lui vừa có nút menu là hai lối đi
   * ngược nhau nằm cạnh nhau. `onBack` thắng khi cả hai cùng có, vì lui là việc người dùng đang
   * cần làm ngay.
   */
  left?: ReactNode;
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

/**
 * Header dùng chung. Thiếu biến thể thì thêm vào đây, đừng dựng thanh riêng ở màn hình.
 *
 * Header TỰ cộng inset trên ở cả hai biến thể, nên `<Screen>` bên dưới phải khai
 * `edges={['left', 'right', 'bottom']}` — không thì phần trên bị đệm hai lần.
 */
export function AppHeader({
  onBack,
  left,
  title,
  subtitle,
  badge,
  context,
  avatar,
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
      minHeight={APP_HEADER_HEIGHT}
      marginTop={overlay || flushTop ? 0 : insets.top}
      {...(overlay ? {} : { bg })}
    >
      {onBack ? (
        <IconButton
          icon="arrow-back"
          label={t('back')}
          onPress={onBack}
          // Nền tròn ở biến thể nổi: mũi tên trần biến mất trên ảnh sáng.
          tone={overlay ? 'surface' : 'plain'}
        />
      ) : (
        (left ?? null)
      )}

      <XStack f={1} ai="center" gap={space.xs}>
        {avatar}

        <YStack f={1} gap={0}>
          {showBrandMark ? (
            <BrandMark tone={tone} />
          ) : showTitle && title ? (
            <>
              {/*
                `f={1}` khai TƯỜNG MINH bề rộng của hàng tiêu đề.

                Thiếu nó thì hàng tự co theo nội dung, và bề rộng nó nhận được phụ thuộc vào lượt
                đo — trên màn có `WebView` (tấm splash che lúc đầu) nó đo trúng lúc cha chưa có bề
                rộng, rồi `numberOfLines={1}` chốt luôn dấu "…" và không đo lại: "Trung tâm hỗ trợ"
                hiện ra thành "Trung tâm hỗ…" giữa một thanh còn trống hai phần ba (đo trên máy
                24/09/2026).
              */}
              <XStack f={1} ai="center" gap={space.xs}>
                {/*
                  `flexShrink` phải khai TƯỜNG MINH: trong React Native nó mặc định là 0, không
                  phải 1 như CSS. Thiếu nó thì một tên dài giữ nguyên bề rộng tự nhiên và đẩy
                  nhãn tràn khỏi thanh thay vì tự cắt.
                */}
                <Text
                  flexShrink={1}
                  col={fg}
                  fos={fontSize.body}
                  fow={fontWeight.semibold}
                  numberOfLines={1}
                >
                  {title}
                </Text>
                {badge}
              </XStack>
              {context ??
                (subtitle ? (
                  <Text col={fgMuted} fos={fontSize.label} numberOfLines={1}>
                    {subtitle}
                  </Text>
                ) : null)}
            </>
          ) : null}
        </YStack>
      </XStack>

      {right}
    </XStack>
  );

  if (!overlay) {
    /*
      Nền phủ luôn dải safe-area để chữ dưới thanh trạng thái không lộ nền trang bên dưới.

      Vạch đáy là một KHỐI RIÊNG chứ không phải `borderBottomWidth` của thanh: thanh có phần đệm
      ngang, còn vạch phải chạm hai mép màn hình — một nét thụt vào hai bên đọc ra như thanh bị
      hụt chứ không như một ranh giới.

      Nền gold (`brand`) dùng sắc gold ĐẬM hơn: cùng `colors.primary` đặt trên chính nó thì vạch
      biến mất, và thanh lại trôi vào nội dung đúng như trước.
    */
    return (
      <YStack bg={bg}>
        {bar}
        <YStack
          h={HEADER_RULE}
          opacity={HEADER_RULE_OPACITY}
          bg={brand ? colors.primaryActive : colors.primary}
        />
      </YStack>
    );
  }

  return (
    <YStack pos="absolute" top={0} left={0} right={0} zi={10} pt={insets.top}>
      {bar}
    </YStack>
  );
}

/** Cao xấp xỉ một dòng chữ `body` để logo và tiêu đề cùng đường chân. */
const BRAND_LOGO = 24;

const styles = StyleSheet.create({
  lockup: { width: logoWidth(BRAND_LOGO), height: BRAND_LOGO },
  mark: { width: BRAND_LOGO, height: BRAND_LOGO, borderRadius: radius.sm },
});

/**
 * Logo thương hiệu. Ở biến thể nổi trên ảnh thì ẩn — ảnh xe đã là nhân vật chính ở đó.
 *
 * Nền sáng dùng LOCKUP: artwork đã chứa sẵn chữ "xe prime", nên không kèm `APP_NAME` nữa.
 * Nền vàng `brand` thì không dùng được — chữ "xe" trong lockup cũng màu vàng và sẽ chìm mất;
 * ở đó là biểu tượng vuông cộng tên viết bằng `onPrimary`.
 */
function BrandMark({ tone }: { tone: Tone }) {
  if (tone === 'brand') {
    return (
      <XStack ai="center" gap={space.xs}>
        <Image source={images.logoMark} style={styles.mark} resizeMode="contain" />
        {/* Một `Text`, một style: tên đọc từ env nên không cắt được thành hai nửa cố định. */}
        <Text col={colors.onPrimary} fos={fontSize.body} fow={fontWeight.bold}>
          {APP_NAME}
        </Text>
      </XStack>
    );
  }

  return (
    <Image
      source={images.logo}
      style={styles.lockup}
      resizeMode="contain"
      accessibilityRole="image"
      accessibilityLabel={APP_NAME}
    />
  );
}
