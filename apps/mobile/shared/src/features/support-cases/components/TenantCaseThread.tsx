import { memo, useMemo, useState } from 'react';
import { Pressable, StyleSheet, TextInput } from 'react-native';
import { Image } from 'expo-image';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { LIST_SEPARATOR, toAppTz } from '@xeprime/domain';
import {
  STATUS_COLOR,
  SUPPORT_CASE_SETTLEMENT_FREEZING_CATEGORIES,
  SUPPORT_CASE_STATUS,
  SUPPORT_CASE_STATUS_META,
  SUPPORT_CASE_STATUS_VALUES,
  SUPPORT_PARTY,
  canTransitionSupportCase,
  type SupportCaseCategory,
  type SupportCaseStatus,
} from '@xeprime/types';
import { useAppToast } from '@/components/feedback/use-app-toast';
import { LineIcon } from '@/components/icons/LineIcon';
import { Screen } from '@/components/layout/Screen';
import { ActionSheetButtons } from '@/components/ui/ActionSheetButtons';
import { Avatar } from '@/components/ui/Avatar';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Callout } from '@/components/ui/Callout';
import { IconSquareButton } from '@/components/ui/IconSquareButton';
import { Pill, pillToneOfStatusColor } from '@/components/ui/Pill';
import { ManagePageHeader } from '@/features/shell/ManagePageHeader';
import { useAppFormat } from '@/i18n/use-app-format';
import { useDomainLabel } from '@/i18n/domain';
import { useErrorMessage } from '@/i18n/use-error-message';
import { useAppScheme, useColors } from '@/theme/ThemeProvider';
import { FONT_FAMILY } from '@/theme/fonts';
import { fontWeight, iconSize, radius, space, typeScale } from '@/theme/tokens';
import { SUPPORT_SURFACE, type SupportCaseDetail, type SupportCaseEvent } from '../api';
import {
  useCanWriteSupportCase,
  usePostSupportMessage,
  useTransitionSupportCase,
} from '../hooks/use-support-cases';

const PLATFORM_AVATAR = require('../../../../assets/images/partner/support-avatar.png') as number;

/**
 * Chi tiết yêu cầu hỗ trợ của GIAN HÀNG dạng hội thoại (Figma "Helps / Request / View" `24232:118901`):
 * thanh trên = loại + mã `#…` + viên trạng thái + ba cột (Người mở · Gian hàng · Mở lúc); khung vàng
 * = mô tả yêu cầu; dòng thời gian = bong bóng chat gom theo NGÀY (tin của gian hàng bên phải nền vàng,
 * bên khác bên trái kèm ảnh); ô soạn tin dính đáy.
 *
 * Nghiệp vụ y nguyên bản cũ: trả lời = `POST …/messages`; "Đóng" chỉ khi chuyển được tới `closed`
 * và loại yêu cầu KHÔNG giữ tiền chuyến (server chặn `SUPPORT_CASE_PLATFORM_RESOLVE_ONLY`) - nay nằm
 * trong menu ⋮ (người dùng chốt 25/11/2026). Đã đóng ⇒ không có ô soạn, thay bằng câu giải thích.
 * Đính kèm ảnh/PDF của Figma để đợt sau (chưa có API tải tệp) - không bày nút kẹp giấy chết.
 */
