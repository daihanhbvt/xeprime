import type { Metadata } from 'next';
import { Card, Empty } from 'antd';

export const metadata: Metadata = { title: 'Xe' };

export default function Page() {
  return (
    <Card title="Xe">
      <Empty description="Sẽ implement ở phase sau — xem lộ trình ở CLAUDE.md mục 11." />
    </Card>
  );
}
