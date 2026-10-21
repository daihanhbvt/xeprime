import { Ionicons } from '@expo/vector-icons';
import { useRef, useState } from 'react';
import {
  Linking,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  type ImageSourcePropType,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { isRegistrationTrack } from '@xeprime/types';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { OWNER_PERSONAL_CAR_RATIO, PARTNER_GUIDE_SHOT_RATIO, images } from '@/assets';
import type { IconName } from '@/components/ui/Chip';
import { AppHeader } from '@/components/layout/AppHeader';
import { Button } from '@/components/ui/Button';
import { InlineAction } from '@/components/ui/InlineAction';
import { fireAndForget } from '@/lib/fire-and-forget';
import { goBackOr } from '@/navigation/go-back-or';
import { PARTNER_HANDOFF_INTENT, ROUTES } from '@/navigation/routes';
import { layout } from '@/theme/layout';
import { useColors } from '@/theme/ThemeProvider';
import { fontSize, fontWeight, radius, space } from '@/theme/tokens';
import {
  PARTNER_APP_TARGET,
  PARTNER_AUTH_ENTRY,
  type PartnerAuthEntry,
  openPartnerApp,
  partnerStoreUrl,
  type PartnerAppTarget,
} from './open-partner-app';

/** Đĩa minh hoạ của mỗi trang hướng dẫn. */
const HERO_DISC = 132;
const HERO_ICON = 60;
/** Chấm trang: chấm hiện tại kéo dài thành viên thuốc. */
const DOT = 8;
const DOT_ACTIVE = 24;

/** Khung điện thoại: bề ngang theo màn, trần để máy tính bảng không phóng ảnh chụp quá cỡ. */
const PHONE_WIDTH_RATIO = 0.68;
const PHONE_MAX_WIDTH = 320;
/** Sân khấu ảnh chiếm phần này của chiều cao trang — phần còn lại cho chữ, không để trống. */
const STAGE_HEIGHT_RATIO = 0.64;
/** Hai vòng tròn trang trí ở nền sân khấu. */
const ORB_LARGE = 260;
const ORB_SMALL = 140;
const PHONE_BEZEL = 8;
const PHONE_RADIUS = 36;

/**
 * Bốn trang: trang mở đầu là minh hoạ thương hiệu, ba trang sau là ẢNH CHỤP THẬT của app Partner
 * ở đúng bước đó — người dùng thấy trước màn họ sắp gặp, như onboarding của các app lớn.
 */
const SLIDES: readonly {
  key: 'intro' | 'account' | 'choose' | 'publish';
  shot: ImageSourcePropType | null;
}[] = [
  { key: 'intro', shot: null },
  { key: 'account', shot: images.partnerGuideAccount },
  { key: 'choose', shot: images.partnerGuideChoose },
  { key: 'publish', shot: images.partnerGuidePublish },
];

/**
 * Ba nhãn lợi ích của trang mở đầu — dùng LẠI câu của landing Đăng xe cho thuê (đã duyệt, có ở web),
 * không viết thêm lời hứa mới.
 */
const INTRO_PERKS = [
  { key: 'noFee', icon: 'checkmark-circle', label: 'personal.features.noFee' },
  { key: 'zeroFee', icon: 'ribbon-outline', label: 'shop.offerTitle' },
  { key: 'upgrade', icon: 'sync-outline', label: 'upgrade.title' },
] as const satisfies readonly { key: string; icon: IconName; label: string }[];

const styles = StyleSheet.create({
  pager: { flex: 1 },
  fill: { width: '100%', height: '100%' },
  introArt: { width: '100%' },
  orbLarge: { position: 'absolute', top: -ORB_LARGE / 3, right: -ORB_LARGE / 3, opacity: 0.35 },
  orbSmall: { position: 'absolute', bottom: -ORB_SMALL / 3, left: -ORB_SMALL / 3, opacity: 0.25 },
});

/** Kết quả lần mở app Partner gần nhất — quyết định màn có chuyển sang trạng thái "chưa cài". */
type OpenState = 'idle' | 'notInstalled';

/**
 * Màn HANDOFF sang app XePrime Partner — đích của mọi `ROUTES.manage.*` và mọi CTA chủ xe ở app
 * Customer. Từ ADR 0053 tài khoản khách không có gian hàng: đăng xe, mở gian hàng và quản lý đều
 * diễn ra ở app Partner với một tài khoản ĐỐI TÁC riêng.
 *
 * Bố cục (06/10/2026): HƯỚNG DẪN TOÀN MÀN HÌNH — bốn trang lật ngang kể hành trình trở thành chủ
 * xe, trang cuối mới là hai lối Đăng ký / Đăng nhập. Mở app bằng scheme; không mở được (máy chưa
 * cài) thì màn chuyển sang trạng thái riêng: có link cửa hàng thì mời tải, chưa có thì nói thẳng
 * app chưa lên cửa hàng — KHÔNG đẩy sang trang web không cài được gì.
 *
 * `intent=register` nhắm deep link vào luồng đăng ký; lời mời mở đúng lời mời; còn lại mở gốc app.
 * Không điều hướng nội bộ tới route Partner nào — app này không đăng ký chúng.
 */
export function PartnerHandoffScreen() {
  const colors = useColors();
  const t = useTranslations('MobileShell.partner');
  const tLanding = useTranslations('ListYourVehicle.landing');
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const pager = useRef<ScrollView>(null);
  const [pagerHeight, setPagerHeight] = useState(0);
  /*
   * Bề ngang MỘT TRANG đo từ chính khung lật, không lấy `useWindowDimensions`.
   *
   * `pagingEnabled` chốt vị trí theo bề ngang KHUNG NHÌN của ScrollView; nếu trang được dựng theo
   * bề ngang MÀN HÌNH mà hai số đó lệch nhau (lề an toàn ngang ở máy có tai thỏ, cửa sổ chia đôi,
   * xoay ngang) thì mỗi trang lệch dồn thêm một ít — trang thứ ba đã bị cắt mất chữ ở mép trái và
   * lòi sang trang kế. Đo đúng cái thước mà ScrollView dùng thì sai số đó không tồn tại.
   */
  const [pagerWidth, setPagerWidth] = useState(0);
  const stageHeight = Math.round(pagerHeight * STAGE_HEIGHT_RATIO);
  /*
   * Điện thoại hiện TRỌN trong sân khấu: bề ngang suy ngược từ chiều cao còn lại (trừ lề trên/dưới
   * và viền máy) theo tỉ lệ thật của ảnh chụp, rồi chặn theo bề ngang màn — máy thấp hay cao đều
   * không bị cắt mất phần dưới.
   */
  /** Chưa đo xong thì tạm dùng bề ngang màn — đúng ở phần lớn máy, và chỉ sống một khung hình. */
  const pageWidth = pagerWidth || width;
  const phoneWidth = Math.max(
    0,
    Math.min(
      pageWidth * PHONE_WIDTH_RATIO,
      PHONE_MAX_WIDTH,
      (stageHeight - space.lg * 2 - PHONE_BEZEL * 2) * PARTNER_GUIDE_SHOT_RATIO + PHONE_BEZEL * 2,
    ),
  );
  const [page, setPage] = useState(0);
  const [openState, setOpenState] = useState<OpenState>('idle');

  const { intent, token, track } = useLocalSearchParams<{
    intent?: string;
    token?: string;
    track?: string;
  }>();
  const registrationTrack = isRegistrationTrack(track) ? track : undefined;
  const target: PartnerAppTarget =
    intent === PARTNER_HANDOFF_INTENT.REGISTER
      ? PARTNER_APP_TARGET.REGISTER
      : intent === PARTNER_HANDOFF_INTENT.INVITE && token
        ? PARTNER_APP_TARGET.INVITE
        : PARTNER_APP_TARGET.HOME;
  const isRegister = target === PARTNER_APP_TARGET.REGISTER;
  // Hướng dẫn đăng ký chỉ có nghĩa ở lối ĐĂNG KÝ; lời mời và "mở app" đi thẳng trang giới thiệu.
  const slides = isRegister ? SLIDES : SLIDES.slice(0, 1);
  const last = slides.length - 1;
  const onLast = page >= last;

  const leave = () => goBackOr(router, ROUTES.account.home());

  const open = (entry: PartnerAuthEntry = PARTNER_AUTH_ENTRY.REGISTER) =>
    fireAndForget(async () => {
      const opened = await openPartnerApp(target, {
        entry,
        ...(token ? { inviteToken: token } : {}),
        ...(registrationTrack ? { track: registrationTrack } : {}),
      });
      if (!opened) setOpenState('notInstalled');
    }, 'PartnerHandoffScreen.open');

  const goTo = (index: number) => {
    const next = Math.max(0, Math.min(last, index));
    pager.current?.scrollTo({ x: next * pageWidth, animated: true });
    setPage(next);
  };

  /*
   * Chỉ tin vị trí cuộn khi NGƯỜI DÙNG vuốt: trên Android, `scrollTo` do nút Tiếp/Bỏ qua gọi cũng
   * phát `onMomentumScrollEnd` với vị trí lưng chừng, ghi đè trang vừa đặt thành trang sai.
   */
  const dragging = useRef(false);
  const onScrollEnd = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (!dragging.current) return;
    dragging.current = false;
    setPage(Math.round(event.nativeEvent.contentOffset.x / pageWidth));
  };

  if (openState === 'notInstalled') {
    return <NotInstalled onRetry={() => setOpenState('idle')} onLater={leave} />;
  }

  return (
    <YStack f={1} bg={colors.background} pb={insets.bottom + space.md}>
      {/* Thanh chuẩn của app: lui về, tên hành trình, và "Bỏ qua" tới thẳng trang cuối. */}
      <AppHeader
        onBack={leave}
        title={t('headerTitle')}
        right={!onLast ? <InlineAction label={t('skip')} onPress={() => goTo(last)} /> : undefined}
      />

      <ScrollView
        ref={pager}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onScrollBeginDrag={() => {
          dragging.current = true;
        }}
        onMomentumScrollEnd={onScrollEnd}
        // Chiều cao TRANG đo từ chính khung lật: ScrollView ngang không ép con cao bằng nó, và nếu
        // để trang tự giãn thì đoạn mô tả tràn xuống đè lên hàng chấm.
        onLayout={(event) => {
          setPagerHeight(event.nativeEvent.layout.height);
          setPagerWidth(event.nativeEvent.layout.width);
        }}
        style={styles.pager}
      >
        {slides.map((slide, index) => (
          <YStack key={slide.key} w={pageWidth} h={pagerHeight} pt={space.sm}>
            {/*
              Sân khấu: nền màu thương hiệu + hai vòng tròn trang trí. Trang có ảnh chụp thì điện
              thoại hiện trọn khung, căn giữa — như ảnh giới thiệu trên cửa hàng ứng
              dụng; trang mở đầu là minh hoạ xe kèm ba nhãn lợi ích nổi.
            */}
            <YStack
              h={stageHeight}
              mx={layout.screenX}
              br={PHONE_RADIUS}
              ov="hidden"
              ai="center"
              jc="center"
              bg={colors.primaryLight}
            >
              <YStack
                w={ORB_LARGE}
                h={ORB_LARGE}
                br={ORB_LARGE / 2}
                bg={colors.primary}
                style={styles.orbLarge}
              />
              <YStack
                w={ORB_SMALL}
                h={ORB_SMALL}
                br={ORB_SMALL / 2}
                bg={colors.primary}
                style={styles.orbSmall}
              />
              {slide.shot ? (
                <PhoneFrame source={slide.shot} width={phoneWidth} />
              ) : (
                <YStack w="100%" px={space.lg} gap={space.md} ai="center">
                  <Image
                    source={images.ownerPersonalCar}
                    style={[styles.introArt, { aspectRatio: OWNER_PERSONAL_CAR_RATIO }]}
                    contentFit="contain"
                    accessible={false}
                  />
                  <XStack flexWrap="wrap" jc="center" gap={space.xs}>
                    {INTRO_PERKS.map((perk) => (
                      <XStack
                        key={perk.key}
                        ai="center"
                        gap={6}
                        px={space.sm}
                        py={6}
                        br={radius.pill}
                        bg={colors.surface}
                        bw={1}
                        bc={colors.border}
                      >
                        <Ionicons name={perk.icon} size={16} color={colors.primaryActive} />
                        <Text col={colors.text} fos={fontSize.label} fow={fontWeight.semibold}>
                          {tLanding(perk.label)}
                        </Text>
                      </XStack>
                    ))}
                  </XStack>
                </YStack>
              )}
            </YStack>

            <YStack
              f={1}
              jc="flex-start"
              pt={space.xl}
              px={layout.screenX}
              gap={space.sm}
              ai="center"
            >
              {isRegister && index > 0 ? (
                <XStack px={space.sm} py={2} br={radius.pill} bg={colors.primaryLight}>
                  <Text col={colors.primaryActive} fos={fontSize.label} fow={fontWeight.semibold}>
                    {t('stepOf', { current: index, total: last })}
                  </Text>
                </XStack>
              ) : null}
              <Text col={colors.text} fos={fontSize.h2} fow={fontWeight.bold} ta="center">
                {t(`slides.${slide.key}.title`)}
              </Text>
              <Text col={colors.textMuted} fos={fontSize.bodySm} ta="center" maxWidth={420}>
                {t(`slides.${slide.key}.body`)}
              </Text>
            </YStack>
          </YStack>
        ))}
      </ScrollView>

      <YStack px={layout.screenX} gap={space.md}>
        {slides.length > 1 ? (
          <XStack jc="center" gap={6} accessibilityRole="progressbar">
            {slides.map((slide, index) => (
              <YStack
                key={slide.key}
                w={index === page ? DOT_ACTIVE : DOT}
                h={DOT}
                br={radius.pill}
                bg={index === page ? colors.primary : colors.border}
              />
            ))}
          </XStack>
        ) : null}

        {onLast ? (
          <YStack gap={space.xs}>
            {/*
              Tài khoản ĐỐI TÁC tách với tài khoản khách (ADR 0053): mở thẳng màn ĐĂNG KÝ của app
              Partner, kèm một lối ĐĂNG NHẬP. Cả hai mang theo bước tiếp theo của tuyến đã chọn.
            */}
            {isRegister ? (
              <>
                {/*
                  Chỉ mở màn ĐĂNG KÝ của app Partner — không gắn tuyến: tạo tài khoản xong, app
                  Partner tự đưa tài khoản chưa có gian hàng tới màn chọn cách cho thuê. Tuyến đã
                  chọn từ landing (`?track=`) vẫn được mang theo nếu có.
                */}
                <Button
                  label={t('openRegister')}
                  icon="person-add-outline"
                  onPress={() => open(PARTNER_AUTH_ENTRY.REGISTER)}
                />
                <XStack jc="center" ai="center" gap={space.xs} pt={space.xs}>
                  <Text col={colors.textMuted} fos={fontSize.bodySm}>
                    {t('haveAccount')}
                  </Text>
                  <InlineAction
                    label={t('loginLink')}
                    onPress={() => open(PARTNER_AUTH_ENTRY.LOGIN)}
                  />
                </XStack>
              </>
            ) : (
              <Button label={t('open')} icon="open-outline" onPress={() => open()} />
            )}
          </YStack>
        ) : (
          // Một nút duy nhất: lùi lại bằng vuốt ngang như mọi màn giới thiệu, hai nút chia đôi hàng chỉ
          // làm chữ bị cắt ở máy hẹp.
          <Button label={t('next')} icon="arrow-forward" onPress={() => goTo(page + 1)} />
        )}
      </YStack>
    </YStack>
  );
}

