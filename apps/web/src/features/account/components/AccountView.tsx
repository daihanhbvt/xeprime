'use client';

import {
  CheckOutlined,
  EditOutlined,
  ExclamationCircleFilled,
  MailOutlined,
  PhoneOutlined,
  PlusOutlined,
  SafetyCertificateOutlined,
  UserOutlined,
} from '@ant-design/icons';
import { Alert, App, Avatar, Button, Card, Spin, Tag, Tooltip } from 'antd';
import { useEffect, useState, type ReactNode } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { STATUS_COLOR } from '@xeprime/types';
import { accountProfileSchema, type AccountProfileValues } from '@xeprime/validators';
import { ImageUploadField } from '@/components/form/ImageUploadField';
import { TextField } from '@/components/form/TextField';
import { getErrorMessage } from '@/services/api-client';
import { presignAvatar } from '@/services/upload';
import { useMyProfile, useUpdateMyProfile } from '../hooks/use-account';
import { CONTACT_CHANNEL, type ContactChannel, type UserProfile } from '../types';
import { ContactVerifyModal } from './ContactVerifyModal';
import { ShopEntryCard } from './ShopEntryCard';
import styles from './AccountView.module.css';
import { useTranslations } from 'next-intl';
import { useErrorMessage } from '@/i18n/use-error-message';
import { useValidationResolver } from '@/i18n/use-validation-resolver';

/**
 * Trang gốc của khu tài khoản — hồ sơ của CON NGƯỜI đang đăng nhập.
 *
 * Không phải hồ sơ gian hàng (`/manage/shop`): người không có gian hàng vẫn phải sửa được tên
 * và ảnh của mình, còn chủ gian hàng thì sửa hồ sơ cá nhân ở ĐÂY chứ không phải ở cổng quản lý
 * (ADR 0014 — hai trang cùng ghi vào một hàng `users` là bug chờ sẵn).
 *
 * Cổng đăng nhập nằm ở `AccountShell`, không lặp lại ở đây; component này chỉ lo trạng thái
 * của chính truy vấn hồ sơ.
 */
export function AccountView() {
  const tCommon = useTranslations('Common');
  const errorMessage = useErrorMessage();
  const profile = useMyProfile();

  return (
    <>
      {profile.isLoading ? (
        <div className={styles.center}>
          <Spin size="large" />
        </div>
      ) : profile.isError ? (
        <div className={styles.center}>
          <Alert type="error" showIcon message={errorMessage(profile.error)} />
          <Button onClick={() => void profile.refetch()}>{tCommon('actions.retry')}</Button>
        </div>
      ) : profile.data ? (
        <>
          <ProfileForm profile={profile.data} />
          <ShopEntryCard />
        </>
      ) : null}
    </>
  );
}

