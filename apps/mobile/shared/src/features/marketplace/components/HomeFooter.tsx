import { Ionicons } from '@expo/vector-icons';
import { Pressable, Text as NativeText } from 'react-native';
import { SERVICE_TYPE, type ServiceType } from '@xeprime/types';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import type { Href } from 'expo-router';
import { Card } from '@/components/ui/Card';
import { DetailChevron } from '@/components/ui/DetailArrow';
import { MenuOptionList } from '@/components/ui/MenuOption';
import { LegalDocLinks } from '@/features/legal/components/LegalDocLinks';
import { useNavigateOnce } from '@/hooks/use-navigate-once';
import { ROUTES } from '@/navigation/routes';
import { layout } from '@/theme/layout';
import { useColors } from '@/theme/ThemeProvider';
import { FONT_FAMILY } from '@/theme/fonts';
import { fontSize, fontWeight, sizing, space } from '@/theme/tokens';
import type { ExploreSearchParams } from '@/navigation/routes-base';

/**
 * Cột "XePrime" của chân trang — hai mục, cùng thứ tự với `FOOTER_COLUMNS` bên web.
 *
 * KHÔNG có `columns.company.app` ("Tải ứng dụng"): người đọc khối này ĐANG ở trong ứng dụng đó.
 * Trang `/app` bên web là lời mời tải app, nên chở nó vào app là một mục dẫn người dùng đi mời
 * chính mình — đây là điểm duy nhất khối này cố ý lệch khỏi web, và nó lệch vì cùng một lý do mà
 * web dựng trang ấy.
 */
const COMPANY_LINKS: readonly { key: 'about' | 'support'; href: () => Href }[] = [
  { key: 'about', href: () => ROUTES.content.about() },
  { key: 'support', href: () => ROUTES.support.home() },
];

/** Cột "Khám phá" — ba bộ lọc dịch vụ, cùng thứ tự và nhãn (`HomeSearch.service.*`) với `FOOTER_SERVICE_LINKS` web. */
const EXPLORE_LINKS: readonly {
  key: ServiceType;
  labelKey: 'selfDrive' | 'withDriver' | 'longTerm';
}[] = [
  { key: SERVICE_TYPE.SELF_DRIVE, labelKey: 'selfDrive' },
  { key: SERVICE_TYPE.WITH_DRIVER, labelKey: 'withDriver' },
  { key: SERVICE_TYPE.LONG_TERM, labelKey: 'longTerm' },
];

/**
 * Bốn biểu tượng mạng xã hội — như web: KHÔNG phải liên kết (XePrime chưa công bố kênh chính thức),
 * không bắt chạm, chỉ có nhãn cho trình đọc màn hình.
 */
const SOCIALS = [
  { key: 'facebook', icon: 'logo-facebook', label: 'Facebook' },
  { key: 'instagram', icon: 'logo-instagram', label: 'Instagram' },
  { key: 'twitter', icon: 'logo-twitter', label: 'X (Twitter)' },
  { key: 'tiktok', icon: 'logo-tiktok', label: 'TikTok' },
] as const;

/**
 * Khối cuối màn chủ — bản native của HAI cột điều hướng trong `MarketFooter` bên web.
 *
 * ## Vì sao khối này phải có
 *
 * Ngày 23/09/2026 web bỏ cột "Dành cho chủ xe" khỏi chân trang và lấy chỗ đó cho ba trang "thật
 * sự cần một lối vào": giới thiệu sàn, giới thiệu ứng dụng, và trung tâm trợ giúp. App đã dựng
 * xong hai màn tương ứng — nhưng KHÔNG có cửa nào mở chúng: `/about` chỉ mở được từ hai chủ đề
 * của trang hỗ trợ, và `/support` chỉ mở được từ một văn bản pháp lý hoặc từ wizard mua gói. Tức
 * là một khách thuê đang mắc kẹt giữa chuyến không có đường nào tới trung tâm trợ giúp, đúng
 * người mà web ghi rõ là lý do đặt mục đó ở đây.
 *
 * ## Vì sao ở CUỐI MÀN CHỦ
 *
 * Web có chân trang trên mọi trang công khai; app thì điều hướng là THANH TAB, không có vùng dùng
 * chung nào ở cuối mỗi màn. Màn chủ là bề mặt công khai duy nhất không đòi phiên đăng nhập — và
 * đây cũng đúng chỗ web đặt chân trang trên trang chủ: ngay sau "Thuê xe chỉ với 4 bước".
 *
 * ## Những gì KHÔNG mang sang
 *
 * Cụm QR tải app · bộ đổi
 * ngôn ngữ (đã nằm trên thanh đầu màn) · "Lên đầu trang" (thao tác của con trỏ chuột). Cột
 * "Khám phá" và hàng biểu tượng mạng xã hội (không bấm được) có như web. Mỗi thứ bỏ đi là một thứ web có mà app không cần, không
 * phải một thứ app còn thiếu.
 */