/**
 * Khung điện thoại bọc một ảnh chụp màn hình — viền tối, bo góc như máy thật. Kích thước do nơi
 * gọi tính sao cho cả máy nằm gọn trong sân khấu.
 */
function PhoneFrame({ source, width }: { source: ImageSourcePropType; width: number }) {
  const colors = useColors();
  const inner = width - PHONE_BEZEL * 2;
  return (
    <YStack w={width} p={PHONE_BEZEL} br={PHONE_RADIUS} bg={colors.text}>
      <YStack
        w={inner}
        h={inner / PARTNER_GUIDE_SHOT_RATIO}
        br={PHONE_RADIUS - PHONE_BEZEL}
        ov="hidden"
        bg={colors.surface}
      >
        <Image
          source={source}
          style={styles.fill}
          contentFit="cover"
          contentPosition="top"
          accessible={false}
        />
      </YStack>
    </YStack>
  );
}

/**
 * Không mở được app Partner (máy chưa cài). Có link cửa hàng thì mời tải; CHƯA lên cửa hàng thì
 * nói thẳng như vậy — hiện tại app chưa phát hành nên đây là nhánh người dùng thật sẽ gặp.
 */
function NotInstalled({ onRetry, onLater }: { onRetry: () => void; onLater: () => void }) {
  const colors = useColors();
  const t = useTranslations('MobileShell.partner');
  const insets = useSafeAreaInsets();
  const storeUrl = partnerStoreUrl();

  return (
    <YStack
      f={1}
      bg={colors.background}
      pt={insets.top + space.xl}
      pb={insets.bottom + space.md}
      px={layout.screenX}
    >
      <YStack f={1} ai="center" jc="center" gap={space.lg}>
        <YStack
          w={HERO_DISC}
          h={HERO_DISC}
          br={HERO_DISC / 2}
          ai="center"
          jc="center"
          bg={colors.primaryLight}
        >
          <Ionicons
            name={storeUrl ? 'download-outline' : 'time-outline'}
            size={HERO_ICON}
            color={colors.primaryActive}
          />
        </YStack>
        <YStack gap={space.sm} ai="center" maxWidth={420}>
          <Text col={colors.text} fos={fontSize.h3} fow={fontWeight.bold} ta="center">
            {storeUrl ? t('notInstalledTitle') : t('comingSoonTitle')}
          </Text>
          <Text col={colors.textMuted} fos={fontSize.body} ta="center">
            {storeUrl ? t('notInstalledBody') : t('comingSoonBody')}
          </Text>
        </YStack>
      </YStack>
      <YStack gap={space.xs}>
        {storeUrl ? (
          <Button
            label={t('storeCta')}
            icon="download-outline"
            onPress={() => fireAndForget(() => Linking.openURL(storeUrl), 'PartnerHandoff.store')}
          />
        ) : null}
        <Button label={t('retry')} variant="secondary" onPress={onRetry} />
        <Button label={t('later')} variant="ghost" onPress={onLater} />
      </YStack>
    </YStack>
  );
}
