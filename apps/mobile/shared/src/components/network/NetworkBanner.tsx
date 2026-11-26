import { Ionicons } from '@/components/icons/Ionicons';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslations } from 'use-intl';
import { useIsOnline } from '@/hooks/use-is-online';
import { subscribeOffline } from '@/lib/network';
import { makeStyles, useColors } from '@/theme/ThemeProvider';
import { fontSize, iconSize, radius, space } from '@/theme/tokens';
import { FONT_FAMILY } from '@/theme/fonts';
import { layout } from '@/theme/layout';

/** Hộp "Không có kết nối mạng" — đủ lâu để đọc hai dòng, rồi tự tắt. */
const OFFLINE_VISIBLE_MS = 3500;
/** "Đã kết nối lại" chỉ thoáng qua. */
const RECONNECTED_VISIBLE_MS = 2000;
/** Nhiều request cùng tạm dừng (một màn bắn 3 query) chỉ bật hộp MỘT lần trong nhịp này. */
const OFFLINE_NOTICE_COOLDOWN_MS = 4000;
const ANIM_MS = 180;

type Notice = 'offline' | 'reconnected';

/**
 * Hộp thông báo mạng nổi ở đầu màn — TỰ TẮT, không phải một dải nằm lì.
 *
 * Hiện khi: (1) vừa mất mạng; (2) đang offline mà khách thao tác thứ cần gọi API (lượt query/
 * mutation bị TanStack tạm dừng — `notifyOffline` ở `query-client.ts`). Không có (2), bấm "Tìm
 * kiếm" lúc mất mạng là không có gì xảy ra. Mạng về ⇒ thoáng "Đã kết nối lại".
 *
 * Nổi trên nội dung (`position: absolute`) dưới tai thỏ, chừa lề hai bên — không đè lên header
 * như một dải tràn viền, không đẩy layout. Chạm vào hộp để tắt sớm; phần ngoài hộp không nuốt chạm.
 * Mount MỘT lần ở layout gốc, ngoài `Stack`.
 *
 * Trợ năng: `accessibilityLiveRegion` (Android) + `announceForAccessibility` (iOS).
 */
export function NetworkBanner() {
  const online = useIsOnline();
  const t = useTranslations('MobileShell.network');
  const colors = useColors();
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const [notice, setNotice] = useState<Notice | null>(null);
  const opacity = useRef(new Animated.Value(0)).current;
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastOfflineShownAt = useRef(0);
  const wasOffline = useRef(!online);

  const hide = useCallback(() => {
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = null;
    Animated.timing(opacity, { toValue: 0, duration: ANIM_MS, useNativeDriver: true }).start(
      ({ finished }) => {
        if (finished) setNotice(null);
      },
    );
  }, [opacity]);

  const show = useCallback(
    (next: Notice) => {
      if (next === 'offline') {
        const now = Date.now();
        if (now - lastOfflineShownAt.current < OFFLINE_NOTICE_COOLDOWN_MS) return;
        lastOfflineShownAt.current = now;
      }
      if (hideTimer.current) clearTimeout(hideTimer.current);
      setNotice(next);
      AccessibilityInfo.announceForAccessibility(
        next === 'offline' ? t('errorTitle') : t('reconnected'),
      );
      Animated.timing(opacity, { toValue: 1, duration: ANIM_MS, useNativeDriver: true }).start();
      hideTimer.current = setTimeout(
        hide,
        next === 'offline' ? OFFLINE_VISIBLE_MS : RECONNECTED_VISIBLE_MS,
      );
    },
    [hide, opacity, t],
  );

  useEffect(() => {
    if (!online) {
      wasOffline.current = true;
      show('offline');
      return;
    }
    if (!wasOffline.current) return;
    wasOffline.current = false;
    // Mạng về thì lượt "offline" kế tiếp được hiện ngay, không chờ nhịp giãn của lần trước.
    lastOfflineShownAt.current = 0;
    show('reconnected');
  }, [online, show]);

  useEffect(() => subscribeOffline(() => show('offline')), [show]);

  useEffect(
    () => () => {
      if (hideTimer.current) clearTimeout(hideTimer.current);
    },
    [],
  );

  if (!notice) return null;

  const offline = notice === 'offline';
  const tone = offline ? colors.warningStrong : colors.success;
  return (
    <View pointerEvents="box-none" style={[styles.wrap, { top: insets.top + space.sm }]}>
      <Animated.View
        style={[
          styles.card,
          {
            opacity,
            transform: [
              { translateY: opacity.interpolate({ inputRange: [0, 1], outputRange: [-12, 0] }) },
            ],
          },
        ]}
      >
        <Pressable
          onPress={hide}
          accessibilityRole="alert"
          accessibilityLiveRegion="polite"
          style={styles.row}
        >
          <Ionicons
            name={offline ? 'cloud-offline-outline' : 'cloud-done-outline'}
            size={iconSize.lg}
            color={tone}
          />
          <View style={styles.texts}>
            <Text style={[styles.title, { color: colors.text }]}>
              {offline ? t('errorTitle') : t('reconnected')}
            </Text>
            {offline ? (
              <Text style={[styles.hint, { color: colors.textMuted }]}>{t('errorHint')}</Text>
            ) : null}
          </View>
        </Pressable>
      </Animated.View>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  wrap: {
    position: 'absolute',
    left: space.md,
    right: space.md,
    zIndex: 1000,
    elevation: 1000,
    alignItems: 'center',
  },
  card: {
    width: '100%',
    maxWidth: 480,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingVertical: space.sm,
    paddingHorizontal: layout.padX,
  },
  texts: { flex: 1, gap: 2 },
  // `Text` gốc RN không ăn font Tamagui: khai đúng mặt chữ (Android chọn file theo `fontFamily`, không theo `fontWeight`).
  title: { fontFamily: FONT_FAMILY.semibold, fontSize: fontSize.body },
  hint: { fontFamily: FONT_FAMILY.body, fontSize: fontSize.bodySm },
}));
