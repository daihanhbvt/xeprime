import { useEffect, useMemo, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { ActivityIndicator, StyleSheet } from 'react-native';
import { WebView } from 'react-native-webview';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import type { GeoPoint } from '@xeprime/domain';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Button } from '@/components/ui/Button';
import { Callout } from '@/components/ui/Callout';
import { useReverseGeocode } from '@/features/locations/hooks/use-places';
import { mapCenterNow, resolveMapCenter, type MapCenter } from '@/lib/map-center';
import {
  PINNED_ZOOM,
  UNPINNED_ZOOM,
  mapPickerHtml,
  parseMapMessage,
} from '@/lib/map-interactive';
import { resolveWebBaseUrl } from '@/lib/web-base-url';
import { elevation } from '@/theme/elevation';
import { colors, fieldFontSize, fontSize, iconSize, radius, space } from '@/theme/tokens';

/** Bản đồ chiếm gần trọn tấm trượt: một bản đồ nhỏ thì kéo tới đâu cũng phải kéo tiếp. */
const SHEET_RATIO = 0.92;

/**
 * Chờ bao lâu sau cú chạm cuối rồi mới hỏi "chỗ này là đâu".
 *
 * Mỗi lượt tra ngược là một request CÓ TÍNH TIỀN, còn người dùng thì hay chạm vài nhịp liên tiếp
 * để dò đúng số nhà. Không có nhịp chờ này thì một lần dò là năm bảy lượt gọi, và câu trả lời của
 * lượt trước còn có thể về sau lượt sau — dòng chữ dưới bản đồ khi đó chỉ một địa chỉ mà ghim
 * đang ở một chỗ khác.
 */
const LOOKUP_DEBOUNCE_MS = 500;

const styles = StyleSheet.create({
  /* `WebView` là primitive của React Native — `f={1}` của Tamagui không với tới nó. */
  web: { flex: 1, backgroundColor: 'transparent' },
});

/** Toạ độ in ra cho người đọc khi bản đồ không tra được tên — 5 số lẻ là mức ~1m. */
function formatPoint(point: GeoPoint | null): string {
  return point ? `${point.lat.toFixed(5)}, ${point.lng.toFixed(5)}` : '';
}

/**
 * Tấm CHỈNH GHIM — bản đồ tương tác toàn màn, cùng ba thao tác với `MapPinPicker` bên web: chụm
 * để phóng, kéo để dời bản đồ, bấm (hoặc kéo ghim) để đặt lại vị trí.
 *
 * ## Vì sao một tấm trượt chứ không nhúng thẳng vào form
 *
 * Bản đồ và biểu mẫu tranh nhau CÙNG một cử chỉ: kéo dọc. Một bản đồ tương tác nằm giữa một
 * `ScrollView` thì hoặc nuốt cú vuốt (người dùng không cuộn qua được form) hoặc nhường nó (bản
 * đồ không kéo lên xuống được) — không có cách chia nào đúng cho cả hai. Tách ra một bề mặt
 * riêng thì mỗi cử chỉ có đúng một người nhận, và bản đồ được cả màn hình, thứ nó cần khi người
 * dùng đang soi từng con hẻm.
 *
 * ## Vì sao có nút XÁC NHẬN thay vì ghi thẳng vào form
 *
 * Web đặt ghim là ghi ngay, vì bản đồ nằm cạnh ô địa chỉ và người dùng thấy cả hai cùng lúc. Ở
 * đây tấm trượt che mất form, nên ghi ngay nghĩa là mỗi cú chạm nhầm trên đường tới chỗ đúng đều
 * sửa địa chỉ một lần và chạy một lượt tra ngược có tính tiền. Chốt một lần lúc đóng là một lần
 * ghi, một lượt tra.
 */
export function MapPinSheet(props: MapPinSheetProps) {
  /*
   * Dựng NỘI DUNG chỉ khi tấm mở, để mỗi lần mở là một instance mới.
   *
   * Phiên làm việc ở đây có ba thứ phải sạch lúc mở: ghim nháp, cờ "bản đồ đã sẵn sàng" và cờ
   * hỏng. Đặt chúng trong một `useEffect` theo `open` là gọi `setState` đồng bộ trong effect —
   * thứ React 19 tính là một vòng render thừa và lint của app chặn thẳng. Một lần mount mới thì
   * `useState` khởi tạo đúng giá trị ngay từ vòng render đầu, không có vòng nào thừa.
   */
  if (!props.open) return null;
  return <PinSheetSession {...props} />;
}