export function TenantCaseThread({
  row,
  onBack,
  refreshing,
  onRefresh,
}: {
  row: SupportCaseDetail;
  onBack: () => void;
  /** Kéo để làm mới - XePrime có thể vừa trả lời. */
  refreshing: boolean;
  onRefresh: () => void;
}) {
  const colors = useColors();
  const t = useTranslations('SupportCases.detail');
  const fmt = useAppFormat();
  const domainLabel = useDomainLabel();
  const toast = useAppToast();
  const errorMessage = useErrorMessage();
  const canWrite = useCanWriteSupportCase(SUPPORT_SURFACE.TENANT);
  const transition = useTransitionSupportCase(SUPPORT_SURFACE.TENANT);
  const [moreOpen, setMoreOpen] = useState(false);

  const status = row.status as SupportCaseStatus;
  const meta = SUPPORT_CASE_STATUS_META[status];
  const closed = status === SUPPORT_CASE_STATUS.CLOSED;
  const platformResolveOnly = SUPPORT_CASE_SETTLEMENT_FREEZING_CATEGORIES.includes(
    row.category as SupportCaseCategory,
  );
  const targets = canWrite
    ? SUPPORT_CASE_STATUS_VALUES.filter(
        (next) =>
          next === SUPPORT_CASE_STATUS.CLOSED &&
          !platformResolveOnly &&
          canTransitionSupportCase(status, next),
      )
    : [];

  const facts = [
    { key: 'openedBy', label: t('openedBy'), value: row.openedByName ?? t('openedBySystem') },
    ...(row.tenantName ? [{ key: 'tenant', label: t('tenant'), value: row.tenantName }] : []),
    { key: 'createdAt', label: t('createdAt'), value: fmt.dateTime(row.createdAt) },
    ...(row.bookingCode ? [{ key: 'booking', label: t('booking'), value: `#${row.bookingCode}` }] : []),
    ...(row.assigneeName ? [{ key: 'assignee', label: t('assignee'), value: row.assigneeName }] : []),
  ];

  return (
    <>
      <ManagePageHeader
        title={domainLabel('supportCaseCategory', row.category)}
        titleSuffix={`#${row.code}`}
        onBack={onBack}
        actions={
          targets.length > 0 ? (
            <IconSquareButton label={t('moreActions')} onPress={() => setMoreOpen(true)}>
              <LineIcon name="menu-kebab" size={iconSize.lg} color={colors.textMuted} />
            </IconSquareButton>
          ) : null
        }
        below={
          <YStack gap={10}>
            <XStack>
              <Pill
                label={domainLabel('supportCaseStatus', status, meta?.label)}
                tone={pillToneOfStatusColor(meta?.color ?? STATUS_COLOR.NEUTRAL)}
              />
            </XStack>
            <XStack flexWrap="wrap" rowGap={space.sm} gap={space.sm}>
              {facts.map((fact) => (
                <YStack key={fact.key} gap={2} style={styles.fact}>
                  <Text col={colors.placeholder} fos={typeScale.label.fontSize} lh={typeScale.label.lineHeight}>
                    {fact.label}
                  </Text>
                  <Text
                    col={colors.text}
                    fos={typeScale.label.fontSize}
                    lh={typeScale.label.lineHeight}
                    fow={fontWeight.medium}
                    numberOfLines={1}
                  >
                    {fact.value}
                  </Text>
                </YStack>
              ))}
            </XStack>
          </YStack>
        }
      />

      <Screen
        edges={['left', 'right', 'bottom']}
        refreshing={refreshing}
        onRefresh={onRefresh}
        footer={!closed && canWrite ? <Composer caseId={row.id} /> : undefined}
      >
        <YStack bg={colors.warningSurface} borderWidth={1} borderColor={colors.warningBorder} br={radius.control} p={12}>
          <Text col={colors.textBody} fos={typeScale.label.fontSize} lh={typeScale.label.lineHeight}>
            {row.description}
          </Text>
        </YStack>

        {row.resolution ? (
          <Callout tone="success" title={t('resolution')}>
            {row.resolution}
          </Callout>
        ) : null}

        <Thread events={row.events} />

        {closed ? <Callout tone="info">{t('closedNotice')}</Callout> : null}
      </Screen>

      <BottomSheet open={moreOpen} onClose={() => setMoreOpen(false)} title={t('actionsTitle')} chrome="v2" headerDivider>
        <ActionSheetButtons
          actions={targets.map((next) => ({
            key: next,
            label: t('moveTo', { status: domainLabel('supportCaseStatus', next) }),
            loading: transition.isPending,
            onPress: () =>
              transition.mutate(
                { id: row.id, status: next, note: null },
                {
                  onSuccess: () => setMoreOpen(false),
                  onError: (error) => toast.showError(errorMessage(error)),
                },
              ),
          }))}
        />
      </BottomSheet>
    </>
  );
}

