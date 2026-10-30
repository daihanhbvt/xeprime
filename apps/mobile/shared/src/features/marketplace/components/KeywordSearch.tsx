import { Ionicons } from '@expo/vector-icons';
import { useEffect, useRef, useState } from 'react';
import { Keyboard, Pressable } from 'react-native';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import {
  LIST_SEPARATOR,
  SEARCH_QUERY_MAX_LENGTH,
  highlightSearchMatch,
  searchTokens,
} from '@xeprime/domain';
import { Avatar } from '@/components/ui/Avatar';
import { SearchInput } from '@/components/ui/SearchInput';
import { VerifiedMark } from '@/components/ui/VerifiedMark';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { useColors } from '@/theme/ThemeProvider';
import { fontSize, fontWeight, iconSize, radius, sizing, space } from '@/theme/tokens';
import type { PublicShopSummary } from '../api';
import { useShopSuggestions } from '../hooks/use-shop-suggestions';

/** Nhịp gõ → bộ lọc: đủ dài để không bắn một truy vấn mỗi phím, đủ ngắn để kết quả chạy "theo tay". */
export const KEYWORD_APPLY_DELAY_MS = 400;
/** Gợi ý nhanh hơn lưới — nó rẻ (≤ 5 dòng) và là phản hồi đầu tiên khách nhìn thấy. */
export const KEYWORD_SUGGEST_DELAY_MS = 200;

/** Chuỗi gõ → giá trị áp dụng: cắt khoảng trắng hai đầu, cắt trần độ dài, rỗng ⇒ bỏ. */
export function toAppliedKeyword(raw: string): string | undefined {
  return raw.trim().slice(0, SEARCH_QUERY_MAX_LENGTH) || undefined;
}

/**
 * Ô TỪ KHOÁ của màn kết quả — bản native của `KeywordSearch` web (tên xe/hãng/model hoặc tên chủ
 * xe, gian hàng). Server gấp chuỗi nên gõ không dấu vẫn ra.
 *
 * - Gõ ⇒ áp sau `KEYWORD_APPLY_DELAY_MS`; phím "Tìm" áp ngay; xoá hết ⇒ bỏ từ khoá ngay.
 * - Đang focus và có từ khoá ⇒ gợi ý ≤ 5 chủ xe/gian hàng; chạm một dòng là MỞ gian hàng đó,
 *   không bao giờ biến tên đó thành từ khoá.
 */