interface MapPinSheetProps {
  open: boolean;
  /** Ghim hiện tại trong form. `null` = chưa có — bản đồ mở trống ở `anchor`. */
  value: GeoPoint | null;
  /** Mở ở đâu khi chưa có ghim — thường là tâm tỉnh đang chọn. */
  anchor?: GeoPoint | null;
  onClose: () => void;
  /**
   * Chốt ghim. `resolvedLine` là địa chỉ tấm này ĐÃ tra ngược được cho đúng điểm đó — nơi gọi
   * dùng luôn thay vì gọi `/places/reverse` lần hai cho cùng một toạ độ. `null` = chưa tra xong
   * hoặc tra hỏng, và lúc đó nơi gọi tự lo.
   */
  onConfirm: (point: GeoPoint, resolvedLine: string | null) => void;
}

/** Một LẦN MỞ của tấm chỉnh ghim. Sống đúng bằng phiên đó — xem `MapPinSheet`. */
function PinSheetSession({ value, anchor = null, onClose, onConfirm }: MapPinSheetProps) {
  const t = useTranslations('Address.map');
  const tActions = useTranslations('Common.actions');
  const tStates = useTranslations('Common.states');

  /** Ghim NHÁP — chỉ tồn tại trong tấm này cho tới khi người dùng bấm xác nhận. */
  const [draft, setDraft] = useState<GeoPoint | null>(value);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  /**
   * Địa chỉ của ghim NHÁP, tra ngược ra để người dùng đọc được mình đang đứng ở đâu.
   *
   * `null` ở `line` nghĩa là chưa có câu trả lời cho điểm hiện tại — hoặc đang hỏi, hoặc hỏi
   * hỏng. Hai ca đó phân biệt bằng `loading`, vì chúng hiện ra hai thứ khác nhau: một cái là
   * "đợi chút", cái kia là "chỗ này bản đồ không biết tên, nhưng vẫn ghim được".
   */
  const [lookup, setLookup] = useState<{ loading: boolean; line: string | null }>({
    loading: false,
    line: null,
  });
  const reverse = useReverseGeocode();

  /**
   * Tâm mở đầu — `null` = CHƯA biết mở ở đâu (đang đo vị trí), khác hẳn "bản đồ hỏng".
   *
   * Lượt render đầu lấy câu trả lời ĐỒNG BỘ (`mapCenterNow`): có ghim, có điểm neo, hoặc đã đo
   * vị trí ở đâu đó trong lượt chạy này thì không phải đợi gì cả — đây là đường của gần như mọi
   * lần mở. Chỉ khi cả ba đều im lặng mới có một lần đợi, và nó là lần duy nhất người dùng nhìn
   * thấy vòng xoay trước khi bản đồ hiện ra.
   */
  const [center, setCenter] = useState<MapCenter | null>(() => {
    const immediate = mapCenterNow({ value, anchor });
    return immediate.source === 'fallback' ? null : immediate;
  });

  /*
   * Không có gì để định vị ⇒ hỏi thiết bị, và được phép hỏi quyền: người dùng vừa CHẠM để mở một
   * tấm bản đồ trống, nên câu hỏi có đúng ngữ cảnh mà nó cần. Hết giờ hoặc bị từ chối thì
   * `resolveMapCenter` trả về hằng số giữa Đà Nẵng và bản đồ vẫn mở ra — không nhánh nào để
   * người dùng ngồi đợi mãi.
   */
  useEffect(() => {
    if (center) return;
    let alive = true;
    void resolveMapCenter({ value, anchor }).then((resolved) => {
      if (alive) setCenter(resolved);
    });
    return () => {
      alive = false;
    };
    // Chạy MỘT LẦN cho phiên này: `center` chỉ đi từ null sang có giá trị, và `value`/`anchor`
    // là ảnh chụp lúc mở.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * HTML dựng MỘT LẦN cho mỗi lần mở. Dựng lại giữa chừng nghĩa là WebView tải lại từ đầu và
   * người dùng mất luôn mức thu phóng lẫn vùng vừa kéo tới.
   *
   * Phụ thuộc `center`: nó đổi đúng một lần (null → đã biết), và lúc đó WebView còn chưa được
   * dựng nên không có gì để mất.
   */
  const html = useMemo(
    () =>
      center
        ? mapPickerHtml({
            center: center.center,
            zoom: value ? PINNED_ZOOM : UNPINNED_ZOOM,
            pinned: value != null,
          })
        : null,
    // Chụp tâm lúc MỞ: instance này chỉ sống trong một phiên, nên chỉ `center` là phụ thuộc thật.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [center],
  );

  const moved = draft != null && (draft.lat !== value?.lat || draft.lng !== value?.lng);

  /*
   * Ghim đứng yên đủ lâu ⇒ hỏi bản đồ "chỗ này là đâu" và in câu trả lời ngay dưới bản đồ.
   *
   * Người dùng đang nhìn một rừng đường không tên ở mức thu phóng cao; không có dòng này thì họ
   * chỉ biết ghim NẰM ĐÂU chứ không biết nó là CHỖ NÀO, và phải bấm xác nhận rồi quay lại form
   * mới đọc được — tức là phải đoán trước khi chốt.
   *
   * `mutateAsync` gọi trong một `setTimeout`, không phải trong thân effect: setState đồng bộ ở
   * thân effect là một vòng render thừa (và lint chặn), còn ở đây mọi lần ghi state đều nằm
   * trong callback của một thứ bên ngoài React — đúng nghĩa "đồng bộ với hệ thống ngoài".
   *
   * `alive` chặn câu trả lời của một điểm CŨ ghi đè câu trả lời của điểm mới: lượt gọi trước
   * không bị huỷ, nó chỉ về muộn.
   */
  const draftLat = draft?.lat ?? null;
  const draftLng = draft?.lng ?? null;
  useEffect(() => {
    if (draftLat == null || draftLng == null) return;

    let alive = true;
    const timer = setTimeout(() => {
      setLookup({ loading: true, line: null });
      void reverse
        .mutateAsync({ lat: draftLat, lng: draftLng })
        .then((result) => {
          if (!alive) return;
          const resolved =
            result.place?.formattedAddress ?? result.place?.suggestedAddressLine ?? null;
          setLookup({ loading: false, line: resolved });
        })
        .catch(() => {
          // Tra hỏng KHÔNG chặn việc ghim: chỉ là không có tên để in ra.
          if (alive) setLookup({ loading: false, line: null });
        });
    }, LOOKUP_DEBOUNCE_MS);

    return () => {
      alive = false;
      clearTimeout(timer);
    };
    // `reverse` là mutation của React Query, đổi định danh mỗi render — đưa vào đây là hẹn giờ
    // lại vô tận và không lượt tra nào chạy tới nơi.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftLat, draftLng]);

  return (
    <BottomSheet
      open
      onClose={onClose}
      title={t('sheetTitle')}
      subtitle={value ? t('adjustHint') : t('pickHint')}
      maxRatio={SHEET_RATIO}
      padded={false}
      scroll={false}
      footer={
        <Button
          label={t('useThisPoint')}
          icon="location-sharp"
          onPress={() => {
            if (draft) onConfirm(draft, lookup.loading ? null : lookup.line);
            onClose();
          }}
          disabled={!draft || !moved}
        />
      }
    >
      {center === null ? (
        /*
          ĐANG đo vị trí để biết mở bản đồ ở đâu — không phải bản đồ hỏng. Gộp hai trạng thái này
          vào một nhánh là nói với người dùng rằng bản đồ không dùng được, ngay trước khi nó hiện ra.
        */
        <YStack f={1} ai="center" jc="center">
          <ActivityIndicator color={colors.primaryActive} />
        </YStack>
      ) : html && !failed ? (
        <YStack f={1}>
          <WebView
            style={styles.web}
            /*
             * `baseUrl` là gốc của chính web XePrime, không phải `about:blank`.
             *
             * Khoá bản đồ Geoapify khoá theo REFERRER; một trang không có gốc gửi referrer rỗng
             * và tile trả về 401 — hỏng thành một lưới ô xám, không một dòng báo lỗi nào.
             */
            source={{ html, baseUrl: resolveWebBaseUrl() }}
            originWhitelist={['*']}
            // Bản đồ là một trang tự viết, không phải nơi người dùng lướt web — đóng mọi cửa còn lại.
            javaScriptEnabled
            domStorageEnabled={false}
            allowsInlineMediaPlayback={false}
            setSupportMultipleWindows={false}
            /*
             * Ba dòng dưới cùng phục vụ MỘT việc: cú vuốt dọc phải tới được Leaflet.
             *
             * `scrollEnabled={false}` tắt vùng cuộn của chính WebView (trang không có gì để cuộn,
             * nhưng vùng cuộn đó vẫn nuốt cử chỉ trước khi trang thấy); `nestedScrollEnabled` tắt
             * để tấm trượt bên dưới không cướp lại; `overScrollMode="never"` bỏ hiệu ứng kéo quá
             * mép của Android, thứ trông y như bản đồ vừa nảy ngược. Phần còn lại là
             * `touch-action: none` trong chính trang — xem `map-interactive.ts`.
             */
            scrollEnabled={false}
            nestedScrollEnabled={false}
            overScrollMode="never"
            onMessage={(event) => {
              const message = parseMapMessage(event.nativeEvent.data);
              if (!message) return;
              if (message.type === 'ready') {
                setReady(true);
                return;
              }
              if (message.type === 'error') {
                setFailed(true);
                return;
              }
              setDraft({ lat: message.lat, lng: message.lng });
            }}
            onError={() => setFailed(true)}
            onHttpError={() => setFailed(true)}
          />

          {ready ? null : (
            <YStack pos="absolute" top={0} left={0} right={0} bottom={0} ai="center" jc="center">
              <ActivityIndicator color={colors.primaryActive} />
            </YStack>
          )}

          {/*
            Dòng "ghim đang ở đâu" — nổi trên mép dưới bản đồ, không chiếm chiều cao của nó.

            Đặt NGOÀI bản đồ thì mỗi lần dòng này đổi độ dài (một địa chỉ hai dòng, rồi một địa
            chỉ một dòng) là bản đồ co giãn theo và vùng người dùng đang nhìn nhảy đi một quãng —
            ngay giữa lúc họ đang ngắm cho đúng số nhà.
          */}
          <XStack
            pos="absolute"
            left={space.sm}
            right={space.sm}
            bottom={space.sm}
            ai="center"
            gap={space.sm}
            px={space.sm}
            py={space.xs}
            br={radius.md}
            bg={colors.surface}
            bw={1}
            bc={colors.border}
            style={elevation.card}
          >
            <Ionicons name="location-sharp" size={iconSize.sm} color={colors.primaryActive} />
            {lookup.loading ? (
              <Text f={1} col={colors.textMuted} fos={fieldFontSize.message}>
                {tStates('loading')}
              </Text>
            ) : (
              <Text f={1} col={colors.text} fos={fieldFontSize.value} numberOfLines={2}>
                {/*
                  Bản đồ không biết tên chỗ này thì in TOẠ ĐỘ, không in một dòng trống: điểm vẫn
                  ghim được (hẻm, số nhà mới — đúng lý do thao tác này tồn tại), và người dùng cần
                  một thứ để đối chiếu rằng ghim có nhúc nhích theo tay mình hay không.
                */}
                {lookup.line ?? formatPoint(draft)}
              </Text>
            )}
          </XStack>
        </YStack>
      ) : (
        <YStack f={1} jc="center" px={space.md} gap={space.sm}>
          <Callout tone="warning" title={t('unavailable')} />
          <Text col={colors.textMuted} fos={fontSize.label}>
            {t('readOnlyHint')}
          </Text>
          <Button label={tActions('close')} variant="secondary" onPress={onClose} />
        </YStack>
      )}
    </BottomSheet>
  );
}

