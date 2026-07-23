import type { Metadata } from 'next';
import { Card, Empty } from 'antd';

export const metadata: Metadata = { title: 'Quản trị nền tảng' };

export default function Page() {
  return (
    <Card title="Quản trị nền tảng">
      <Empty description="Sẽ implement ở phase sau — xem lộ trình ở CLAUDE.md mục 11." />
    </Card>
  );
}