function ProfileForm({ profile }: { profile: UserProfile }) {
  const t = useTranslations('Account');
  const tCommon = useTranslations('Common');
  const { message } = App.useApp();
  const update = useUpdateMyProfile();
  const [isEditing, setIsEditing] = useState(false);
  /** Kênh liên lạc đang được đổi — `null` là không có modal nào mở. */
  const [editingContact, setEditingContact] = useState<ContactChannel | null>(null);

  const resolver = useValidationResolver<AccountProfileValues>(
    accountProfileSchema,
    'Account.validation',
  );
  const { control, handleSubmit, reset, formState } = useForm<AccountProfileValues>({
    resolver,
    defaultValues: {
      displayName: profile.displayName,
      avatarUrl: profile.avatarUrl ?? null,
    },
  });

  // Hồ sơ được refetch (đổi ở tab khác, invalidate sau khi lưu) → nạp lại giá trị vào form,
  // nếu không người dùng sẽ nhìn thấy dữ liệu cũ trong ô nhập.
  useEffect(() => {
    reset({ displayName: profile.displayName, avatarUrl: profile.avatarUrl ?? null });
  }, [profile.displayName, profile.avatarUrl, reset]);

  // `useWatch` thay cho `watch()`: chỉ component này render lại khi hai field đó đổi, và nó là
  // API React Compiler memo hoá được (`watch()` trả hàm mới mỗi render nên bị bỏ qua).
  const avatarUrl = useWatch({ control, name: 'avatarUrl' });
  const displayName = useWatch({ control, name: 'displayName' });

  const onSubmit = handleSubmit((values) => {
    update.mutate(
      // `null` (không phải `undefined`) khi người dùng gỡ ảnh: `undefined` nghĩa là "không đụng
      // tới", nên gửi nó đi thì nút Xoá ảnh im lặng không làm gì.
      { displayName: values.displayName, avatarUrl: values.avatarUrl ?? null },
      {
        onSuccess: () => {
          message.success(t('saved'));
          setIsEditing(false);
        },
        onError: (err) => message.error(getErrorMessage(err)),
      },
    );
  });

  function cancelEditing() {
    reset({ displayName: profile.displayName, avatarUrl: profile.avatarUrl ?? null });
    setIsEditing(false);
  }

  return (
    <Card className={styles.card}>
      <div className={styles.inner}>
        <div className={styles.cardHead}>
          <div>
            <span className={styles.eyebrow}>
              <SafetyCertificateOutlined aria-hidden />
              {t('profile.eyebrow')}
            </span>
            {/* h1 của trang: vỏ `AccountShell` không còn tiêu đề chung, mỗi trang tự mang một h1. */}
            <h1 className={styles.title}>{t('profile.title')}</h1>
            <p className={styles.description}>{t('profile.description')}</p>
          </div>
          <Button
            icon={<EditOutlined />}
            onClick={() => setIsEditing(true)}
            disabled={isEditing || update.isPending}
          >
            {t('profile.edit')}
          </Button>
        </div>

        <div className={styles.profileGrid}>
          <section className={styles.summary} aria-label={t('profile.accountLabel')}>
            <Avatar size={104} src={avatarUrl || undefined} className={styles.avatar}>
              {initial(displayName || profile.displayName)}
            </Avatar>
            <div className={styles.name}>{displayName || profile.displayName}</div>
            <div className={styles.accountLabel}>{t('profile.accountLabel')}</div>
          </section>

          <dl className={styles.details}>
            <ContactRow
              icon={<MailOutlined aria-hidden />}
              label={t('profile.email')}
              value={profile.email}
              emptyLabel={t('noEmail')}
              verified={profile.emailVerified}
              onEdit={() => setEditingContact(CONTACT_CHANNEL.EMAIL)}
            />
            <ContactRow
              icon={<PhoneOutlined aria-hidden />}
              label={t('profile.phone')}
              value={profile.phone}
              emptyLabel={t('noPhone')}
              verified={profile.phoneVerified}
              onEdit={() => setEditingContact(CONTACT_CHANNEL.PHONE)}
            />
          </dl>
        </div>

        {isEditing ? (
          <form onSubmit={onSubmit} noValidate className={styles.form}>
            <div className={styles.fields}>
              <TextField
                control={control}
                name="displayName"
                label={t('displayName')}
                placeholder={t('displayNamePlaceholder')}
                autoComplete="name"
                prefix={<UserOutlined />}
                disabled={update.isPending}
              />
              {/*
                Ảnh đại diện đi ĐÚNG đường của mọi ảnh khác trong sản phẩm: chọn file → presign →
                PUT thẳng lên R2 → field nhận URL công khai. Ô dán URL trước đây bắt người dùng
                tự tìm một chỗ host ảnh, thứ gần như không ai làm — nên trên thực tế ảnh đại diện
                là một trường chết.
              */}
              <ImageUploadField
                control={control}
                name="avatarUrl"
                label={t('avatarUrl')}
                presign={presignAvatar}
                help={t('avatarHelp')}
              />
            </div>
            <div className={styles.formActions}>
              <Button onClick={cancelEditing} disabled={update.isPending}>
                {tCommon('actions.cancel')}
              </Button>
              <Button
                type="primary"
                htmlType="submit"
                loading={update.isPending}
                disabled={!formState.isDirty && !update.isPending}
              >
                {tCommon('actions.saveChanges')}
              </Button>
            </div>
          </form>
        ) : null}

        <div className={styles.securityNote}>
          <SafetyCertificateOutlined className={styles.securityIcon} aria-hidden />
          <div>
            <h3 className={styles.securityTitle}>{t('profile.securityTitle')}</h3>
            <p className={styles.securityDescription}>{t('profile.securityDescription')}</p>
          </div>
        </div>
      </div>

      {/*
        `key` theo kênh: modal giữ state của riêng nó (bước, mã đã gửi, đếm ngược), nên mở email
        ngay sau khi vừa đóng SĐT phải là một component mới chứ không phải cùng một cái đổi prop.
      */}
      {editingContact ? (
        <ContactVerifyModal
          key={editingContact}
          channel={editingContact}
          open
          onClose={() => setEditingContact(null)}
          current={editingContact === CONTACT_CHANNEL.EMAIL ? profile.email : profile.phone}
        />
      ) : null}
    </Card>
  );
}

/**
 * Một dòng liên lạc: giá trị + tình trạng xác thực + lối vào để đổi.
 *
 * Tình trạng xác thực luôn hiện khi đã có giá trị, kể cả khi CHƯA xác thực: một tài khoản tạo
 * bằng email/mật khẩu có email nhưng chưa ai chứng minh hộp thư đó tồn tại, và người dùng cần
 * thấy khoảng cách đó để biết còn việc phải làm — không thấy thì họ tưởng mình đã xong.
 */
function ContactRow({
  icon,
  label,
  value,
  emptyLabel,
  verified,
  onEdit,
}: {
  icon: ReactNode;
  label: string;
  value: string | null;
  emptyLabel: string;
  verified: boolean;
  onEdit: () => void;
}) {
  const t = useTranslations('Account');

  return (
    <div className={styles.detailRow}>
      <dt>
        {icon}
        {label}
      </dt>
      <dd>
        <span className={value ? styles.contactValue : styles.contactEmpty}>
          {value ?? emptyLabel}
        </span>
        {value && verified ? (
          <Tooltip title={t('verified')}>
            {/*
              Huy hiệu tự vẽ chứ không phải `CheckCircleFilled` tô màu: biểu tượng của AntD nhận
              màu bằng `color`, mà `color` là thuộc tính KẾ THỪA — nó nằm cùng chỗ với màu chữ
              của cả hàng, nên chỉ cần một quy tắc nào đó trúng phần tử trước là dấu tích lặng lẽ
              đen trở lại. Ở đây màu xanh nằm ở `background`, thứ không kế thừa từ đâu cả.
            */}
            <span className={styles.verifiedMark} role="img" aria-label={t('verified')}>
              <CheckOutlined aria-hidden />
            </span>
          </Tooltip>
        ) : null}
        {value && !verified ? (
          <Tag
            color={STATUS_COLOR.WARNING}
            className={styles.verified}
            icon={<ExclamationCircleFilled />}
          >
            {t('profile.unverified')}
          </Tag>
        ) : null}
        <Button
          size="small"
          type="link"
          icon={value ? <EditOutlined /> : <PlusOutlined />}
          onClick={onEdit}
          aria-label={value ? t('contact.changeAria', { field: label }) : t('contact.addAria', { field: label })}
        >
          {value ? t('contact.change') : t('contact.add')}
        </Button>
      </dd>
    </div>
  );
}

function initial(name: string): string {
  return name.trim().charAt(0).toUpperCase() || 'K';
}
