import { Pressable } from 'react-native';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import type { Href } from 'expo-router';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { DetailChevron } from '@/components/ui/DetailArrow';
import { MenuOptionList } from '@/components/ui/MenuOption';
import { resolveWorkspaceHref } from '@/features/account/account-nav';
import { useCurrentUser } from '@/features/auth/hooks/use-auth';
import { LegalDocLinks } from '@/features/legal/components/LegalDocLinks';
import { useNavigateOnce } from '@/hooks/use-navigate-once';
import { ROUTES } from '@/navigation/routes';
import { layout } from '@/theme/layout';
import { colors, fontSize, fontWeight, sizing, space } from '@/theme/tokens';

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
 * Mạng xã hội (web cố ý để chúng KHÔNG bấm được vì chưa có kênh thật) · cụm QR tải app · bộ đổi
 * ngôn ngữ (đã nằm trên thanh đầu màn) · "Lên đầu trang" (thao tác của con trỏ chuột) · cột
 * "Khám phá" (chính màn này là cột đó). Mỗi thứ bỏ đi là một thứ web có mà app không cần, không
 * phải một thứ app còn thiếu.
 */
export function HomeFooter() {
  const t = useTranslations('Marketplace.footer');

  return (
    <YStack gap={layout.block}>
      <ListVehicleCta />

      {/* Thẻ chìm, cùng tông với "Thuê xe chỉ với 4 bước" ngay trên: cả hai là phần đóng màn. */}
      <Card tone="muted" lift="flat" padded={false}>
        <YStack px={space.md} py={space.sm} gap={space.sm}>
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
      <YStack ai="center" gap={2}>
        <Text col={colors.textMuted} fos={fontSize.meta}>
          {t('copyright', { year: String(new Date().getFullYear()) })}
        </Text>
        <Text col={colors.placeholder} fos={fontSize.meta} ta="center">
          {t('country')}
        </Text>
      </YStack>
    </YStack>
  );
}

/**
 * Dải mời đăng xe — bản native của khối `cta.*` đứng ĐẦU chân trang web.
 *
 * ## Điều kiện hiện: giống web, chỉ khác lúc CHƯA BIẾT
 *
 * Web ẩn khối này khi `resolveWorkspaceHref(user) != null`, tức người đã có khu làm việc. Dùng
 * lại đúng hàm đó (bản native ở `account-nav.ts`) thay vì hỏi `tenant != null`: chủ xe tuyến hoa
 * hồng KHÔNG vào được cổng quản lý nhưng vẫn là chủ xe, và mời họ đăng xe lần nữa là mời họ làm
 * lại việc họ đã làm.
 *
 * Chỗ lệch duy nhất là lúc chưa biết người dùng là ai. Web render ở server nên `user` còn
 * `undefined` và khối NẰM TRONG HTML tĩnh — cố ý, để bot và khách vãng lai thấy nó; chủ xe mất nó
 * sau khi `/auth/me` trả lời. App không có bước đó: hiện rồi ẩn là một cú nháy ngay cuối màn, nên
 * `isLoading` thì chờ. Khách chưa đăng nhập vẫn thấy — `useCurrentUser` trả `null` rất nhanh và
 * khối này nằm dưới tầm nhìn đầu tiên.
 *
 * ## Vì sao nó ĐỨNG ĐẦU chân màn
 *
 * Đúng thứ tự web: lời mời trước, danh sách liên kết sau. Đây là cửa vào phễu thu phí của
 * ADR 0015, còn bốn văn bản pháp lý thì không ai chủ động đi tìm.
 */
function ListVehicleCta() {
  const t = useTranslations('Marketplace.footer.cta');
  const navigateOnce = useNavigateOnce();
  const { data: user, isLoading } = useCurrentUser();

  if (isLoading || resolveWorkspaceHref(user ?? null) != null) return null;

  return (
    /* `accent` = nền gold nhạt: đây là LỜI MỜI, phải nổi hơn thẻ liên kết chìm ngay dưới. */
    <Card tone="accent">
      <YStack gap={space.sm}>
        <YStack gap={2}>
          <Text col={colors.primaryActive} fos={fontSize.meta} fow={fontWeight.semibold} letterSpacing={0.8}>
            {t('eyebrow').toLocaleUpperCase()}
          </Text>
          <Text col={colors.text} fos={fontSize.h3} fow={fontWeight.bold}>
            {t('title')}
          </Text>
        </YStack>
        <Text col={colors.textMuted} fos={fontSize.bodySm}>
          {t('body')}
        </Text>
        {/*
          KHÔNG mang mũi tên của web sang. Bên đó nó là trang trí (`aria-hidden`) đứng SAU chữ;
          `Button` của app luôn đặt icon TRƯỚC nhãn, nên nó thành "→ Đăng xe cho thuê" — một mũi
          tên chỉ sang phải nằm ở đầu câu. `ShopEntryCard` mời đúng việc này bằng một nút trần.
        */}
        <Button label={t('action')} onPress={() => navigateOnce(ROUTES.listYourVehicle.root())} />
      </YStack>
    </Card>
  );
}

/** Tiêu đề một cột — nhỏ và mờ, cùng hình với tiêu đề nhóm của menu tài khoản. */
function ColumnTitle({ children }: { children: string }) {
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

  return (
    <Pressable
      onPress={() => navigateOnce(href)}
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
