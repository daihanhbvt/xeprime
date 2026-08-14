'use client';

import {
  EnvironmentOutlined,
  MailOutlined,
  PhoneOutlined,
  ShopOutlined,
} from '@ant-design/icons';
import { Alert, Button, Card, Typography } from 'antd';
import { yupResolver } from '@hookform/resolvers/yup';
import { useForm } from 'react-hook-form';
import { TENANT_TYPE, TENANT_TYPE_LABEL, TENANT_TYPE_VALUES } from '@xeprime/types';
import { registerShopSchema, type RegisterShopValues } from '@xeprime/validators';
import { SelectField } from '@/components/form/SelectField';
import { TextField } from '@/components/form/TextField';
import { getErrorMessage } from '@/services/api-client';
import { useProvinceOptions } from '@/features/locations/hooks/use-provinces';
import { useRegisterShop } from '../hooks/use-shop';
import styles from './ShopRegistration.module.css';

const TYPE_OPTIONS = TENANT_TYPE_VALUES.map((value) => ({ value, label: TENANT_TYPE_LABEL[value] }));

/** Màn tạo gian hàng cho user chưa thuộc gian hàng nào. Đăng ký xong AppShell tự vào portal. */
export function ShopRegistration() {
  const register = useRegisterShop();

  const provinces = useProvinceOptions();

  const { control, handleSubmit } = useForm<RegisterShopValues>({
    resolver: yupResolver(registerShopSchema),
    defaultValues: {
      name: '',
      tenantType: TENANT_TYPE.INDIVIDUAL,
      provinceCode: '',
      address: '',
      phone: '',
      email: '',
    },
  });

  // `handleSubmit` giữ nguyên giá trị đã nhập khi mutation lỗi — RHF không reset form, nên người
  // dùng không phải gõ lại từ đầu (chỉ cần đọc thông báo lỗi rồi bấm lại).
  const onSubmit = handleSubmit((values) => {
    register.mutate({
      name: values.name,
      tenantType: values.tenantType,
      provinceCode: values.provinceCode,
      address: values.address || undefined,
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
        {/*
          Tỉnh/thành BẮT BUỘC: đăng ký tạo luôn chi nhánh mặc định, và đó là nơi xe của gian hàng
          hiển thị trên marketplace. Danh sách lấy từ API (`GET /provinces`), không hardcode.
        */}
        {provinces.isError ? (
          <Alert
            type="warning"
            showIcon
            className={styles.alert}
            message="Không tải được danh sách tỉnh/thành"
            description={getErrorMessage(provinces.error)}
            action={
              <Button size="small" onClick={provinces.refetch}>
                Thử lại
              </Button>
            }
          />
        ) : null}
        <SelectField
          control={control}
          name="provinceCode"
          label="Tỉnh/thành"
          required
          showSearch
          options={provinces.options}
          loading={provinces.isLoading}
          // Danh mục rỗng cũng khoá ô: một dropdown mở ra không có gì để chọn là điều khiển chết.
          disabled={provinces.isLoading || provinces.isError || provinces.options.length === 0}
          placeholder="Chọn tỉnh/thành"
          help={
            provinces.isLoading
              ? 'Đang tải tỉnh/thành…'
              : provinces.options.length === 0 && !provinces.isError
                ? 'Chưa có tỉnh/thành nào mở đăng ký — liên hệ hỗ trợ.'
                : 'Nơi đặt chi nhánh đầu tiên — khách sẽ tìm thấy xe của bạn ở tỉnh/thành này.'
          }
        />
        <TextField
          control={control}
          name="address"
          label="Địa chỉ"
          placeholder="Số nhà, đường, phường/xã"
          prefix={<EnvironmentOutlined />}
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
