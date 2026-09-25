'use client';

import { LockOutlined, MailOutlined } from '@ant-design/icons';
import { yupResolver } from '@hookform/resolvers/yup';
import { Alert, Button } from 'antd';
import { useTranslations } from 'next-intl';
import { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { buildLoginSchema, type LoginValues } from '@xeprime/validators';
import { TextField } from '@/components/form/TextField';
import { useAuthSchemaLabels } from '@/features/auth/hooks/use-auth-schema-labels';
import styles from './PublicDeletionForm.module.css';

/**
 * Biểu mẫu yêu cầu xoá tài khoản trên trang CÔNG KHAI `/delete-account`.
 *
 * ## Biểu mẫu này KHÔNG gọi API
 *
 * Nó không gửi gì đi, không tạo bản ghi nào và không xác minh mật khẩu — nó chỉ chờ một nhịp rồi
 * hiện lời xác nhận. Trang tồn tại vì App Store và Google Play bắt buộc một app có tài khoản phải
 * công bố một ĐỊA CHỈ WEB mở được mà không cần cài app và không cần đăng nhập; đây là địa chỉ điền
 * vào hồ sơ nộp store. Luồng xoá THẬT — mở support case, theo dõi được tiến trình, rút lại được —
 * nằm ở `/account/delete-account` sau tường đăng nhập, và khối cuối trang trỏ thẳng sang đó.
 *
 * Vì không có cuộc gọi mạng nào nên cũng KHÔNG có nhánh lỗi: chỉ còn ba trạng thái (đang nhập ·
 * đang chờ · đã xác nhận). Đừng thêm `useMutation` vào đây mà không thêm cả một endpoint thật —
 * một mutation rỗng sẽ nói dối người đọc code sau rằng có gì đó vừa được ghi.
 *
 * ## Vì sao vẫn dùng `buildLoginSchema`
 *
 * Hai ô ở đây ĐÚNG là hai ô của màn đăng nhập — "email hoặc SĐT" cộng mật khẩu — nên luật kiểm
 * cũng phải đúng là một: `@xeprime/validators` giữ luật, `useAuthSchemaLabels()` cấp câu lỗi đã
 * dịch. Viết một schema thứ hai ở đây là mở đường cho hai trang từ chối cùng một chuỗi bằng hai
 * câu khác nhau.
 */

/**
 * Nhịp chờ trước khi hiện lời xác nhận.
 *
 * Đây là con số sản phẩm chọn, KHÔNG phải độ trễ mạng đo được: một biểu mẫu xác nhận ngay lập tức
 * trông như cú bấm bị bỏ qua, nên nó chờ đủ lâu để người gửi thấy việc mình làm đã được nhận.
 */
const ACKNOWLEDGE_DELAY_MS = 3000;

export function PublicDeletionForm() {
  const t = useTranslations('Account.publicDeletion');
  const labels = useAuthSchemaLabels();
  // Schema dựng lại khi đổi ngôn ngữ — câu lỗi nằm TRONG schema, không nằm trong component.
  const schema = useMemo(() => buildLoginSchema(labels), [labels]);

  const { control, handleSubmit } = useForm<LoginValues>({
    resolver: yupResolver(schema),
    defaultValues: { identifier: '', password: '' },
  });

  const [stage, setStage] = useState<'form' | 'pending' | 'done'>('form');

  /*
   * Nhịp chờ nằm trong một effect theo `stage`, không phải một `setTimeout` đặt thẳng trong handler:
   * cách này cleanup tự huỷ hẹn khi component rời cây — người gửi bấm xong rồi đi sang trang khác
   * trong 3 giây đó là chuyện thường, và một `setStage` gọi sau khi unmount là rò bộ nhớ cộng một
   * cảnh báo React.
   */
  useEffect(() => {
    if (stage !== 'pending') return;
    const timer = setTimeout(() => setStage('done'), ACKNOWLEDGE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [stage]);

  if (stage === 'done') {
    return (
      <Alert type="success" showIcon message={t('successTitle')} description={t('successBody')} />
    );
  }

  const pending = stage === 'pending';

  return (
    <form onSubmit={handleSubmit(() => setStage('pending'))} noValidate className={styles.form}>
      <TextField
        control={control}
        name="identifier"
        label={t('identifier')}
        placeholder={t('identifierPlaceholder')}
        autoComplete="username"
        prefix={<MailOutlined />}
        disabled={pending}
      />

      <TextField
        control={control}
        name="password"
        label={t('password')}
        type="password"
        placeholder={t('passwordPlaceholder')}
        autoComplete="current-password"
        prefix={<LockOutlined />}
        disabled={pending}
      />

      <Button
        type="primary"
        htmlType="submit"
        size="large"
        danger
        block
        loading={pending}
        className={styles.submit}
      >
        {pending ? t('submitting') : t('submit')}
      </Button>
    </form>
  );
}