/** Dòng thời gian gom theo NGÀY (viên ngày ở giữa, Figma `24232:119391`). */
function Thread({ events }: { events: readonly SupportCaseEvent[] }) {
  const colors = useColors();
  const t = useTranslations('SupportCases.detail');
  const fmt = useAppFormat();
  const groups = useMemo(() => {
    const out: { day: string; label: string; items: SupportCaseEvent[] }[] = [];
    for (const event of events) {
      const day = toAppTz(event.createdAt).format('YYYY-MM-DD');
      const last = out[out.length - 1];
      if (last && last.day === day) last.items.push(event);
      else out.push({ day, label: fmt.date(event.createdAt), items: [event] });
    }
    return out;
  }, [events, fmt]);

  if (events.length === 0) {
    return (
      <Text ta="center" col={colors.placeholder} fos={typeScale.body.fontSize} lh={typeScale.body.lineHeight}>
        {t('noEvents')}
      </Text>
    );
  }

  return (
    <YStack gap={space.md}>
      {groups.map((group) => (
        <YStack key={group.day} gap={space.md}>
          <XStack jc="center">
            <YStack bg={colors.background} br={radius.card} px={space.sm} py={2}>
              <Text col={colors.textBody} fos={typeScale.label.fontSize} lh={typeScale.label.lineHeight} fow={fontWeight.medium}>
                {group.label}
              </Text>
            </YStack>
          </XStack>
          <YStack gap={12}>
            {group.items.map((event) => (
              <Bubble key={event.id} event={event} />
            ))}
          </YStack>
        </YStack>
      ))}
    </YStack>
  );
}

/**
 * Một sự kiện. Tin của GIAN HÀNG (`actorScope = tenant`, kể cả nhân viên khác cùng gian hàng) nằm
 * bên phải nền vàng; tin XePrime/khách bên trái nền xám kèm ảnh + tên. Sự kiện chỉ đổi trạng thái
 * (không nội dung) là một dòng chữ nhỏ ở giữa.
 */
const Bubble = memo(function Bubble({ event }: { event: SupportCaseEvent }) {
  const colors = useColors();
  const t = useTranslations('SupportCases.detail');
  const domainLabel = useDomainLabel();
  // Figma: nền vàng đặc #fec84b; giao diện tối token đó là rgba mờ ⇒ dùng nền cảnh báo tối cho đủ tương phản.
  const dark = useAppScheme().scheme === 'dark';
  const time = toAppTz(event.createdAt).format('HH:mm');
  const statusLine = event.toStatus
    ? t('statusChanged', { status: domainLabel('supportCaseStatus', event.toStatus) })
    : null;

  if (!event.body) {
    return statusLine ? (
      <Text ta="center" col={colors.placeholder} fos={typeScale.label.fontSize} lh={typeScale.label.lineHeight}>
        {`${statusLine}${LIST_SEPARATOR}${time}`}
      </Text>
    ) : null;
  }

  const mine = event.actorScope === SUPPORT_PARTY.TENANT;
  const body = (
    <>
      <Text col={mine ? colors.text : colors.textBody} fos={typeScale.body.fontSize} lh={typeScale.body.lineHeight}>
        {event.body}
      </Text>
      {statusLine ? (
        <Text col={colors.placeholder} fos={typeScale.label.fontSize} lh={typeScale.label.lineHeight}>
          {statusLine}
        </Text>
      ) : null}
      <Text
        col={mine ? colors.placeholder : colors.textPlaceholder}
        fos={typeScale.label.fontSize}
        lh={typeScale.label.lineHeight}
      >
        {time}
      </Text>
    </>
  );

  if (mine) {
    return (
      <XStack jc="flex-end">
        <YStack bg={dark ? colors.warningSurface : colors.warningBorder} borderWidth={1} borderColor={colors.warningBorder} px={12} py={space.sm} gap={4} ai="flex-end" style={styles.mine}>
          {body}
        </YStack>
      </XStack>
    );
  }

  return (
    <XStack gap={space.sm} ai="flex-start">
      {event.actorScope === SUPPORT_PARTY.PLATFORM ? (
        <Image source={PLATFORM_AVATAR} style={styles.avatar} contentFit="cover" />
      ) : (
        <Avatar name={event.actorName} size={AVATAR} soft />
      )}
      <YStack f={1} bg={colors.background} px={12} py={space.sm} gap={4} style={styles.theirs}>
        <Text
          col={colors.text}
          fos={typeScale.body.fontSize}
          lh={typeScale.body.lineHeight}
          fow={fontWeight.semibold}
        >
          {event.actorName}
        </Text>
        {body}
      </YStack>
    </XStack>
  );
});

