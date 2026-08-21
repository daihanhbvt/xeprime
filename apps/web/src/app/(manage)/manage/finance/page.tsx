'use client';

import { Card, Col, DatePicker, Result, Row, Spin, Statistic } from 'antd';
import type { Dayjs } from 'dayjs';
import { useState } from 'react';
import { ManagePageHeader } from '@/components/layout/ManagePageHeader';
import { useFinanceSummary } from '@/features/finance/hooks/use-finance-summary';
import styles from './finance-page.module.css';
import { useAppFormat } from '@/i18n/use-app-format';

const { RangePicker } = DatePicker;

export default function FinancePage() {
  const fmt = useAppFormat();

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
              <Statistic
                className={styles.income}
                title="Tổng thu"
                value={fmt.money(data.totalIncome)}
              />
            </Card>
          </Col>
          <Col xs={24} sm={12} lg={6}>
            <Card>
              <Statistic
                className={styles.expense}
                title="Tổng chi"
                value={fmt.money(data.totalExpense)}
              />
            </Card>
          </Col>
          <Col xs={24} sm={12} lg={6}>
            <Card>
              <Statistic
                className={balance >= 0 ? styles.income : styles.expense}
                title="Cân đối (thu − chi)"
                value={fmt.money(data.balance)}
              />
            </Card>
          </Col>
          <Col xs={24} sm={12} lg={6}>
            <Card>
              <Statistic
                className={styles.debt}
                title={`Công nợ (${data.debtBookings} đơn)`}
                value={fmt.money(data.totalDebt)}
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
