import { Ionicons } from '@expo/vector-icons';
import { CHAT_REPORT_NOTE_MAX_LENGTH, CHAT_SIDE } from '@xeprime/types';
import { useState } from 'react';
import { Pressable } from 'react-native';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { useAppToast } from '@/components/feedback/use-app-toast';
import { AlertDialog } from '@/components/ui/AlertDialog';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Button } from '@/components/ui/Button';
import type { IconName } from '@/components/ui/Chip';
import { IconButton } from '@/components/ui/IconButton';
import { IconDisc } from '@/components/ui/IconDisc';
import { MenuOption, MenuOptionList } from '@/components/ui/MenuOption';
import { Skeleton } from '@/components/ui/Skeleton';
import { TextControl } from '@/components/ui/TextControl';
import { useErrorMessage } from '@/i18n/use-error-message';
import { useColors } from '@/theme/ThemeProvider';
import { fontSize, fontWeight, iconSize, radius, space } from '@/theme/tokens';
import type { ConversationSummary } from '../api';
import {
  useChatReportReasons,
  useReportConversation,
  useToggleChatBlock,
} from '../hooks/use-chat-moderation';

type Sheet = 'menu' | 'confirmBlock' | 'report' | null;

/**
 * Nút "..." ở thanh trên một hội thoại: chặn / bỏ chặn và báo cáo (App Store Guideline 1.2).
 * Bản native của `ThreadActions` web — cùng endpoint, cùng chữ, cùng luật (server quyết phía chặn).
 */
export function ChatThreadActions({ conversation }: { conversation: ConversationSummary }) {
  const t = useTranslations('Chat');
  const colors = useColors();
  const toast = useAppToast();
  const errorMessage = useErrorMessage();
  const toggleBlock = useToggleChatBlock(conversation.id);
  const [sheet, setSheet] = useState<Sheet>(null);
  // Tải sẵn lý do ngay khi mở hội thoại: mở tấm báo cáo là có danh sách, không phải chờ request.
  useChatReportReasons();

  const unblock = () => {
    setSheet(null);
    toggleBlock.mutate(false, {
      onSuccess: () => toast.showSuccess(t('unblockSuccess')),
      onError: (e) => toast.showError(errorMessage(e)),
    });
  };

  const block = () =>
    toggleBlock.mutate(true, {
      onSuccess: () => {
        setSheet(null);
        toast.showSuccess(t('blockSuccess'));
      },
      onError: (e) => toast.showError(errorMessage(e)),
    });

  return (
    <>
      <IconButton
        icon="ellipsis-vertical"
        label={t('moreActions')}
        onPress={() => setSheet('menu')}
        loading={toggleBlock.isPending}
      />

      <BottomSheet open={sheet === 'menu'} onClose={() => setSheet(null)} title={t('moreActions')}>
        <YStack gap={space.xs}>
          {conversation.blockedByMe ? (
            <ActionRow
              icon="lock-open-outline"
              label={t('unblock')}
              tone={colors.text}
              onPress={unblock}
            />
          ) : (
            <ActionRow
              icon="ban-outline"
              label={t('block')}
              tone={colors.danger}
              onPress={() => setSheet('confirmBlock')}
            />
          )}
          <ActionRow
            icon="flag-outline"
            label={t('report')}
            tone={colors.danger}
            onPress={() => setSheet('report')}
          />
        </YStack>
      </BottomSheet>

      <AlertDialog
        open={sheet === 'confirmBlock'}
        title={
          conversation.side === CHAT_SIDE.CUSTOMER ? t('blockShopTitle') : t('blockCustomerTitle')
        }
        message={t('blockConfirmBody')}
        confirmLabel={t('blockConfirm')}
        cancelLabel={t('cancel')}
        destructive
        loading={toggleBlock.isPending}
        onCancel={() => setSheet(null)}
        onConfirm={block}
      />

      <ReportSheet
        open={sheet === 'report'}
        conversationId={conversation.id}
        onClose={() => setSheet(null)}
      />
    </>
  );
}

