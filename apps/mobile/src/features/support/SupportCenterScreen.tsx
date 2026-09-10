import { Ionicons } from '@expo/vector-icons';
import { useMemo } from 'react';
import type { Href } from 'expo-router';
import { Pressable } from 'react-native';
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
import { Screen } from '@/components/layout/Screen';
import { BlockTitle } from '@/components/ui/BlockTitle';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import type { IconName } from '@/components/ui/Chip';
import { DetailChevron } from '@/components/ui/DetailArrow';
import { IconDisc } from '@/components/ui/IconDisc';
import { MenuOptionList } from '@/components/ui/MenuOption';
import { useFeatureStates } from '@/features/auth/hooks/use-feature';
import { usePermissions } from '@/features/auth/hooks/use-permissions';
import { LegalDocLinks } from '@/features/legal/components/LegalDocLinks';
import { ManageHeader } from '@/features/shell/ManageHeader';
import { ManagePageTitle } from '@/features/shell/ManagePageTitle';
import { useComingSoon } from '@/hooks/use-coming-soon';
import { useNavigateOnce } from '@/hooks/use-navigate-once';
import { ROUTES } from '@/navigation/routes';
import { colors, fontSize, fontWeight, sizing, space } from '@/theme/tokens';
import { FaqList } from './components/FaqList';

/** Khoá message trong `ManageCommon.support.quickStart`. */
type QuickStartKey = 'vehicles' | 'policies' | 'requests' | 'calendar' | 'finance' | 'members';

interface QuickStartLink {
  readonly key: QuickStartKey;
  readonly href: Href;
  readonly permission: Permission;
  /**
   * Cờ NĂNG LỰC THEO GÓI (ADR 0027) — trục ĐỘC LẬP với `permission`, kiểm nối tiếp.
   *
   * Web chỉ lọc theo quyền ở màn này, và đó là một lỗ: gian hàng chưa mua gói có Tài chính thì
   * mục Sổ Thu-Chi biến mất khỏi menu, nhưng thẻ hướng dẫn vẫn mời họ bấm vào — đúng cái "dẫn
   * tới một màn hình 403" mà chính docblock bên web nói phải tránh. Ở đây kiểm cùng luật với
   * `ManageDrawer`, nên hướng dẫn không bao giờ trỏ tới thứ mà menu đang giấu.
   */
  readonly feature?: PlanFeature;
  readonly icon: IconName;
}

/**
 * Sáu việc đầu tiên của một gian hàng mới, theo đúng thứ tự người ta phải làm chúng.
 *
 * Mỗi thẻ trỏ tới một màn CÓ THẬT trong app và mang quyền của chính màn đó: hướng dẫn dẫn tới
 * một màn hình 403 còn tệ hơn là không hướng dẫn gì.
 *
 * Biểu tượng lấy theo ĐÍCH ĐẾN — cùng glyph mà mục đó đeo trong sidebar (`manage-nav.ts`) — chứ
 * không chép bộ icon AntD của web. Người dùng bấm thẻ này rồi sẽ tìm lại màn đó trong menu; hai
 * hình khác nhau cho cùng một màn là bắt họ học hai lần.
 */
const QUICK_START: readonly QuickStartLink[] = [
  {
    key: 'vehicles',
    href: ROUTES.manage.vehicleNew(),
    permission: PERMISSION.VEHICLE_CREATE,
    icon: 'car-outline',
  },
  {
    key: 'policies',
    href: ROUTES.manage.shopPolicies(),
    permission: PERMISSION.TENANT_VIEW,
    icon: 'shield-checkmark-outline',
  },
  {
    key: 'requests',
    href: ROUTES.manage.requests(),
    permission: PERMISSION.BOOKING_REQUEST_VIEW,
    icon: 'mail-unread-outline',
  },
  {
    key: 'calendar',
    href: ROUTES.manage.calendar(),
    permission: PERMISSION.CALENDAR_VIEW,
    icon: 'calendar-outline',
  },
  {
    key: 'finance',
    href: ROUTES.manage.receipts(),
    permission: PERMISSION.FINANCE_VIEW,
    feature: PLAN_FEATURE.FINANCE,
    icon: 'swap-horizontal-outline',
  },
  {
    key: 'members',
    href: ROUTES.manage.members(),
    permission: PERMISSION.MEMBER_VIEW,
    feature: PLAN_FEATURE.MEMBERS,
    icon: 'person-add-outline',
  },
];

/** Sáu câu hỏi hay gặp nhất — chính là những chỗ mô hình nghiệp vụ khác với trực giác. */
const FAQ_KEYS = [
  'publish',
  'requestVsBooking',
  'conflict',
  'longTerm',
  'maintenance',
  'missingMenu',
] as const;