/** Ô soạn tin dính đáy (Figma "Message Composer"): ô nhập bo 12 + nút gửi vàng 40. */
function Composer({ caseId }: { caseId: string }) {
  const colors = useColors();
  const t = useTranslations('SupportCases.detail');
  const toast = useAppToast();
  const errorMessage = useErrorMessage();
  const post = usePostSupportMessage(SUPPORT_SURFACE.TENANT);
  const [body, setBody] = useState('');
  const text = body.trim();
  const disabled = !text || post.isPending;

  const send = () => {
    if (disabled) return;
    post.mutate(
      { id: caseId, body: text },
      {
        onSuccess: () => setBody(''),
        onError: (error) => toast.showError(errorMessage(error)),
      },
    );
  };

  return (
    <XStack gap={12} ai="flex-end">
      <XStack
        f={1}
        minHeight={40}
        ai="center"
        bg={colors.surface}
        borderWidth={1}
        borderColor={colors.borderInput}
        br={radius.control}
        px={14}
      >
        <TextInput
          value={body}
          onChangeText={setBody}
          placeholder={t('composerPlaceholder')}
          placeholderTextColor={colors.textPlaceholder}
          accessibilityLabel={t('replyLabel')}
          multiline
          style={[styles.input, { color: colors.text }]}
        />
      </XStack>
      <Pressable
        onPress={send}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityLabel={t('send')}
        accessibilityState={{ disabled, busy: post.isPending }}
        style={({ pressed }) => [
          styles.send,
          { backgroundColor: colors.primary, opacity: disabled ? 0.5 : pressed ? 0.8 : 1 },
        ]}
      >
        <LineIcon name="send-2" color={colors.onPrimary} />
      </Pressable>
    </XStack>
  );
}

const AVATAR = 32;
/** Bong bóng: bo 12, riêng góc phía người gửi 2 (Figma "Message Content"). */
const BUBBLE_RADIUS = 12;
const styles = StyleSheet.create({
  fact: { flexBasis: '30%', flexGrow: 1, minWidth: 96 },
  avatar: { width: AVATAR, height: AVATAR, borderRadius: AVATAR / 2 },
  theirs: {
    borderTopLeftRadius: 2,
    borderTopRightRadius: BUBBLE_RADIUS,
    borderBottomLeftRadius: BUBBLE_RADIUS,
    borderBottomRightRadius: BUBBLE_RADIUS,
  },
  mine: {
    maxWidth: '85%',
    borderTopLeftRadius: BUBBLE_RADIUS,
    borderTopRightRadius: 2,
    borderBottomLeftRadius: BUBBLE_RADIUS,
    borderBottomRightRadius: BUBBLE_RADIUS,
  },
  input: {
    flex: 1,
    paddingVertical: 8,
    fontSize: typeScale.body.fontSize,
    lineHeight: typeScale.body.lineHeight,
    fontFamily: FONT_FAMILY.body,
    maxHeight: 120,
  },
  send: { width: 40, height: 40, borderRadius: radius.control, alignItems: 'center', justifyContent: 'center' },
});
