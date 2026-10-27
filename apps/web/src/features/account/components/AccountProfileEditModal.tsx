'use client';

import { UserOutlined } from '@ant-design/icons';
import { Form, Modal } from 'antd';
import { useTranslations } from 'next-intl';

import { TextField } from '@/components/form/TextField';
import { CtaButton } from '@/features/marketplace/components/CtaButton';

import { useAccountProfileForm } from '../hooks/use-account-profile-form';
import type { UserProfile } from '../types';
import styles from './AccountProfileEditModal.module.css';
import { ProfileAvatarPicker } from './ProfileAvatarPicker';

/**
 * Hộp thoại "Cập nhật thông tin" — design Account / Profile - Edit Info (Figma `20063:65207`):
 * ảnh đại diện vuông + họ tên hiển thị (nhãn TRÊN ô), Hủy / Xác nhận ở chân, hai vạch ngăn đầu/chân.
 *
 * Ô "Tên gợi nhớ" của bản vẽ cố ý KHÔNG có: tài khoản không có trường đó, và một ô lưu không đi
 * đâu là lời hứa suông.
 *
 * Form là của `useAccountProfileForm` — cùng schema, giá trị khởi tạo và thân request với trang
 * Tài khoản & bảo mật của site partner. Đóng hộp (Hủy, ✕, Esc, lưu xong) luôn trả form về giá trị
 * đã lưu: mở lại không được thấy bản nháp bỏ dở lần trước.
 */
export function AccountProfileEditModal({
  profile,
  open,
  onClose,
}: {
  profile: UserProfile;
  open: boolean;
  onClose: () => void;
}) {
  const t = useTranslations('Account');
  const tCommon = useTranslations('Common');

  const { form, submit, revert, saving } = useAccountProfileForm(profile, { onSaved: onClose });
  const { control, formState } = form;

  function close() {
    // Đang lưu thì không đóng ngang: kết quả về sau sẽ toast cho một hộp đã biến mất.
    if (saving) return;
    onClose();
  }

  return (
    <Modal
      open={open}
      title={t('profile.update')}
      onCancel={close}
      afterClose={revert}
      width={480}
      classNames={{
        container: styles.container,
        header: styles.header,
        body: styles.body,
        footer: styles.footer,
      }}
      maskClosable={!saving}
      footer={
        <div className={styles.actions}>
          <CtaButton variant="neutral" size="form" onClick={close} disabled={saving}>
            {tCommon('actions.cancel')}
          </CtaButton>
          <CtaButton
            size="form"
            className={styles.confirm}
            loading={saving}
            disabled={!formState.isDirty}
            // Chân Modal nằm NGOÀI thẻ <form>, nên nút gọi thẳng `submit` (hàm đó tự chặn lượt
            // thứ hai khi đang lưu); Enter trong ô họ tên vẫn gửi qua `onSubmit` của form.
            onClick={() => void submit()}
          >
            {tCommon('actions.confirm')}
          </CtaButton>
        </div>
      }
    >
      <form onSubmit={submit} noValidate className={styles.form}>
        <ProfileAvatarPicker control={control} fallbackName={profile.displayName} disabled={saving} />
        {/* Nhãn TRÊN ô như bản vẽ — `component={false}` để không lồng thêm một <form>. */}
        <Form component={false} layout="vertical" colon={false}>
          <TextField
            control={control}
            name="displayName"
            label={t('profileEdit.displayName')}
            placeholder={t('displayNamePlaceholder')}
            autoComplete="name"
            prefix={<UserOutlined />}
            disabled={saving}
          />
        </Form>
      </form>
    </Modal>
  );
}
