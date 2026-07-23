import type { Metadata } from 'next';
import { Card, Empty } from 'antd';

export const metadata: Metadata = { title: 'Đơn thuê' };

export default function Page() {
  return (
    <Card title="Đơn thuê">
      <Empty description="Sẽ implement ở phase sau — xem lộ trình ở CLAUDE.md mục 11." />
    </Card>
  );
}
