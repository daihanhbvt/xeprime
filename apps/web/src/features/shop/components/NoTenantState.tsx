'use client';

import { ArrowLeftOutlined, ShopOutlined } from '@ant-design/icons';
import { Button } from 'antd';
import Link from 'next/link';
import { Logo } from '@/components/brand/Logo';
import { ROUTES } from '@/constants/routes';
import styles from './NoTenantState.module.css';

/**
 * User đã đăng nhập nhưng chưa thuộc gian hàng nào và cũng không phải nhân sự nền tảng.
 *
 * Đây là màn thay cho hành vi cũ — trước kia `AppShell` render THẲNG form tạo gian hàng, biến
 * "chưa có shop" thành một lỗi phải sửa ngay và khiến khách thuê xe tưởng mình buộc phải mở
 * shop. Không có gian hàng là trạng thái HỢP LỆ: tài khoản đó vẫn đặt xe bình thường.
 */
export function NoTenantState({ onLogout }: { onLogout?: () => void }) {
  return (
    <div className={styles.wrap}>
      <div className={styles.card}>
        <Logo size="lg" />
        <ShopOutlined className={styles.icon} />
        <h1 className={styles.title}>Bạn chưa có gian hàng</h1>
        <p className={styles.desc}>
          Tài khoản hiện tại vẫn có thể dùng để tìm và đặt xe. Bạn chỉ cần đăng ký gian hàng nếu
          muốn cho thuê xe.
        </p>

        <div className={styles.actions}>
          <Link href={ROUTES.MANAGE.ONBOARDING} className={styles.actionLink}>
            <Button type="primary" size="large" block icon={<ShopOutlined />}>
              Đăng ký trở thành chủ xe
            </Button>
          </Link>
          <Link href={ROUTES.HOME} className={styles.actionLink}>
            <Button size="large" block icon={<ArrowLeftOutlined />}>
              Quay lại tìm xe
            </Button>
          </Link>
        </div>

        {onLogout ? (
          <Button type="text" className={styles.logout} onClick={onLogout}>
            Đăng xuất
          </Button>
        ) : null}
      </div>
    </div>
  );
}
