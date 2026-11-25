import { useMemo } from 'react';
import { useRouter, type Href } from 'expo-router';
import { Linking, Pressable, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import {
  FEATURE_STATE,
  PERMISSION,
  PLAN_FEATURE,
  isFeatureVisible,
  type Permission,
  type PlanFeature,
} from '@xeprime/types';
import { LEGAL_DOC_VALUES } from '@xeprime/domain';
import { LineIcon, type LineIconName } from '@/components/icons/LineIcon';
import { Screen } from '@/components/layout/Screen';
import { Button } from '@/components/ui/Button';
import { LinkArrow } from '@/components/ui/LinkArrow';
import { usePartnerAppConfig } from '@/features/app-config/use-partner-app-config';
import { useFeatureStates } from '@/features/auth/hooks/use-feature';
import { usePermissions } from '@/features/auth/hooks/use-permissions';
import { useOpenLegalDoc } from '@/features/legal/use-open-legal-doc';
import { ManagePageHeader } from '@/features/shell/ManagePageHeader';
import { useNavigateOnce } from '@/hooks/use-navigate-once';
import { goBackOr } from '@/navigation/go-back-or';
import { ROUTES } from '@/navigation/routes';
import { themed, useAppScheme, useColors } from '@/theme/ThemeProvider';
import { elevation } from '@/theme/elevation';
import { FONT_FAMILY } from '@/theme/fonts';
import { fontWeight, radius, space, typeScale } from '@/theme/tokens';
import { FaqList, type FaqEntry } from './components/FaqList';

const CONTACT_BG = require('../../../assets/images/partner/help-contact-bg.webp') as number;

/** Khoá message trong `ManageCommon.support.app.quickStart`. */
type QuickStartKey = 'vehicles' | 'policies' | 'requests' | 'calendar' | 'finance' | 'members';

/** Bộ màu của một thẻ bắt đầu nhanh (Figma `24232:117514`): ô icon nền nhạt + icon đậm cùng tông. */
type TileTone = 'brand' | 'success' | 'info' | 'purple' | 'pink' | 'orange';

interface QuickStartLink {
  readonly key: QuickStartKey;
  readonly href: Href;
  readonly permission: Permission;
  /**
   * Cờ NĂNG LỰC THEO GÓI (ADR 0027) - trục ĐỘC LẬP với `permission`, kiểm nối tiếp, cùng luật với
   * `ManageDrawer`: hướng dẫn không bao giờ trỏ tới thứ mà menu đang giấu.
   */
  readonly feature?: PlanFeature;
  readonly icon: LineIconName;
  readonly tone: TileTone;
}

/**
 * Sáu việc đầu tiên của một gian hàng mới, theo đúng thứ tự người ta phải làm chúng. Mỗi thẻ trỏ
 * tới một màn CÓ THẬT trong app và mang quyền của chính màn đó. Icon lấy đúng vector Figma.
 */
const QUICK_START: readonly QuickStartLink[] = [
  {
    key: 'vehicles',
    href: ROUTES.manage.vehicleNew(),
    permission: PERMISSION.VEHICLE_CREATE,
    icon: 'help-car',
    tone: 'brand',
  },
  {
    key: 'policies',
    href: ROUTES.manage.shopPolicies(),
    permission: PERMISSION.TENANT_VIEW,
    icon: 'shield-tick',
    tone: 'success',
  },
  {
    key: 'requests',
    // Hộp thư yêu cầu đã gộp vào "Đơn thuê xe" (05/11/2026) - web trỏ `ROUTES.MANAGE.BOOKINGS`.
    href: ROUTES.manage.bookings(),
    permission: PERMISSION.BOOKING_REQUEST_VIEW,
    icon: 'doc-left',
    tone: 'info',
  },
  {
    key: 'calendar',
    href: ROUTES.manage.calendar(),
    permission: PERMISSION.CALENDAR_VIEW,
    icon: 'calendar-2',
    tone: 'purple',
  },
  {
    key: 'finance',
    href: ROUTES.manage.receipts(),
    permission: PERMISSION.FINANCE_VIEW,
    feature: PLAN_FEATURE.FINANCE,
    icon: 'wallet-3',
    tone: 'pink',
  },
  {
    key: 'members',
    href: ROUTES.manage.members(),
    permission: PERMISSION.MEMBER_VIEW,
    feature: PLAN_FEATURE.MEMBERS,
    icon: 'group-2',
    tone: 'orange',
  },
];

/** Sáu câu hỏi hay gặp nhất - chính là những chỗ mô hình nghiệp vụ khác với trực giác. */
const FAQ_KEYS = [
  'publish',
  'requestVsBooking',
  'conflict',
  'longTerm',
  'maintenance',
  'missingMenu',
] as const;

/**
 * Nền ô icon · màu icon · màu ánh góc thẻ (gradient 20% từ góc trên phải, Figma "Discount Toggle").
 * Giao diện tối không vẽ ánh - ánh pastel trên nền tối thành vệt bẩn.
 */
const useTileSkin = themed<Record<TileTone, { tile: string; icon: string; glow: string }>>((colors) => ({
  brand: { tile: colors.warningSurface, icon: colors.brandShape, glow: 'rgba(254, 238, 191, 0.2)' },
  success: { tile: colors.successSurface, icon: colors.success, glow: 'rgba(192, 254, 191, 0.2)' },
  info: { tile: colors.infoLow, icon: colors.infoStrong, glow: 'rgba(191, 229, 254, 0.2)' },
  purple: { tile: colors.purpleSurface, icon: colors.purpleStrong, glow: 'rgba(237, 191, 254, 0.2)' },
  pink: { tile: colors.pinkSurface, icon: colors.pink, glow: 'rgba(254, 191, 222, 0.2)' },
  orange: { tile: colors.orangeLow, icon: colors.orangeHigh, glow: 'rgba(254, 222, 191, 0.2)' },
}));

/** Chỉ giữ chữ số và `+` cho đường `tel:` - hotline admin gõ có thể có khoảng trắng/dấu chấm. */
function telHref(phone: string): string {
  return `tel:${phone.replace(/[^\d+]/g, '')}`;
}

/**
 * Trung tâm hỗ trợ của cổng quản lý (SYS-05) - Figma Partner "Helps" `24232:116776`: lưới sáu thẻ
 * bắt đầu nhanh, câu hỏi thường gặp dạng thẻ, văn bản pháp lý, khối liên hệ vàng.
 *
 * Nghiệp vụ giữ như web `SupportCenter`: cùng sáu đích, cùng bộ lọc quyền + cờ gói, cùng sáu câu
 * hỏi. Chữ thẻ/khối liên hệ là bộ RIÊNG của app (`support.app.*`) theo Figma; web giữ bộ cũ.
 *
 * Màn này KHÔNG tự dựng form gửi ticket - kênh hỗ trợ thật (`support_cases`, ADR 0028 release
 * gate 7) sống ở `/manage/support/cases`; nút ở đây DẪN sang màn đó.
 */
export function SupportCenterScreen({
  shell = 'manage',
}: {
  /**
   * `stacked` = TRANG CON (`/manage/help`, mở từ dải 'gian hàng bị khoá/hết hạn'): thanh trên có
   * nút lui về đúng màn vừa bấm thay cho `ManageHeader` của mục menu.
   */
  shell?: 'manage' | 'stacked';
} = {}) {
  const t = useTranslations('ManageCommon');
  const router = useRouter();
  const { has } = usePermissions();
  const featureStates = useFeatureStates();
  const navigateOnce = useNavigateOnce();

  const links = useMemo(
    () =>
      QUICK_START.filter(
        (item) =>
          has(item.permission) &&
          (item.feature === undefined ||
            isFeatureVisible(featureStates[item.feature] ?? FEATURE_STATE.ENABLED)),
      ),
    [has, featureStates],
  );

  const canSeeVehicles = has(PERMISSION.VEHICLE_VIEW);
  const faqItems = useMemo<FaqEntry[]>(
    () =>
      FAQ_KEYS.map((key) => ({
        key,
        question: t(`support.faq.${key}.q` as never) as string,
        answer: t(`support.faq.${key}.a` as never) as string,
        // "Xem trạng thái duyệt xe" chỉ điều hướng - chỉ hiện khi người dùng xem được danh sách xe.
        ...(key === 'publish' && canSeeVehicles
          ? {
              link: {
                label: t('support.app.faq.publishLink'),
                onPress: () => navigateOnce(ROUTES.manage.vehicles()),
              },
            }
          : {}),
      })),
    [t, canSeeVehicles, navigateOnce],
  );

  return (
    <>
      {/* Figma "Header MB": ← + tiêu đề. Mục menu lui về Tổng quan; trang con lui về đúng màn vừa bấm. */}
      <ManagePageHeader
        title={t('support.title')}
        onBack={() =>
          goBackOr(router, shell === 'stacked' ? ROUTES.manage.support() : ROUTES.manage.home())
        }
      />

      <Screen edges={['left', 'right', 'bottom']}>
        {links.length > 0 ? (
          <XStack flexWrap="wrap" gap={TILE_GAP}>
            {links.map((item) => (
              <QuickStartTile key={item.key} item={item} onPress={() => navigateOnce(item.href)} />
            ))}
          </XStack>
        ) : null}

        <YStack gap={space.sm}>
          <SectionTitle>{t('support.faq.title')}</SectionTitle>
          <FaqList items={faqItems} />
        </YStack>

        <LegalBlock />

        <ContactBlock
          canOpenCases={has(PERMISSION.SUPPORT_VIEW)}
          onOpenCases={() => navigateOnce(ROUTES.manage.supportCases())}
        />
      </Screen>
    </>
  );
}

/** Khoảng giữa hai thẻ lưới (Figma `num/12`). */
const TILE_GAP = 12;

function SectionTitle({ children }: { children: string }) {
  const colors = useColors();
  return (
    <Text
      col={colors.text}
      fos={typeScale.title.fontSize}
      lh={typeScale.title.lineHeight}
      fow={fontWeight.semibold}
    >
      {children}
    </Text>
  );
}

/** Một thẻ bắt đầu nhanh (Figma `24232:117515`): ô icon 40 · tiêu đề 14/20 · mô tả 12/18 · link vàng. */
function QuickStartTile({ item, onPress }: { item: QuickStartLink; onPress: () => void }) {
  const colors = useColors();
  const skin = useTileSkin()[item.tone];
  const dark = useAppScheme().scheme === 'dark';
  const tq = useTranslations('ManageCommon.support.app.quickStart');
  const label = tq(`${item.key}.title` as never) as string;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="link"
      accessibilityLabel={label}
      style={({ pressed }) => [styles.tile, pressed ? styles.pressed : null]}
    >
      <YStack
        f={1}
        bg={colors.surface}
        borderWidth={1}
        borderColor={colors.border}
        br={radius.card}
        p={TILE_PAD}
        gap={space.sm}
        overflow="hidden"
      >
        {dark ? null : (
          <LinearGradient
            colors={[skin.glow, 'rgba(255, 255, 255, 0.2)']}
            locations={[0, 0.56]}
            start={GLOW_START}
            end={GLOW_END}
            style={StyleSheet.absoluteFill}
            pointerEvents="none"
          />
        )}
        <XStack>
          <YStack bg={skin.tile} br={radius.thumb} p={space.sm}>
            <LineIcon name={item.icon} color={skin.icon} size={24} />
          </YStack>
        </XStack>
        <YStack f={1} gap={2}>
          <Text
            col={colors.text}
            fos={typeScale.body.fontSize}
            lh={typeScale.body.lineHeight}
            fow={fontWeight.semibold}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.85}
          >
            {label}
          </Text>
          <Text col={colors.placeholder} fos={typeScale.label.fontSize} lh={typeScale.label.lineHeight}>
            {tq(`${item.key}.body` as never)}
          </Text>
        </YStack>
        {/* Cả thẻ là đích chạm; link chỉ là chữ chỉ đường nên không nhận chạm riêng. */}
        <XStack pointerEvents="none">
          <LinkArrow label={tq(`${item.key}.cta` as never) as string} onPress={onPress} />
        </XStack>
      </YStack>
    </Pressable>
  );
}

