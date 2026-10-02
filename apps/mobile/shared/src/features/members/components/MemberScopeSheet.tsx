import { useState } from 'react';
import { XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Button } from '@/components/ui/Button';
import { useAppToast } from '@/components/feedback/use-app-toast';
import { useErrorMessage } from '@/i18n/use-error-message';
import { space } from '@/theme/tokens';
import type { Member } from '../api';
import { toBranchScopeInput, toBranchSelection, useBranchScopeOptions } from '../branch-scope';
import { useUpdateMemberRole } from '../hooks/use-members';
import { BranchScopePicker } from './BranchScopePicker';

/**
 * Đổi chi nhánh phụ trách của MỘT thành viên (ADR 0052).
 *
 * Web commit khi đóng dropdown; ở đây là tấm trượt + nút Lưu — cùng ý: chọn xong cả loạt rồi MỘT
 * lượt ghi. PATCH CHỈ mang `branchScope`/`branchIds`, KHÔNG `roleKey`: gửi vai trò đang nằm trong
 * cache có thể ghi đè một lượt hạ vai vừa đi mà chưa refetch xong.
 */
export function MemberScopeSheet({
  member,
  onClose,
}: {
  member: Member | null;
  onClose: () => void;
}) {
  const t = useTranslations('Members');

  return (
    <BottomSheet
      open={member !== null}
      onClose={onClose}
      title={t('form.branches')}
      subtitle={member?.displayName ?? ''}
    >
      {member ? <ScopeForm key={member.userId} member={member} onDone={onClose} /> : null}
    </BottomSheet>
  );
}

function ScopeForm({ member, onDone }: { member: Member; onDone: () => void }) {
  const t = useTranslations('Members');
  const tActions = useTranslations('Common.actions');
  const toast = useAppToast();
  const errorMessage = useErrorMessage();
  const update = useUpdateMemberRole();
  const scope = useBranchScopeOptions();

  const saved = toBranchSelection(member.branchIds);
  const [selection, setSelection] = useState<string[]>(saved);
  const unchanged = [...saved].sort().join(',') === [...selection].sort().join(',');

  const submit = () => {
    update.mutate(
      { userId: member.userId, ...toBranchScopeInput(selection) },
      {
        onSuccess: () => {
          toast.showSuccess(t('toast.scopeChanged'));
          onDone();
        },
        onError: (err) => toast.showError(errorMessage(err)),
      },
    );
  };

  return (
    <YStack gap={space.md}>
      <BranchScopePicker
        label={t('columns.branchScope')}
        value={selection}
        options={scope.options}
        allowAll={scope.allowAll}
        hint={t(scope.allowAll ? 'form.branchesHelp' : 'form.branchesHelpLimited')}
        {...(selection.length === 0 ? { error: t('form.errors.branchRequired') } : {})}
        onChange={setSelection}
      />

      <XStack gap={space.sm}>
        <YStack flexShrink={0}>
          <Button
            label={tActions('close')}
            variant="ghost"
            disabled={update.isPending}
            onPress={onDone}
          />
        </YStack>
        <YStack f={1}>
          <Button
            label={tActions('save')}
            icon="checkmark-outline"
            loading={update.isPending}
            // Người bị giới hạn gỡ hết chi nhánh: rỗng là xin "toàn gian hàng" — không cho lưu.
            disabled={unchanged || selection.length === 0}
            onPress={submit}
          />
        </YStack>
      </XStack>
    </YStack>
  );
}
