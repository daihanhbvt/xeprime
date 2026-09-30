import { Ionicons } from '@expo/vector-icons';
import { CHAT_SIDE, type ChatSide } from '@xeprime/types';
import {
  DAY_PARAM_FORMAT,
  groupThreadMessages,
  isOwnSideMessage,
  nowInAppTz,
  toAppTz,
} from '@xeprime/domain';
import { useRouter } from 'expo-router';
import { useNavigateOnce } from '@/hooks/use-navigate-once';
import { ROUTES } from '@/navigation/routes';
import { useCallback, useMemo, useRef, useState } from 'react';
import { FlatList, Pressable, StyleSheet, type ListRenderItemInfo } from 'react-native';
import { Text, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { AppHeader } from '@/components/layout/AppHeader';
import { Avatar } from '@/components/ui/Avatar';
import { Screen } from '@/components/layout/Screen';
import { PhotoViewer } from '@/components/ui/PhotoViewer';
import { ScreenError } from '@/components/state/ScreenError';
import { ScreenLoading } from '@/components/state/ScreenLoading';
import { useAppFormat } from '@/i18n/use-app-format';
import { MEDIA_LIST_TUNING } from '@/theme/list-tuning';
import { colors, fontSize, fontWeight, iconSize, radius, space } from '@/theme/tokens';
import { ChatComposer } from './components/ChatComposer';
import { MessageBubble } from './components/MessageBubble';
import { useCurrentUser } from '@/features/auth/hooks/use-auth';
import { resolveChatInbox } from './chat-inbox';
import { useConversation } from './hooks/use-chat';
import { useThread, type ThreadEntry } from './hooks/use-thread';
import { useVehicleContext } from './hooks/use-vehicle-context';

/** Cuộn xa đáy quá ngưỡng này thì tin mới KHÔNG kéo màn xuống — chỉ hiện nút "có tin mới". */
const NEAR_BOTTOM_PX = 120;

/** Cao xấp xỉ một dòng chữ `body` để ảnh và tên cùng đường chân trong thanh trên. */
const HEADER_AVATAR = 32;

/**
 * Một dòng của danh sách đảo: tin nhắn + hai cờ TRÌNH BÀY do việc gộp nhóm quyết định.
 *
 * Gộp nhóm không tính ở đây mà ở `groupThreadMessages` của `@xeprime/domain` — đúng hàm web gọi.
 * Tự so `senderUserId` với phần tử kế bên là chép lại một luật đã có chủ, và là chỗ dễ sai im
 * lặng nhất: gộp theo "phía" thay vì theo NGƯỜI GỬI làm tin của hai nhân viên khác nhau dính
 * thành một khối mang đúng một cái tên.
 */
interface ThreadRow {
  entry: ThreadEntry;
  mine: boolean;
  /** Tên người gửi — chỉ ở tin ĐẦU nhóm, và chỉ khi bề mặt cần phân biệt nhiều người. */
  senderName: string | null;
  /** Ngày cần vẽ dải phân cách — chỉ ở tin mở đầu một ngày. */
  day: string | null;
  /** Vị trí trong nhóm — quyết định góc bo và khoảng hở, xem `MessageBubble`. */
  firstOfGroup: boolean;
  lastOfGroup: boolean;
}

const rowKey = (row: ThreadRow) => row.entry.message.id;

/**
 * Màn một cuộc trò chuyện — MỘT màn cho cả hai bề mặt, y như `ThreadPanel` của web.
 *
 * `inverted` là quyết định trung tâm, và nó thay cho toàn bộ phần neo cuộn mà bản web phải tự
 * viết: danh sách đảo ngược có gốc toạ độ ở ĐÁY, nên tin mới đến tự nằm đúng chỗ, và tin CŨ thêm
 * vào đầu mảng mọc ra phía trên mà không dịch một pixel nào của vùng đang đọc. Với `FlatList`
 * thường, mỗi lần tải lịch sử là một cú nhảy phải bù bằng tay.
 *
 * Hệ quả kéo theo: `onEndReached` ở đây nghĩa là "chạm tới tin CŨ NHẤT", nên nó nối trang lịch
 * sử chứ không phải trang mới.
 */
export function ChatThreadScreen({
  conversationId,
  side,
  pendingVehicleId,
}: {
  conversationId: string;
  side: ChatSide;
  /** Xe vừa mở chat từ tin đăng của nó — chờ gắn vào câu nhắn ĐẦU TIÊN. Vai của `?v=` bên web. */
  pendingVehicleId?: string | null;
}) {
  const t = useTranslations('Chat');
  const router = useRouter();
  const navigateOnce = useNavigateOnce();

  /*
   * Trục TRUY VẤN là hộp thư, không phải vai của dòng: server kiểm phạm vi bằng chính tham số
   * này, nên một chủ xe tuyến hoa hồng mở hội thoại phía gian hàng của mình từ hộp thư hợp nhất
   * sẽ nhận 403 nếu ta gửi `customer` (ADR 0038 điều 10).
   */
  const { data: user } = useCurrentUser();
  const inbox = resolveChatInbox(side, user);

  const conversationQuery = useConversation(inbox, conversationId);
  /*
   * Bề mặt THẬT của người đang xem. `side` là thứ route nói; `conversation.side` là thứ server
   * xác nhận sau khi kiểm quyền. Phải có trước `useThread`: tin lạc quan dựng `senderType` từ
   * nó, và sai ở đó là bong bóng của mình hiện bên phía đối phương.
   */
  const viewerSide = conversationQuery.data?.side ?? side;
  const thread = useThread(conversationId, viewerSide);

  const [awayFromBottom, setAwayFromBottom] = useState(false);
  const [viewerUrl, setViewerUrl] = useState<string | null>(null);
  const listRef = useRef<FlatList<ThreadRow>>(null);

  /*
   * Ngữ cảnh xe giữ ở STATE, không đọc thẳng route param mỗi lần render.
   *
   * Web gỡ `?v=` khỏi URL sau khi thẻ đã đi kèm câu đầu tiên, vì URL của nó chia sẻ được và sống
   * qua F5. Native không có cả hai chuyện đó — ngăn xếp điều hướng đã giữ chỗ — nên một biến
   * state là bản dịch đúng: cùng vòng đời "gắn một lần rồi thôi", không phải ghi lại đường dẫn.
   */
  const [vehicleContextId, setVehicleContextId] = useState<string | null>(pendingVehicleId ?? null);
  const vehicleContext = useVehicleContext(vehicleContextId);
  const clearVehicleContext = useCallback(() => setVehicleContextId(null), []);

  // Danh sách đảo: offset 0 CHÍNH LÀ tin mới nhất.
  const jumpToLatest = useCallback(
    () => listRef.current?.scrollToOffset({ offset: 0, animated: true }),
    [],
  );

  /*
   * Chỉ inbox gian hàng cần tên người gửi: nhiều nhân viên cùng trực một hội thoại. Khách luôn
   * nói chuyện với "gian hàng", nên gắn tên nhân viên ở đó chỉ là nhiễu.
   */
  const showSenderNames = viewerSide === CHAT_SIDE.SHOP;

  // Thẻ xe trên bong bóng dẫn sang tin đăng — cùng lối đi với thẻ xe ở màn khám phá.
  const openListing = useCallback(
    (vehicleId: string) => navigateOnce(ROUTES.explore.listingDetail(vehicleId)),
    [navigateOnce],
  );


  const rows = useMemo<ThreadRow[]>(() => {
    const groups = groupThreadMessages(thread.entries, {
      isMine: (m) => isOwnSideMessage(m.senderType, viewerSide),
      // Khoá gộp gồm NGƯỜI GỬI: hai nhân viên trả lời nối nhau là hai nhóm.
      senderKey: (m) => m.senderUserId ?? m.senderType ?? 'system',
      senderName: (m) => m.senderName ?? null,
      dayOf: (sentAt) => toAppTz(sentAt).format(DAY_PARAM_FORMAT),
    });

    const flat: ThreadRow[] = [];
    for (const group of groups) {
      group.entries.forEach((entry, index) => {
        flat.push({
          entry,
          mine: group.mine,
          senderName: index === 0 && showSenderNames && !group.mine ? group.senderName : null,
          day: index === 0 && group.startsDay ? group.day : null,
          firstOfGroup: index === 0,
          lastOfGroup: index === group.entries.length - 1,
        });
      });
    }
    // `FlatList inverted` xếp phần tử 0 xuống ĐÁY, nên mảng phải đi từ mới nhất.
    return flat.reverse();
  }, [thread.entries, viewerSide, showSenderNames]);

  /*
   * Bọc `useCallback` để tham chiếu ỔN ĐỊNH qua các lần render — điều kiện để `memo` của
   * `MessageBubble` có tác dụng. `retry`/`discard` của `useThread` vốn đã ổn định, nhưng bọc lại
   * ở đây giữ cho `renderItem` không phụ thuộc vào chi tiết đó.
   */
  const { retry, discard } = thread;
  const retryMessage = useCallback((id: string) => void retry(id), [retry]);
  const discardMessage = useCallback((id: string) => discard(id), [discard]);

  const renderItem = useCallback(
    ({ item }: ListRenderItemInfo<ThreadRow>) => {
      const { message, state } = item.entry;

      /*
       * Dải ngày và tên người gửi đứng TRƯỚC bong bóng trong JSX.
       *
       * `inverted` đảo thứ tự các Ô nhưng KHÔNG đảo nội dung bên trong một ô (RN lật ngược từng
       * `CellRenderer` lại cho đúng chiều). Đặt dải ngày sau bong bóng thì nó rơi xuống dưới tin
       * đầu tiên của ngày — tức nằm giữa ngày đó thay vì mở đầu nó.
       */
      return (
        <YStack>
          {item.day ? <DaySeparator day={item.day} /> : null}
          <MessageBubble
            text={message.text ?? null}
            attachments={message.attachments}
            sentAt={message.sentAt}
            mine={item.mine}
            state={state}
            senderName={item.senderName}
            firstOfGroup={item.firstOfGroup}
            lastOfGroup={item.lastOfGroup}
            clientMessageId={message.clientMessageId}
            onPressImage={setViewerUrl}
            {...(message.vehicle ? { vehicle: message.vehicle } : {})}
            onPressVehicle={openListing}
            /*
             * Truyền THẲNG hai hàm đã `useCallback`, không bọc closure quanh `clientMessageId`.
             *
             * Bọc closure ở đây là dựng hai hàm MỚI cho mỗi tin ở mỗi lần render, và `memo` của
             * `MessageBubble` không bao giờ khớp cho đúng những tin của chính người dùng. Id đi
             * xuống thành prop; bong bóng tự ghép lại khi bấm.
             */
            onRetry={retryMessage}
            onDiscard={discardMessage}
          />
        </YStack>
      );
    },
    [openListing, retryMessage, discardMessage],
  );

  const onScroll = useCallback(
    // Danh sách đảo: `contentOffset.y` là khoảng cách tính từ ĐÁY, nên phép so là trực tiếp.
    (event: { nativeEvent: { contentOffset: { y: number } } }) => {
      const away = event.nativeEvent.contentOffset.y > NEAR_BOTTOM_PX;
      /*
       * Chỉ gọi `setState` khi giá trị THẬT SỰ đổi.
       *
       * Bộ nhận này chạy trên luồng JS, mỗi 64ms suốt cú cuộn. Gọi `setAwayFromBottom(away)`
       * trần thì React vẫn phải render lại màn một lượt trước khi nhận ra giá trị không đổi và
       * bỏ qua cây con — tức ~15 lượt render mỗi giây của CẢ màn hội thoại, đúng lúc luồng JS
       * đang phải dựng các bong bóng tin mới vào tầm nhìn.
       *
       * Dạng hàm cập nhật thì React so ngay trong `setState` và không lên lịch gì cả. Cùng cách
       * `ShopDetailScreen` đã làm cho ngưỡng hiện tên gian hàng.
       */
      setAwayFromBottom((prev) => (prev === away ? prev : away));
    },
    [],
  );

  // Đầu trang chỉ còn ĐỐI PHƯƠNG: hội thoại thuộc về gian hàng, một thread nói về nhiều xe —
  // gắn tên một chiếc lên đây là nói sai về phần còn lại. Ngữ cảnh nằm ở thẻ trên từng tin.
  const title = conversationQuery.data?.partyName ?? '';

  if (conversationQuery.isPending) {
    return (
      <>
        <AppHeader onBack={() => router.back()} />
        <Screen edges={['left', 'right', 'bottom']} scroll={false}>
          <ScreenLoading />
        </Screen>
      </>
    );
  }

  if (conversationQuery.isError) {
    return (
      <>
        <AppHeader onBack={() => router.back()} />
        <Screen edges={['left', 'right', 'bottom']} scroll={false}>
          <ScreenError
            error={conversationQuery.error}
            title={t('loadError')}
            onRetry={() => void conversationQuery.refetch()}
          />
        </Screen>
      </>
    );
  }

  return (
    <>
      <AppHeader
        onBack={() => router.back()}
        title={title}
        /*
         * Mặt gian hàng ngay cạnh tên. Một thanh chỉ có chữ buộc người dùng ĐỌC để biết mình
         * đang ở hội thoại nào; khi đã có ảnh trong danh sách thì việc nhận ra phải liền mạch
         * sang màn này, không đứt quãng.
         */
        avatar={
          <Avatar
            name={title}
            url={conversationQuery.data?.partyAvatarUrl ?? null}
            size={HEADER_AVATAR}
          />
        }
      />

      {/*
        Nét tách thanh trên khỏi vùng trò chuyện — cùng `--xp-color-border` mà web dùng cho
        `.threadHeader`. `AppHeader` vốn kẻ bằng `borderSubtle`, nét đó nhạt tới mức trên màn
        dày chữ như thế này hai vùng dính vào nhau.
      */}
      <YStack height={StyleSheet.hairlineWidth} bg={colors.border} />

      {/*
        `Screen` gánh safe area + tránh bàn phím; `footer` đặt ô soạn tin nằm TRONG lớp tránh bàn
        phím đó. Đây là lý do `ChatComposer` không tự bọc `KeyboardAvoidingView`: hai lớp lồng
        nhau thì phần đẩy cộng dồn và ô nhập bị hất lên giữa màn.
      */}
      <Screen
        edges={['left', 'right', 'bottom']}
        scroll={false}
        padded={false}
        footer={
          <ChatComposer
            onSend={thread.send}
            disabled={thread.loading || Boolean(thread.error)}
            vehicleContext={vehicleContext}
            onClearVehicleContext={clearVehicleContext}
          />
        }
      >
        {thread.loading ? (
          <ScreenLoading />
        ) : thread.error ? (
          <ScreenError error={thread.error} title={t('messagesLoadError')} onRetry={thread.reload} />
        ) : rows.length === 0 ? (
          /*
            Trạng thái rỗng nằm NGOÀI `FlatList`, không phải ở `ListEmptyComponent`: cờ `inverted`
            lật cả khung chứa nội dung 180°, nên chữ đặt trong đó hiện ra lộn ngược.
          */
          <YStack f={1} ai="center" jc="center" p={space.lg}>
            <Text col={colors.textMuted} fos={fontSize.bodySm} ta="center">
              {t('emptyThread')}
            </Text>
          </YStack>
        ) : (
          <YStack f={1}>
            <FlatList
              ref={listRef}
              inverted
              data={rows}
              keyExtractor={rowKey}
              renderItem={renderItem}
              onScroll={onScroll}
              scrollEventThrottle={64}
              // Đảo ngược ⇒ "cuối danh sách" là tin CŨ NHẤT, nên đây là nối trang LỊCH SỬ.
              onEndReached={thread.loadOlder}
              keyboardDismissMode="interactive"
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={styles.listContent}
              /*
                MEDIA chứ không LIST: thread có ảnh đính kèm, và `removeClippedSubviews` tính
                vùng cắt theo khung view cha — phép tính đó sai ở những ô CAO hơn hẳn phần còn
                lại. Một bong bóng ảnh cao 200dp nằm giữa toàn bong bóng chữ cao ~40dp là đúng
                hình dạng đó.

                Ở đây còn tệ hơn một danh sách thẻ thường: ô ảnh ĐỔI CHIỀU CAO sau khi ảnh tải
                xong (`attachmentBox` đọc tỉ lệ thật từ `onLoad`), nên phép tính cắt đã sai lại
                còn dựa trên số đo cũ. Ảnh hiện ra rồi biến mất vài trăm mili-giây sau — đúng thứ
                docblock của `MEDIA_LIST_TUNING` mô tả.
              */
              {...MEDIA_LIST_TUNING}
            />

            {awayFromBottom ? (
              <JumpToLatest label={t('newMessages')} onPress={jumpToLatest} />
            ) : null}
          </YStack>
        )}
      </Screen>

      <PhotoViewer
        url={viewerUrl}
        unavailableLabel={t('attachmentUnavailable')}
        onClose={() => setViewerUrl(null)}
      />
    </>
  );
}

function DaySeparator({ day }: { day: string }) {
  const t = useTranslations('Chat');
  const fmt = useAppFormat();

  const today = nowInAppTz();
  const label =
    day === today.format(DAY_PARAM_FORMAT)
      ? t('today')
      : day === today.subtract(1, 'day').format(DAY_PARAM_FORMAT)
        ? t('yesterday')
        : fmt.fullDate(toAppTz(`${day}T00:00:00+07:00`));

  return (
    <YStack ai="center" py={space.sm}>
      <Text
        px={space.md}
        py={2}
        br={radius.pill}
        bg={colors.surfaceMuted}
        col={colors.textMuted}
        fos={fontSize.label}
      >
        {label}
      </Text>
    </YStack>
  );
}

/**
 * Chỉ báo "còn tin ở dưới" — CỐ Ý không tự cuộn.
 *
 * Người dùng đang đọc lịch sử mà màn tự nhảy xuống đáy là mất chỗ đang đọc. Nút này chỉ nói rằng
 * có gì đó ở dưới; đưa quyền quyết định cho ngón tay.
 */
function JumpToLatest({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <YStack pos="absolute" bottom={space.md} left={0} right={0} ai="center" pointerEvents="box-none">
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={label}
        style={styles.pill}
      >
        <Ionicons name="arrow-down" size={iconSize.xs} color={colors.onPrimary} />
        <Text col={colors.onPrimary} fos={fontSize.label} fow={fontWeight.semibold}>
          {label}
        </Text>
      </Pressable>
    </YStack>
  );
}

const styles = StyleSheet.create({
  listContent: {
    flexGrow: 1,
    paddingVertical: space.sm,
  },
  pill: {
    alignItems: 'center',
    backgroundColor: colors.primary,
    borderRadius: radius.pill,
    flexDirection: 'row',
    gap: space.xs,
    paddingHorizontal: space.md,
    paddingVertical: space.xs,
  },
});