export function KeywordSearch({
  value,
  onApply,
  onOpenShop,
  variant = 'boxed',
}: {
  /** Từ khoá ĐANG ÁP DỤNG. */
  value: string | undefined;
  /** `undefined` = bỏ từ khoá. */
  onApply: (q: string | undefined) => void;
  onOpenShop: (slug: string) => void;
  /** `bare` khi nằm trong khung tìm kiếm hai dòng của trang kết quả (Figma `20043:57771`). */
  variant?: 'boxed' | 'bare';
}) {
  const colors = useColors();
  const t = useTranslations('Marketplace.results.keyword');
  const appliedQ = value ?? '';
  const [text, setText] = useState(appliedQ);
  const [focused, setFocused] = useState(false);

  // Từ khoá đổi từ NGOÀI (xoá từ khoá ở trạng thái rỗng) ⇒ ô theo, trừ khi đang gõ.
  const [syncedQ, setSyncedQ] = useState(appliedQ);
  if (appliedQ !== syncedQ) {
    setSyncedQ(appliedQ);
    if (!focused) setText(appliedQ);
  }

  /** Giá trị gửi gần nhất — chống áp lại cùng một từ khoá (mỗi lần áp là một lượt nạp lại lưới). */
  const lastSentRef = useRef(value);
  useEffect(() => {
    lastSentRef.current = value;
  }, [value]);
  /** Đã chọn một gợi ý và đang rời màn — nhịp trì hoãn còn treo không được áp chữ dở. */
  const leavingRef = useRef(false);

  const applyIfChanged = (raw: string) => {
    if (leavingRef.current) return;
    const next = toAppliedKeyword(raw);
    if (next === lastSentRef.current) return;
    lastSentRef.current = next;
    onApply(next);
  };

  const debouncedText = useDebouncedValue(text, KEYWORD_APPLY_DELAY_MS);
  // Bản mới nhất của hàm áp — cập nhật trong effect (không ghi ref lúc render).
  const applyRef = useRef(applyIfChanged);
  useEffect(() => {
    applyRef.current = applyIfChanged;
  });
  useEffect(() => {
    applyRef.current(debouncedText);
  }, [debouncedText]);

  const tokens = searchTokens(text);
  const suggestKeyword = useDebouncedValue(text, KEYWORD_SUGGEST_DELAY_MS);
  const { data: suggestions } = useShopSuggestions(suggestKeyword, { enabled: focused });
  const hosts = focused && tokens.length > 0 ? (suggestions ?? []) : [];

  function handleChange(next: string) {
    setText(next);
    if (!next.trim()) applyIfChanged('');
  }

  return (
    <YStack gap={space.xs}>
      <SearchInput
        value={text}
        onChange={handleChange}
        label={t('ariaLabel')}
        placeholder={t('placeholder')}
        variant={variant}
        maxLength={SEARCH_QUERY_MAX_LENGTH}
        onSubmit={() => applyIfChanged(text)}
        onFocus={() => setFocused(true)}
        onBlur={() => {
          setFocused(false);
          applyIfChanged(text);
        }}
      />

      {hosts.length > 0 ? (
        <YStack
          bg={colors.surface}
          bw={1}
          bc={colors.border}
          br={radius.md}
          py={space.xs}
          accessibilityLabel={t('hostsGroup')}
        >
          <Text px={space.sm} py={space.xs} col={colors.textMuted} fos={fontSize.label}>
            {t('hostsGroup')}
          </Text>
          {hosts.map((host) => (
            <HostSuggestion
              key={host.slug}
              host={host}
              tokens={tokens}
              onPress={() => {
                leavingRef.current = true;
                // Rời màn thì thu bàn phím + bỏ focus — quay lại không còn thấy gợi ý cũ treo đó.
                // `leavingRef` đã bật nên lượt blur này không áp từ khoá đang gõ dở.
                Keyboard.dismiss();
                setFocused(false);
                onOpenShop(host.slug);
                // Quay lại màn này thì ô phải dùng được tiếp.
                setTimeout(() => {
                  leavingRef.current = false;
                }, KEYWORD_APPLY_DELAY_MS);
              }}
            />
          ))}
          {/* Như web: dòng cuối danh sách áp chữ đang gõ làm từ khoá cho lưới (= phím "Tìm"). */}
          <Pressable
            onPress={() => {
              applyIfChanged(text);
              Keyboard.dismiss();
              setFocused(false);
            }}
            accessibilityRole="button"
            accessibilityLabel={t('searchAll', { q: text.trim() })}
          >
            <XStack
              ai="center"
              gap={space.sm}
              px={space.sm}
              minHeight={sizing.touchTarget}
              py={space.xs}
              borderTopWidth={1}
              borderTopColor={colors.border}
            >
              <Ionicons name="search" size={iconSize.sm} color={colors.textMuted} />
              <Text f={1} numberOfLines={1} col={colors.text} fos={fontSize.body}>
                {t('searchAll', { q: text.trim() })}
              </Text>
              <Ionicons name="return-down-back" size={iconSize.sm} color={colors.textMuted} />
            </XStack>
          </Pressable>
        </YStack>
      ) : null}
    </YStack>
  );
}

/** Một dòng gợi ý: ảnh/chữ cái đầu · tên (tô phần khớp) + dấu xác thực · nhãn · số xe · tỉnh. */
function HostSuggestion({
  host,
  tokens,
  onPress,
}: {
  host: PublicShopSummary;
  tokens: string[];
  onPress: () => void;
}) {
  const colors = useColors();
  const t = useTranslations('Marketplace.results.keyword');
  const meta = [
    t(host.verified ? 'shop' : 'owner'),
    t('vehicleCount', { count: host.vehicleCount }),
    host.provinceName,
  ]
    .filter(Boolean)
    .join(LIST_SEPARATOR);

  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={host.name}>
      <XStack ai="center" gap={space.sm} px={space.sm} minHeight={sizing.touchTarget} py={space.xs}>
        <Avatar name={host.name} url={host.logoUrl} size={32} />
        <YStack f={1} gap={2}>
          <XStack ai="center" gap={space.xs}>
            <Text flexShrink={1} numberOfLines={1} col={colors.text} fos={fontSize.body}>
              {highlightSearchMatch(host.name, tokens).map((part, index) => (
                <Text
                  key={index}
                  fow={part.match ? fontWeight.bold : fontWeight.regular}
                  col={part.match ? colors.primaryActive : colors.text}
                >
                  {part.text}
                </Text>
              ))}
            </Text>
            {host.verified ? <VerifiedMark label={t('verified')} size={13} /> : null}
          </XStack>
          <Text numberOfLines={1} col={colors.textMuted} fos={fontSize.label}>
            {meta}
          </Text>
        </YStack>
        <Ionicons name="chevron-forward" size={iconSize.sm} color={colors.textMuted} />
      </XStack>
    </Pressable>
  );
}
