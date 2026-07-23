'use client';

import { Card, Col, Row, Statistic } from 'antd';
import Link from 'next/link';
import { ROUTES } from '@/constants/routes';
import { useCurrentUser } from '@/hooks/use-current-user';

export default function ManageDashboardPage() {
  const { data } = useCurrentUser();

  return (
    <Row gutter={[16, 16]}>
      <Col xs={24} md={8}>
        <Card>
          <Statistic title="Gian hàng" value={data?.tenant?.name ?? '—'} />
        </Card>
      </Col>
      <Col xs={24} md={8}>
        <Card>
          <Statistic title="Vai trò" value={data?.tenant?.roleKey ?? data?.platformRole ?? '—'} />
        </Card>
      </Col>
      <Col xs={24} md={8}>
        <Card>
          <Statistic title="Số quyền được cấp" value={data?.permissions.length ?? 0} />
        </Card>
      </Col>
      <Col span={24}>
        <Card title="Phase 0">
          <p>
            Base source đã dựng xong. Số liệu dashboard thật sẽ nối ở Phase 1–4. Màn chạy được
            hiện tại: <Link href={ROUTES.MANAGE.CALENDAR}>Lịch thuê xe</Link>.
          </p>
        </Card>
      </Col>
    </Row>
  );
}