/** Một dòng hành động trong tấm "...": đĩa icon + nhãn, cả dòng là vùng chạm. */
function ActionRow({
  icon,
  label,
  tone,
  onPress,
}: {
  icon: IconName;
  label: string;
  tone: string;
  onPress: () => void;
}) {
  const colors = useColors();
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress}>
      {({ pressed }) => (
        <XStack
          ai="center"
          gap={space.md}
          px={space.sm}
          py={space.sm}
          br={radius.md}
          bg={pressed ? colors.surfaceMuted : 'transparent'}
        >
          <IconDisc icon={icon} tone={tone} size={40} />
          <Text f={1} col={tone} fos={fontSize.body} fow={fontWeight.semibold}>
            {label}
          </Text>
          <Ionicons name="chevron-forward" size={iconSize.sm} color={colors.textMuted} />
        </XStack>
      )}
    </Pressable>
  );
}

function ReportSheet({
  open,
  conversationId,
  onClose,
}: {
  open: boolean;
  conversationId: string;
  onClose: () => void;
}) {
  const t = useTranslations('Chat');
  const colors = useColors();
  const toast = useAppToast();
  const errorMessage = useErrorMessage();
  const reasons = useChatReportReasons();
  const report = useReportConversation(conversationId);
  const [reasonId, setReasonId] = useState<string | null>(null);
  const [note, setNote] = useState('');

  // Đóng là xoá lựa chọn: lần mở sau là một báo cáo mới, không mang lựa chọn cũ sang.
  const close = () => {
    setReasonId(null);
    setNote('');
    onClose();
  };

  const submit = () => {
    if (!reasonId) return;
    report.mutate(
      { reasonId, ...(note.trim() ? { note: note.trim() } : {}) },
      {
        onSuccess: () => {
          toast.showSuccess(t('reportSuccess'));
          close();
        },
        onError: (e) => toast.showError(errorMessage(e)),
      },
    );
  };

  return (
    <BottomSheet
      open={open}
      onClose={close}
      title={t('reportTitle')}
      subtitle={t('reportIntro')}
      footer={
        <Button
          label={t('reportSubmit')}
          variant="danger"
          icon="send"
          block
          disabled={!reasonId}
          loading={report.isPending}
          onPress={submit}
        />
      }
    >
      <YStack gap={space.md}>
        <Text col={colors.text} fos={fontSize.bodySm} fow={fontWeight.semibold}>
          {t('reportReason')}
        </Text>
        {reasons.isPending ? (
          <YStack gap={space.sm}>
            <Skeleton height={44} />
            <Skeleton height={44} />
            <Skeleton height={44} />
          </YStack>
        ) : reasons.isError ? (
          <XStack ai="center" jc="space-between" gap={space.sm}>
            <Text f={1} col={colors.danger} fos={fontSize.bodySm}>
              {t('reportReasonsLoadError')}
            </Text>
            <Button label={t('retry')} variant="outline" size="sm" onPress={() => void reasons.refetch()} />
          </XStack>
        ) : reasons.data.length === 0 ? (
          <Text col={colors.textMuted} fos={fontSize.bodySm}>
            {t('reportReasonsEmpty')}
          </Text>
        ) : (
          <MenuOptionList>
            {reasons.data.map((r) => (
              <MenuOption
                key={r.id}
                label={r.label}
                selected={reasonId === r.id}
                onPress={() => setReasonId(r.id)}
              />
            ))}
          </MenuOptionList>
        )}
        <TextControl
          label={t('reportNoteLabel')}
          value={note}
          onChangeText={setNote}
          placeholder={t('reportNote')}
          maxLength={CHAT_REPORT_NOTE_MAX_LENGTH}
          multiline
          rows={3}
        />
      </YStack>
    </BottomSheet>
  );
}