export function HomeFooter({ onExplore }: { onExplore: (params: ExploreSearchParams) => void }) {
  const colors = useColors();
  const t = useTranslations('Marketplace.footer');
  const tService = useTranslations('HomeSearch.service');

  return (
    <YStack gap={layout.block}>
      {/* Thẻ chìm, cùng tông với "Thuê xe chỉ với 4 bước" ngay trên: cả hai là phần đóng màn. */}
      <Card tone="muted" lift="flat" padded={false}>
        <YStack px={space.md} py={space.sm} gap={space.sm}>
          <ColumnTitle>{t('columns.explore.title')}</ColumnTitle>
          <MenuOptionList>
            {EXPLORE_LINKS.map(({ key, labelKey }) => (
              <NavLink
                key={key}
                label={tService(labelKey)}
                onPress={() => onExplore({ serviceType: key })}
              />
            ))}
          </MenuOptionList>

          <ColumnTitle>{t('columns.company.title')}</ColumnTitle>
          <MenuOptionList>
            {COMPANY_LINKS.map(({ key, href }) => (
              <CompanyLink key={key} label={t(`columns.company.${key}` as never)} href={href()} />
            ))}
          </MenuOptionList>

          <ColumnTitle>{t('columns.legal.title')}</ColumnTitle>
          {/*
            Bốn văn bản dùng lại đúng thành phần mà trang hỗ trợ dùng — kèm câu tóm tắt của từng
            văn bản. Chân trang web chỉ in tên vì nó có bốn cột chữ nhỏ; ở đây một danh sách dọc
            có chỗ cho câu tóm tắt, và đó là thứ nói ra người dùng sắp mở cái gì.
          */}
          <LegalDocLinks />
        </YStack>
      </Card>

      {/*
        Dòng bản quyền + quốc gia. Web in nó ở thanh tiện ích dưới cùng; ở đây nó là dòng cuối
        cùng của màn, ngoài thẻ — nó nói về NỀN TẢNG, không phải về khối liên kết phía trên.

        Năm lấy khi render: một hằng `2026` viết cứng sẽ sai ngay 01/01 năm sau. Truyền dạng CHUỖI
        vì ICU sẽ định dạng số có phân tách nhóm và biến 2026 thành "2.026".
      */}
      <YStack ai="center" gap={space.sm}>
        <XStack gap={space.md} accessibilityLabel={t('socialsLabel')} accessible>
          {SOCIALS.map(({ key, icon }) => (
            <Ionicons key={key} name={icon} size={20} color={colors.textMuted} />
          ))}
        </XStack>
        <NativeText
          style={{ color: colors.textMuted, fontSize: fontSize.meta, fontFamily: FONT_FAMILY.body }}
        >
          {t.rich('copyrightCompany', {
            year: String(new Date().getFullYear()),
            brand: (chunks) => (
              <NativeText style={{ color: colors.text, fontFamily: FONT_FAMILY.semibold }}>
                {chunks}
              </NativeText>
            ),
          })}
        </NativeText>
        <Text col={colors.placeholder} fos={fontSize.meta} ta="center">
          {t('country')}
        </Text>
      </YStack>
    </YStack>
  );
}

/** Tiêu đề một cột — nhỏ và mờ, cùng hình với tiêu đề nhóm của menu tài khoản. */
function ColumnTitle({ children }: { children: string }) {
  const colors = useColors();
  return (
    <Text
      col={colors.placeholder}
      fos={fontSize.meta}
      fow={fontWeight.semibold}
      letterSpacing={0.8}
    >
      {children.toLocaleUpperCase()}
    </Text>
  );
}

/**
 * Một mục điều hướng chỉ có NHÃN.
 *
 * Không dùng `SettingRow`: dòng đó đòi một câu mô tả, và bó message của chân trang không có câu
 * nào — bịa thêm chữ cho một dòng điều hướng là dựng nội dung không ai duyệt, ở đúng chỗ nói
 * XePrime là gì.
 */
function CompanyLink({ label, href }: { label: string; href: Href }) {
  const navigateOnce = useNavigateOnce();
  return <NavLink label={label} onPress={() => navigateOnce(href)} />;
}

function NavLink({ label, onPress }: { label: string; onPress: () => void }) {
  const colors = useColors();

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="link"
      accessibilityLabel={label}
      style={({ pressed }) => (pressed ? { backgroundColor: colors.surfaceMuted } : null)}
    >
      <XStack ai="center" gap={space.sm} minHeight={sizing.touchTarget} py={space.xs}>
        <Text f={1} col={colors.text} fos={fontSize.body} fow={fontWeight.medium}>
          {label}
        </Text>
        <DetailChevron />
      </XStack>
    </Pressable>
  );
}