/** Đệm trong thẻ lưới (Figma `num/12`). */
const TILE_PAD = 12;
/** Gradient 230° của Figma: từ góc trên-phải xuống góc dưới-trái. */
const GLOW_START = { x: 1, y: 0 } as const;
const GLOW_END = { x: 0, y: 1 } as const;

/**
 * Văn bản pháp lý (Figma "Nhóm thông tin") - cổng quản lý KHÔNG có chân trang marketplace, nên
 * thiếu khối này thì chủ gian hàng không có đường nào tới quy chế sàn. Liên kết mở màn WebView đọc
 * thẳng bản web (bản CÓ HIỆU LỰC). Tên văn bản lấy từ `Legal.docs.<doc>.title`, cùng nguồn web.
 */
function LegalBlock() {
  const colors = useColors();
  const t = useTranslations('ManageCommon');
  const tLegal = useTranslations('Legal');
  const openDoc = useOpenLegalDoc();
  return (
    <YStack
      bg={colors.surface}
      borderWidth={1}
      borderColor={colors.border}
      br={radius.card}
      p={LEGAL_PAD}
      gap={LEGAL_PAD}
    >
      <YStack>
        <SectionTitle>{t('support.legal.title')}</SectionTitle>
        <Text col={colors.placeholder} fos={typeScale.label.fontSize} lh={typeScale.label.lineHeight}>
          {t('support.app.legalBody')}
        </Text>
      </YStack>
      <YStack gap={space.sm}>
        {LEGAL_DOC_VALUES.map((doc) => (
          <Pressable
            key={doc}
            onPress={() => openDoc(doc)}
            accessibilityRole="link"
            accessibilityLabel={tLegal(`docs.${doc}.title` as never)}
            style={({ pressed }) => (pressed ? styles.pressed : null)}
          >
            <XStack
              ai="center"
              gap={10}
              bg={colors.background}
              br={radius.control}
              px={space.sm}
              py={LEGAL_ROW_PY}
            >
              <Text
                f={1}
                col={colors.text}
                fos={typeScale.body.fontSize}
                lh={LEGAL_ROW_LH}
                fow={fontWeight.medium}
              >
                {tLegal(`docs.${doc}.title` as never)}
              </Text>
              <LineIcon name="chevron-right" color={colors.placeholder} />
            </XStack>
          </Pressable>
        ))}
      </YStack>
    </YStack>
  );
}

