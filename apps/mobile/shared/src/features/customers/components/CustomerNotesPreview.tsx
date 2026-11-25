import { useState } from 'react';
import { Pressable } from 'react-native';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { TENANT_CUSTOMER_NOTE_TYPE } from '@xeprime/types';
import { LineIcon } from '@/components/icons/LineIcon';
import { AlertDialog } from '@/components/ui/AlertDialog';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Card } from '@/components/ui/Card';
import { SkeletonText } from '@/components/ui/Skeleton';
import { useAppToast } from '@/components/feedback/use-app-toast';
import { useDomainLabel } from '@/i18n/domain';
import { useErrorMessage } from '@/i18n/use-error-message';
import { FIRST_PAGE } from '@/queries/use-clamped-page';
import { useColors } from '@/theme/ThemeProvider';
import { fontWeight, space, typeScale } from '@/theme/tokens';
import { useCustomerNotes, useDeleteCustomerNote } from '../hooks/use-customers';
import { CustomerNotesPanel } from './CustomerNotesPanel';

/** Figma "Operational note" `24486:63423`: nền `bg/gray-50` bo 10, đệm 12; chữ 14/20 `text/gray/medium`. */
const NOTE_RADIUS = 10;
const NOTE_PAD = 12;
/** Figma: tiêu đề cách ô xem trước 12 (thang `space` không có 12). */
const SECTION_GAP = 12;

/**
 * Thẻ "Ghi chú vận hành" của tab Tổng quan - Figma `24486:63381`: tiêu đề + link "+ Thêm ghi chú", dưới
 * là MỘT ô xem trước ghi chú MỚI NHẤT: viên MÀU của loại ghi chú ở ngoài (cùng màu như trong danh sách),
 * nút "Xoá" (có quyền sửa sổ khách và hồ sơ chưa lưu trữ - hỏi xác nhận như trong tấm đầy đủ), nội dung,
 * dòng người ghi. Link mở tấm trượt có đủ danh sách và form thêm (`CustomerNotesPanel`) - quyền và quy
 * tắc giữ nguyên (người dùng 25/11/2026). Không có quyền thêm thì link là "Xem đầy đủ".
 */
export function CustomerNotesPreview({
  customerId,
  canManage,
  disabled,
}: {
  customerId: string;
  canManage: boolean;
  disabled: boolean;
}) {
  const colors = useColors();
  const t = useTranslations('Customers');
  const tApp = useTranslations('Customers.app.detail.notes');
  const tCommon = useTranslations('Common.actions');
  const domainLabel = useDomainLabel();
  const errorMessage = useErrorMessage();
  const toast = useAppToast();
  const remove = useDeleteCustomerNote();
  const [open, setOpen] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const { data, isLoading } = useCustomerNotes(customerId, FIRST_PAGE);
  const notes = data?.items ?? [];
  const removingNote = notes.find((note) => note.id === removingId);
  const canAdd = canManage && !disabled;

  return (
    <>
      <Card>
        <YStack gap={SECTION_GAP}>
          <XStack ai="center" jc="space-between" gap={space.sm}>
            <Text
              f={1}
              minWidth={0}
              col={colors.text}
              fos={typeScale.title.fontSize}
              lh={typeScale.title.lineHeight}
              fow={fontWeight.semibold}
              numberOfLines={1}
            >
              {t('profile.notes.title')}
            </Text>
            {canAdd ? (
            <Pressable
              onPress={() => setOpen(true)}
              accessibilityRole="button"
              accessibilityLabel={tApp('add')}
              hitSlop={8}
            >
              <XStack ai="center" gap={6}>
                <LineIcon name="plus" size={20} color={colors.brandLink} />
                <Text
                  col={colors.brandLink}
                  fos={typeScale.body.fontSize}
                  lh={typeScale.body.lineHeight}
                  fow={fontWeight.semibold}
                >
                  {tApp('add')}
                </Text>
              </XStack>
            </Pressable>
            ) : null}
          </XStack>

          {isLoading && !data ? (
            <YStack p={NOTE_PAD} br={NOTE_RADIUS} bg={colors.background}>
              <SkeletonText lines={2} />
            </YStack>
          ) : notes.length > 0 ? (
            notes.map((note) => {
              return (
                <XStack key={note.id} gap={space.sm} p={NOTE_PAD} br={NOTE_RADIUS} bg={colors.background} ai="flex-start">
                  <YStack f={1} minWidth={0} gap={space.xs}>
                    <Text
                      col={note.noteType === TENANT_CUSTOMER_NOTE_TYPE.RISK ? colors.danger : colors.text}
                      fos={typeScale.body.fontSize}
                      lh={typeScale.body.lineHeight}
                      fow={fontWeight.medium}
                    >
                      {domainLabel('tenantCustomerNoteType', note.noteType)}
                    </Text>
                    <Text col={colors.textMuted} fos={typeScale.body.fontSize} lh={typeScale.body.lineHeight}>
                      {note.body}
                    </Text>
                  </YStack>
                  {canAdd ? (
                    <Pressable
                      onPress={() => setRemovingId(note.id)}
                      accessibilityRole="button"
                      accessibilityLabel={tCommon('delete')}
                      hitSlop={8}
                    >
                      <LineIcon name="trash" size={20} color={colors.danger} />
                    </Pressable>
                  ) : null}
                </XStack>
              );
            })
          ) : (
            <YStack p={NOTE_PAD} br={NOTE_RADIUS} bg={colors.background}>
              <Text col={colors.placeholder} fos={typeScale.body.fontSize} lh={typeScale.body.lineHeight}>
                {t('notes.emptyTitle')}
              </Text>
            </YStack>
          )}
        </YStack>
      </Card>

      <BottomSheet
        open={open}
        onClose={() => setOpen(false)}
        title={tApp('add')}
        chrome="v2"
        headerDivider
      >
        <CustomerNotesPanel
          customerId={customerId}
          canManage={canManage}
          disabled={disabled}
          addOnly
          onAdded={() => setOpen(false)}
        />
      </BottomSheet>

      <AlertDialog
        open={removingNote !== undefined}
        title={t('notes.removeTitle')}
        confirmLabel={t('notes.removeOk')}
        cancelLabel={tCommon('close')}
        destructive
        actionsRow
        loading={remove.isPending}
        onCancel={() => setRemovingId(null)}
        onConfirm={() => {
          if (!removingNote) return;
          remove.mutate(
            { id: customerId, noteId: removingNote.id },
            {
              onSuccess: () => {
                toast.showSuccess(t('notes.removed'));
                setRemovingId(null);
              },
              onError: (err) => {
                toast.showError(errorMessage(err));
                setRemovingId(null);
              },
            },
          );
        }}
      />
    </>
  );
}
