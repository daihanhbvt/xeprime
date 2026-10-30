import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { Pressable, useWindowDimensions } from 'react-native';
import Svg, {
  Defs,
  LinearGradient as SvgGradient,
  Path,
  Stop,
  Text as SvgText,
} from 'react-native-svg';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { images } from '@/assets';
import { FONT_FAMILY } from '@/theme/fonts';
import { useAppFormat } from '@/i18n/use-app-format';
import type { ExploreSearchParams } from '@/navigation/routes-base';
import { layout } from '@/theme/layout';
import { useAppScheme, useColors } from '@/theme/ThemeProvider';
import { fontSize, fontWeight, market, space } from '@/theme/tokens';
import { useSearchExperience } from '../search-context';
import { GradientButton } from './home/GradientButton';
import { HomeCarousel, homeCarouselItemWidth } from './home/HomeCarousel';
import { HomeSectionHeading } from './home/HomeSectionHeading';

/**
 * Bốn điểm đến của bản vẽ v2 — cùng mã tỉnh THẬT và cùng ô cắt với `FeaturedLocations` bên web.
 *
 * Vị trí cắt (`top`/`left`, phần trăm của THẺ) chép từ `.city*` trong CSS bên web: cả bốn thẻ cắt
 * từ MỘT tấm tranh, tấm tranh phủ khung `ART_SCALE` lớn hơn thẻ.
 */
const CITIES = [
  { key: 'danang', provinceCode: '48', top: 0.0792, left: -0.3512 },
  { key: 'hanoi', provinceCode: '01', top: 0.0569, left: -2.5447 },
  { key: 'hcm', provinceCode: '79', top: -0.6631, left: -0.6827 },
  { key: 'hue', provinceCode: '46', top: -0.6926, left: -3.4767 },
] as const;

/*
 * MÀU TRANH của khối điểm đến — nền thẻ cát và dải mờ dưới tên thành phố, chép từ
 * `FeaturedLocations.module.css` web (sáng + `[data-theme=dark]`). Đây là màu của BỨC TRANH, không
 * phải màu giao diện: không token nào của `@xeprime/ui` mang chúng (web cũng viết cứng — ghi ở bảng
 * lỗi web), nên giữ ở một hằng có tên. Chữ trên thẻ thì đi qua token (`useColors`).
 */
const DEST_ART = {
  light: {
    card: '#fdf6ec',
    band: ['#fcf0df', '#fcf0df', 'rgba(253, 246, 236, 0)'] as const,
  },
  dark: {
    card: '#060403',
    band: ['#171207', '#171207', 'rgba(23, 18, 7, 0)'] as const,
  },
} as const;
/** Gradient chữ tên thành phố — `.city` web. Màu tranh, không phải token. */
const CITY_NAME_ART = ['#d58413', '#fac20b'] as const;
/** Dải màu hai lớp sóng chân thẻ — `dest-wave-1.svg` / `dest-wave-2.svg` web. Màu tranh. */
const WAVE_BACK_ART = ['#1A150E', '#241A0F', '#17140D', '#22180D'] as const;
const WAVE_FRONT_ART = ['#E48D28', '#F0A53A', '#FFC74D', '#B76A18'] as const;
/** Tên thành phố: chữ gradient `.city` web — tô bằng SVG, không cần masked-view. */
function CityName({ name, width }: { name: string; width: number }) {
  const size = fontSize.h1;
  const height = Math.round(size * 1.3);
  return (
    <Svg width={width} height={height} accessibilityLabel={name}>
      <Defs>
        <SvgGradient id="destCity" x1="0" y1="0" x2="1" y2="0">
          <Stop offset="0" stopColor={CITY_NAME_ART[0]} />
          <Stop offset="1" stopColor={CITY_NAME_ART[1]} />
        </SvgGradient>
      </Defs>
      <SvgText
        x={width}
        y={size}
        textAnchor="end"
        fontSize={size}
        fontFamily={FONT_FAMILY.bold}
        fill="url(#destCity)"
      >
        {name.toLocaleUpperCase()}
      </SvgText>
    </Svg>
  );
}