/**
 * Trung tâm hỗ trợ của cổng quản lý (SYS-05) — bản native của `SupportCenter` bên web: cùng bốn
 * khối, cùng thứ tự, cùng bó message (`ManageCommon.support.*`), nên hai client không nói khác
 * nhau một chữ nào.
 *
 * Đây là điểm đến của khối HỖ TRỢ ở cuối sidebar: chỗ trả lời "bắt đầu từ đâu" và những câu hỏi
 * mà cấu trúc menu không tự nói ra được (yêu cầu đặt xe khác đơn thuê chỗ nào, vì sao xe chưa
 * lên marketplace, bảo dưỡng nằm ở đâu).
 *
 * Màn này KHÔNG tự dựng form gửi ticket — kênh hỗ trợ thật (`support_cases`, ADR 0028 release
 * gate 7) sống ở `/manage/support/cases`, nơi mỗi yêu cầu có mã, dòng thời gian và người phụ
 * trách. App chưa dựng màn đó nên nút ở đây báo "đang phát triển" theo đúng quy ước `comingSoon`:
 * hai chỗ cùng nhận yêu cầu là hai hàng đợi, và cái thứ hai sẽ là cái không ai trực.
 */
export function SupportCenterScreen() {
  const t = useTranslations('ManageCommon');
  const { has } = usePermissions();
  const featureStates = useFeatureStates();
  const navigateOnce = useNavigateOnce();
  const comingSoon = useComingSoon();

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

  const faqItems = useMemo(
    () =>
      FAQ_KEYS.map((key) => ({
        key,
        question: t(`support.faq.${key}.q` as never) as string,
        answer: t(`support.faq.${key}.a` as never) as string,
      })),
    [t],
  );

  return (
    <>
      <ManageHeader />
      <ManagePageTitle title={t('support.title')} subtitle={t('support.subtitle')} />

      <Screen edges={['left', 'right', 'bottom']}>
        {links.length > 0 ? (
          <Card>
            <BlockTitle>{t('support.quickStart.title')}</BlockTitle>
            <MenuOptionList>
              {links.map((item) => (
                <Pressable
                  key={item.key}
                  onPress={() => navigateOnce(item.href)}
                  accessibilityRole="link"
                  accessibilityLabel={t(`support.quickStart.${item.key}.title` as never)}
                  style={({ pressed }) =>
                    pressed ? { backgroundColor: colors.surfaceMuted } : null
                  }
                >
                  <XStack ai="center" gap={space.sm} minHeight={sizing.touchTarget} py={space.xs}>
                    <IconDisc
                      icon={item.icon}
                      tone={colors.primaryActive}
                      surface={colors.primaryLight}
                    />
                    <YStack f={1} gap={2}>
                      <Text col={colors.text} fos={fontSize.body} fow={fontWeight.medium}>
                        {t(`support.quickStart.${item.key}.title` as never)}
                      </Text>
                      <Text col={colors.textMuted} fos={fontSize.bodySm}>
                        {t(`support.quickStart.${item.key}.body` as never)}
                      </Text>
                    </YStack>
                    <DetailChevron />
                  </XStack>
                </Pressable>
              ))}
            </MenuOptionList>
          </Card>
        ) : null}

        <Card>
          <BlockTitle>{t('support.faq.title')}</BlockTitle>
          <FaqList items={faqItems} />
        </Card>

        {/*
          Cổng quản lý KHÔNG có chân trang marketplace, nên nếu thiếu khối này thì một chủ gian
          hàng đang đăng nhập không có đường nào tới quy chế sàn — thứ ràng buộc chính họ. Liên
          kết mở màn WebView đọc thẳng bản web: đó là bản CÓ HIỆU LỰC và sửa được mà không phải
          chờ một bản app mới qua vòng duyệt store (xem `LegalDocScreen`).
        */}
        <Card>
          <BlockTitle>{t('support.legal.title')}</BlockTitle>
          <YStack gap={space.sm}>
            <Text col={colors.textMuted} fos={fontSize.bodySm}>
              {t('support.legal.body')}
            </Text>
            <LegalDocLinks />
          </YStack>
        </Card>

        <Card tone="accent">
          <YStack gap={space.sm}>
            <XStack ai="center" gap={space.sm}>
              <Ionicons
                name="help-buoy-outline"
                size={fontSize.h4}
                color={colors.primaryActive}
                accessibilityElementsHidden
                importantForAccessibility="no"
              />
              <Text flexShrink={1} col={colors.text} fos={fontSize.h4} fow={fontWeight.semibold}>
                {t('support.contact.title')}
              </Text>
            </XStack>
            <Text col={colors.textMuted} fos={fontSize.bodySm}>
              {t('support.contact.body')}
            </Text>

            {has(PERMISSION.SUPPORT_VIEW) ? (
              <>
                <Text col={colors.textMuted} fos={fontSize.bodySm}>
                  {t('support.contact.casesBody')}
                </Text>
                <Button
                  label={t('support.contact.casesCta')}
                  icon="chatbox-ellipses-outline"
                  onPress={comingSoon}
                />
              </>
            ) : null}
          </YStack>
        </Card>
      </Screen>
    </>
  );
}
