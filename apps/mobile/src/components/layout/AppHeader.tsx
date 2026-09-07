import type { ReactNode } from 'react';
import { Image, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { images } from '@/assets';
import { IconButton } from '@/components/ui/IconButton';
import { APP_NAME } from '@/lib/app-name';
import { colors, fontSize, fontWeight, radius, space } from '@/theme/tokens';

const APP_HEADER_HEIGHT = 56;

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
      ) : (
        (left ?? null)
      )}

      <YStack f={1} gap={0}>
        {showBrandMark ? (
          <BrandMark tone={tone} />
        ) : showTitle && title ? (
          <>
            <XStack ai="center" gap={space.xs}>
              {/*
                `flexShrink` phải khai TƯỜNG MINH: trong React Native nó mặc định là 0, không
                phải 1 như CSS. Thiếu nó thì một tên dài giữ nguyên bề rộng tự nhiên và đẩy nhãn
                tràn khỏi thanh thay vì tự cắt.
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

const styles = StyleSheet.create({
  logo: { width: BRAND_LOGO, height: BRAND_LOGO, borderRadius: radius.sm },
});

/** Logo + tên. Ở biến thể nổi trên ảnh thì ẩn — ảnh xe đã là nhân vật chính ở đó. */
function BrandMark({ tone }: { tone: Tone }) {
  return (
    <XStack ai="center" gap={space.xs}>
      <Image source={images.logo} style={styles.logo} resizeMode="contain" />
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