/** Hai lớp sóng của chân thẻ — path + dải màu của `dest-wave-1.svg` / `dest-wave-2.svg` web. */
const WAVE_BACK =
  'M42 3.59269C17.2 12.7927 3.66667 13.426 0 12.5927L0.000156403 46V120C37.5834 120 281.996 128 281.996 128L264 64.5928L266.996 58.5C266.496 51.1667 266.306 37.4493 256 29.5928C235.26 13.7832 205.721 36.7936 187 38.0928C154.141 40.3732 135.5 29.0928 122.5 20.0928C109.5 11.0928 73 -7.90731 42 3.59269Z';
const WAVE_FRONT =
  'M42 3.59269C17.2 12.7927 3.66667 13.426 0 12.5927V21C0 21 19 16.0928 37.5 9.09276C52.3 3.49276 65.6667 5.4261 70.5 7.09276L5.5 37.5928C5.5 37.5928 62.5 11.5927 80.5 13.5928C117.853 17.7433 138 39.0928 165.5 42.0928C200.893 45.9538 213.5 32.1651 237 29.5928C255.8 27.5349 262.833 52.0686 264 64.5928L269.5 53.5928C269 46.2594 266.307 37.4493 256 29.5928C235.26 13.7832 205.72 36.7936 187 38.0928C154.14 40.3732 135.5 29.0928 122.5 20.0928C109.5 11.0928 73 -7.90731 42 3.59269Z';

function DestWaves({ width, scale }: { width: number; scale: number }) {
  return (
    <>
      <Svg
        width={width}
        height={128 * scale}
        viewBox="0 0 281.996 128"
        preserveAspectRatio="none"
        style={{ position: 'absolute', top: 0, left: 0 }}
      >
        <Defs>
          <SvgGradient id="destBack" x1="0" y1="0" x2="1" y2="0">
            <Stop offset="0" stopColor={WAVE_BACK_ART[0]} />
            <Stop offset="0.403846" stopColor={WAVE_BACK_ART[1]} />
            <Stop offset="0.653846" stopColor={WAVE_BACK_ART[2]} />
            <Stop offset="1" stopColor={WAVE_BACK_ART[3]} />
          </SvgGradient>
        </Defs>
        <Path d={WAVE_BACK} fill="url(#destBack)" />
      </Svg>
      <Svg
        width={width * 0.9557}
        height={64.593 * scale}
        viewBox="0 0 269.5 64.5928"
        preserveAspectRatio="none"
        style={{ position: 'absolute', top: 0, left: 0 }}
      >
        <Defs>
          <SvgGradient id="destFront" x1="0" y1="0" x2="1" y2="0">
            <Stop offset="0" stopColor={WAVE_FRONT_ART[0]} />
            <Stop offset="0.403846" stopColor={WAVE_FRONT_ART[1]} />
            <Stop offset="0.653846" stopColor={WAVE_FRONT_ART[2]} />
            <Stop offset="1" stopColor={WAVE_FRONT_ART[3]} />
          </SvgGradient>
        </Defs>
        <Path d={WAVE_FRONT} fill="url(#destFront)" />
      </Svg>
    </>
  );
}

/** Khung tranh so với thẻ (`.illustration` bên web: 459.91% × 166.28%). */
const ART_SCALE = { width: 4.5991, height: 1.6628 };
/** Thẻ cao 520, bo góc 120/40 (`.card` web — px cố định, không theo bề ngang). */
const CARD_HEIGHT = 520;

/**
 * "Địa điểm nổi bật — Khám phá xe thuê tại các điểm đến phổ biến" (design v2, ADR 0062).
 *
 * Số xe và giá "chỉ từ" là số THẬT của `/public/destinations` (cùng ô cache với bộ chọn địa điểm
 * của thẻ tìm kiếm). Thành phố chưa có xe vẫn hiện thẻ — đây là khối giới thiệu điểm đến — nhưng
 * không bịa số: dòng số liệu chỉ hiện khi API trả về tỉnh đó.
 *
 * Bấm thẻ sang trang kết quả lọc theo tỉnh — cùng đích `marketplaceSearchHref({ provinceCode })`
 * của web.
 */