/** Figma: khối đệm 20, khoảng 20; hàng văn bản đệm dọc 12, chữ 14/22. */
const LEGAL_PAD = 20;
const LEGAL_ROW_PY = 12;
const LEGAL_ROW_LH = 22;

/**
 * Khối liên hệ (Figma "Job Overview Section"): nền ảnh mờ vàng, viền vàng, nút vàng "Mở yêu cầu hỗ
 * trợ" + dòng hotline. Câu dẫn + nút về yêu cầu hỗ trợ chỉ hiện khi có `support.view` (như web);
 * hotline do admin đặt (`GET /app-config/partner`), chưa đặt thì ẩn dòng.
 */
function ContactBlock({
  canOpenCases,
  onOpenCases,
}: {
  canOpenCases: boolean;
  onOpenCases: () => void;
}) {
  const colors = useColors();
  const t = useTranslations('ManageCommon.support');
  const dark = useAppScheme().scheme === 'dark';
  const { supportHotline } = usePartnerAppConfig();
  const hotline = supportHotline?.trim() || null;

  return (
    <YStack
      borderWidth={1}
      borderColor={colors.brandBorderStrong}
      br={radius.card}
      p={space.md}
      gap={CONTACT_GAP}
      overflow="hidden"
      bg={dark ? colors.brandLow : colors.surface}
      style={elevation.card}
    >
      {dark ? null : (
        <Image
          source={CONTACT_BG}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          pointerEvents="none"
        />
      )}
      <YStack gap={space.sm}>
        <SectionTitle>{t('app.contact.title')}</SectionTitle>
        <Text col={colors.textBody} fos={typeScale.body.fontSize} lh={typeScale.body.lineHeight}>
          {t('contact.body')}
        </Text>
        {canOpenCases ? (
          <Text col={colors.textBody} fos={typeScale.body.fontSize} lh={typeScale.body.lineHeight}>
            {t('app.contact.casesBody')}
          </Text>
        ) : null}
      </YStack>

      {canOpenCases || hotline ? (
        <YStack gap={space.sm} ai="flex-start" als="stretch">
          {canOpenCases ? (
            <Button label={t('contact.casesCta')} onPress={onOpenCases} block={false} shape="square" />
          ) : null}
          {hotline ? (
            <Pressable
              onPress={() => void Linking.openURL(telHref(hotline))}
              accessibilityRole="link"
              accessibilityLabel={t('app.contact.callHotline', { phone: hotline })}
              hitSlop={HOTLINE_SLOP}
              style={({ pressed }) => [styles.hotline, pressed ? styles.pressed : null]}
            >
              <Text ta="center" col={colors.text} fos={typeScale.body.fontSize} lh={typeScale.body.lineHeight}>
                {t('app.contact.hotline')}
                <Text
                  col={colors.text}
                  fos={typeScale.body.fontSize}
                  lh={typeScale.body.lineHeight}
                  fow={fontWeight.semibold}
                  fontFamily={FONT_FAMILY.semibold}
                >
                  {hotline}
                </Text>
              </Text>
            </Pressable>
          ) : null}
        </YStack>
      ) : null}
    </YStack>
  );
}

const CONTACT_GAP = 12;
const HOTLINE_SLOP = { top: 12, bottom: 12, left: 8, right: 8 } as const;

const styles = StyleSheet.create({
  /** Hai thẻ một hàng: mỗi thẻ ~nửa khung trừ khoảng 12, giãn cao bằng nhau trong hàng. */
  tile: { flexBasis: '46%', flexGrow: 1, minWidth: 150 },
  pressed: { opacity: 0.75 },
  hotline: { alignSelf: 'stretch' },
});
