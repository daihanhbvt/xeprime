'use client';

import { Card, Col, DatePicker, Result, Row, Spin, Statistic } from 'antd';
import type { Dayjs } from 'dayjs';
import { useState } from 'react';
import { ManagePageHeader } from '@/components/layout/ManagePageHeader';
import { useFinanceSummary } from '@/features/finance/hooks/use-finance-summary';
import { formatMoneyVnd } from '@/lib/money';
import styles from './finance-page.module.css';

const { RangePicker } = DatePicker;

export default function FinancePage() {
  const [range, setRange] = useState<[Dayjs, Dayjs] | null>(null);
  const from = range?.[0]?.startOf('day').toISOString();
  const to = range?.[1]?.endOf('day').toISOString();
  const { data, isLoading, isError, refetch } = useFinanceSummary(from, to);

  const balance = Number(data?.balance ?? 0);

  return (
    <div>
      <ManagePageHeader
        title="Tài chính"
        extra={
          <RangePicker
            value={range}
            onChange={(v) => setRange(v && v[0] && v[1] ? [v[0], v[1]] : null)}
            allowClear
            placeholder={['Từ ngày', 'Đến ngày']}
          />
        }
      />

      {isError ? (
        <Result status="error" title="Không tải được số liệu tài chính" extra={<a onClick={() => void refetch()}>Thử lại</a>} />
      ) : isLoading || !data ? (
        <div className={styles.center}>
          <Spin size="large" />
        </div>
      ) : (
        <Row gutter={[16, 16]}>
          <Col xs={24} sm={12} lg={6}>
            <Card>
              <Statistic title="Tổng thu" value={formatMoneyVnd(data.totalIncome)} valueStyle={{ color: '#389e0d' }} />
            </Card>
          </Col>
          <Col xs={24} sm={12} lg={6}>
            <Card>
              <Statistic title="Tổng chi" value={formatMoneyVnd(data.totalExpense)} valueStyle={{ color: '#cf1322' }} />
            </Card>
          </Col>
          <Col xs={24} sm={12} lg={6}>
            <Card>
              <Statistic
                title="Cân đối (thu − chi)"
                value={formatMoneyVnd(data.balance)}
                valueStyle={{ color: balance >= 0 ? '#389e0d' : '#cf1322' }}
              />
            </Card>
          </Col>
          <Col xs={24} sm={12} lg={6}>
            <Card>
              <Statistic
                title={`Công nợ (${data.debtBookings} đơn)`}
                value={formatMoneyVnd(data.totalDebt)}
                valueStyle={{ color: '#d48806' }}
              />
            </Card>
          </Col>
        </Row>
      )}

      <p className={styles.note}>
        Thu/chi tính từ các phiếu đã duyệt{range ? ' trong kỳ đã chọn' : ''}. Công nợ là tổng đơn còn nợ hiện tại.
      </p>
    </div>
  );
}