export function FeaturedLocations({
  onOpenSearch,
}: {
  onOpenSearch: (params: ExploreSearchParams) => void;
}) {
  const { scheme } = useAppScheme();
  const colors = useColors();
  const dark = scheme === 'dark';
  const skin = {
    ...DEST_ART[dark ? 'dark' : 'light'],
    // Chữ phụ = tertiary ở cả hai chế độ; chữ nhấn = secondary (sáng) / chữ chính (tối) — đúng web.
    meta: colors.placeholder,
    metaStrong: dark ? colors.text : colors.textMuted,
  };
  const t = useTranslations('Home.destinations');
  const fmt = useAppFormat();
  const { destinations } = useSearchExperience();
  const { width } = useWindowDimensions();
  const byCode = new Map((destinations ?? []).map((item) => [item.provinceCode, item]));

  // Như web ở bề rộng điện thoại: thẻ rộng theo băng chuyền (1.3 thẻ/khung), CAO cố định 520.
  const cardWidth = homeCarouselItemWidth(width);
  const cardHeight = CARD_HEIGHT;
  const large = 120;
  const small = 40;

  return (
    <YStack gap={layout.section}>
      <HomeSectionHeading kicker={t('kicker')} title={t('title')} />
      <HomeCarousel accessibilityLabel={t('title')}>
        {CITIES.map((city) => {
          const name = t(`cities.${city.key}`);
          const stats = byCode.get(city.provinceCode);
          const open = () => onOpenSearch({ provinceCode: city.provinceCode });

          return (
            <Pressable
              key={city.key}
              onPress={open}
              accessibilityRole="link"
              accessibilityLabel={t('exploreAria', { city: name })}
            >
              <YStack
                w={cardWidth}
                h={cardHeight}
                ov="hidden"
                bw={1}
                bc={market.destinationBorder}
                bg={skin.card}
                style={{
                  borderTopLeftRadius: large,
                  borderBottomRightRadius: large,
                  borderTopRightRadius: small,
                  borderBottomLeftRadius: small,
                }}
              >
                {/* Nền tối dùng chung — web chỉ bật ở giao diện tối (`.backdrop`). */}
                {scheme === 'dark' ? (
                  <Image
                    source={images.homeDestBg}
                    contentFit="fill"
                    style={{
                      position: 'absolute',
                      top: cardHeight * -0.0001,
                      left: cardWidth * -0.4815,
                      width: cardWidth * 1.6556,
                      height: cardHeight * 1.1077,
                    }}
                    accessibilityElementsHidden
                  />
                ) : null}
                <Image
                  source={images.homeDestCities}
                  contentFit="fill"
                  style={{
                    position: 'absolute',
                    width: cardWidth * ART_SCALE.width,
                    height: cardHeight * ART_SCALE.height,
                    top: cardHeight * city.top,
                    left: cardWidth * city.left,
                  }}
                  accessibilityElementsHidden
                />

                {/* Khối chữ phía trên (`.details` web): dải màu nhạt dần cao 297, tên + số liệu căn phải. */}
                <LinearGradient
                  colors={skin.band}
                  locations={[0, 0.31784, 1]}
                  style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 297 }}
                />
                <YStack pt={36} px={20} gap={space.sm} ai="flex-end">
                  <CityName name={name} width={cardWidth - 40} />
                  {stats ? (
                    <XStack w="100%" jc="space-between" gap={space.sm}>
                      <Text col={skin.meta} fos={fontSize.label}>
                        {t('available', { count: stats.vehicleCount })}
                      </Text>
                      {stats.minDailyPrice ? (
                        <Text col={skin.meta} fos={fontSize.label}>
                          {t.rich('fromPrice', {
                            price: fmt.moneyCompact(stats.minDailyPrice, { price: true }),
                            strong: (chunks) => (
                              <Text col={skin.metaStrong} fow={fontWeight.medium}>
                                {chunks}
                              </Text>
                            ),
                          })}
                        </Text>
                      ) : null}
                    </XStack>
                  ) : null}
                </YStack>

                {/* Chân thẻ (`.footer` web): hai lớp sóng + nút "Khám phá" ở 398/520. */}
                <YStack pos="absolute" top={398} left={-1} w={cardWidth + 2} h={128}>
                  <DestWaves width={cardWidth + 2} scale={1} />
                  <YStack pos="absolute" top={56} left={0} right={0} ai="center">
                    <GradientButton
                      label={t('explore')}
                      iconEnd="chevron-forward"
                      onPress={open}
                      accessibilityLabel={t('exploreAria', { city: name })}
                    />
                  </YStack>
                </YStack>
              </YStack>
            </Pressable>
          );
        })}
      </HomeCarousel>
    </YStack>
  );
}
