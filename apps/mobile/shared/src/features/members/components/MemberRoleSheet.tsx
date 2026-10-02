import { useState } from 'react';
import { XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { ASSIGNABLE_TENANT_ROLES, type TenantRole } from '@xeprime/types';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Button } from '@/components/ui/Button';
import { RadioOption } from '@/components/ui/RadioOption';
import { useAppToast } from '@/components/feedback/use-app-toast';
import { useDomainLabel } from '@/i18n/domain';
import { useErrorMessage } from '@/i18n/use-error-message';
import { space } from '@/theme/tokens';
import type { Member } from '../api';
import { useUpdateMemberRole } from '../hooks/use-members';

/**
 * Đổi vai trò một thành viên.
 *
 * Web dùng một `<Select>` ngay trong ô của bảng; ở đây là tấm trượt vì hàng thẻ không có chỗ cho
 * một ô chọn, và vì đổi vai trò là hành động có hệ quả — nó đáng một bước xác nhận bằng chính
 * việc phải mở ra rồi bấm Lưu.
 *
 * Danh sách vai trò KHÔNG có chủ gian hàng: backend từ chối, và bày ra một lựa chọn chắc chắn
 * lỗi là bẫy người dùng.
 */
export function MemberRoleSheet({
  member,
  onClose,
}: {
  /** `null` = đóng. Gắn/tháo theo giá trị này để mỗi lần mở là state sạch. */
  member: Member | null;
  onClose: () => void;
}) {
  const t = useTranslations('Members');

  return (
    <BottomSheet
      open={member !== null}
      onClose={onClose}
      title={t('actions.changeRole')}
      subtitle={member?.displayName ?? ''}
    >
      {member ? <RoleForm key={member.userId} member={member} onDone={onClose} /> : null}
    </BottomSheet>
  );
}

function RoleForm({ member, onDone }: { member: Member; onDone: () => void }) {
  const t = useTranslations('Members');
  const tActions = useTranslations('Common.actions');
  const toast = useAppToast();
  const domainLabel = useDomainLabel();
  const errorMessage = useErrorMessage();
  const update = useUpdateMemberRole();

  const [roleKey, setRoleKey] = useState<TenantRole>(member.roleKey);

  const submit = () => {
    update.mutate(
      { userId: member.userId, roleKey },
      {
        onSuccess: () => {
          toast.showSuccess(t('toast.roleChanged'));
          onDone();
        },
        onError: (err) => toast.showError(errorMessage(err)),
      },
    );
  };

  return (
    <YStack gap={space.md}>
      <YStack gap={space.xs}>
        {ASSIGNABLE_TENANT_ROLES.map((role) => (
          <RadioOption
            key={role}
            label={domainLabel('tenantRole', role)}
            checked={roleKey === role}
            onPress={() => setRoleKey(role)}
          />
        ))}
      </YStack>

      <XStack gap={space.sm}>
        {/*
          Lối thoát bên TRÁI, hành động chính bên PHẢI — xếp dọc thì hàng dưới đọc ra là một
          bước tiếp theo chứ không phải một lựa chọn thay thế.
        
          "Đóng" co vừa chữ, nút chính lấy phần còn lại — xem luật ở `Button.tsx`. Chia đôi thì
          nửa hàng bên trái bỏ trống quá nửa cho một từ bốn chữ, còn nút chính thiếu chỗ.
        */}
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
            disabled={roleKey === member.roleKey}
            onPress={submit}
          />
        </YStack>
      </XStack>
    </YStack>
  );
}
