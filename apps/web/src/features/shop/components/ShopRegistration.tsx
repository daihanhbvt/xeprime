'use client';

import { MailOutlined, PhoneOutlined, ShopOutlined } from '@ant-design/icons';
import { Alert, Button, Card, Typography } from 'antd';
import { yupResolver } from '@hookform/resolvers/yup';
import { useForm } from 'react-hook-form';
import { TENANT_TYPE, TENANT_TYPE_LABEL, TENANT_TYPE_VALUES } from '@xeprime/types';
import { registerShopSchema, type RegisterShopValues } from '@xeprime/validators';
import { SelectField } from '@/components/form/SelectField';
import { TextField } from '@/components/form/TextField';
import { getErrorMessage } from '@/services/api-client';
import { useRegisterShop } from '../hooks/use-shop';
import styles from './ShopRegistration.module.css';

const TYPE_OPTIONS = TENANT_TYPE_VALUES.map((value) => ({ value, label: TENANT_TYPE_LABEL[value] }));

/** Màn tạo gian hàng cho user chưa thuộc gian hàng nào. Đăng ký xong AppShell tự vào portal. */
export function ShopRegistration() {
  const register = useRegisterShop();

  const { control, handleSubmit } = useForm<RegisterShopValues>({
    resolver: yupResolver(registerShopSchema),
    defaultValues: { name: '', tenantType: TENANT_TYPE.INDIVIDUAL, phone: '', email: '' },
  });

  const onSubmit = handleSubmit((values) => {
    register.mutate({
      name: values.name,
      tenantType: values.tenantType,
      phone: values.phone || undefined,
      email: values.email || undefined,
    });
  });

  return (
    <Card className={styles.card}>
      <div className={styles.head}>
        <ShopOutlined className={styles.icon} />
        <div>
          <Typography.Title level={4} className={styles.title}>
            Tạo gian hàng
          </Typography.Title>
          <Typography.Text type="secondary">
            Đăng ký gian hàng để bắt đầu cho thuê xe. Hồ sơ sẽ được nền tảng duyệt trước khi lên
            marketplace.
          </Typography.Text>
        </div>
      </div>

      {register.isError ? (
        <Alert
          type="error"
          showIcon
          message={getErrorMessage(register.error)}
          className={styles.alert}
        />
      ) : null}

      <form onSubmit={onSubmit} noValidate>
        <TextField
          control={control}
          name="name"
          label="Tên gian hàng"
          placeholder="VD: Cho thuê xe Bình Minh"
          prefix={<ShopOutlined />}
          autoFocus
        />
        <SelectField
          control={control}
          name="tenantType"
          label="Loại hình"
          options={TYPE_OPTIONS}
        />
        <TextField
          control={control}
          name="phone"
          label="Số điện thoại"
          placeholder="0901234567"
          prefix={<PhoneOutlined />}
        />
        <TextField
          control={control}
          name="email"
          label="Email liên hệ"
          type="email"
          placeholder="lienhe@gianhang.vn"
          prefix={<MailOutlined />}
        />
        <Button
          type="primary"
          htmlType="submit"
          block
          size="large"
          className={styles.submit}
          loading={register.isPending}
        >
          Tạo gian hàng
        </Button>
      </form>
    </Card>
  );
}
