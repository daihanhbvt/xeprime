import { cleanup, render, screen, within } from '@testing-library/react';
import type { UseQueryResult } from '@tanstack/react-query';
import { afterEach, describe, expect, it } from 'vitest';
import type { FinanceSeries, FinanceSourceBreakdown } from '@/features/finance/types';
import { RevenueCard } from './TrendCards';

/**
 * "Thu chi 30 ngày" của trang Tổng quan - phần NGUỒN ĐƠN (ADR 0110): tỷ trọng sàn / nguồn ngoài,
 * mỗi dòng mở màn Tổng quan doanh thu đúng góc nhìn, cột doanh thu chồng theo nguồn.
 */

afterEach(cleanup);

function query<T>(data: T | undefined, over: Partial<UseQueryResult<T>> = {}): UseQueryResult<T> {
  return {
    data,
    isPending: data === undefined && !over.isError,
    isError: false,
    refetch: () => Promise.resolve(),
    ...over,
  } as UseQueryResult<T>;
}

const series: FinanceSeries = {
  granularity: 'day',
  buckets: [
    {
      bucket: '2026-11-20',
      revenue: '1500000',
      cost: '200000',
      profit: '1300000',
      marketplaceRevenue: '500000',
      directRevenue: '700000',
      unlinkedRevenue: '300000',
    },
  ],
} as FinanceSeries;

const breakdown: FinanceSourceBreakdown = {
  total: '1500000',
  marketplaceAmount: '500000',
  directAmount: '700000',
  unlinkedAmount: '300000',
  items: [
    {
      source: 'xeprime',
      sourceLabel: null,
      amount: '500000',
      sharePercent: 33.3,
      trips: 2,
      bookedAmount: '0',
    },
    {
      source: 'social',
      sourceLabel: null,
      amount: '700000',
      sharePercent: 46.7,
      trips: 1,
      bookedAmount: '0',
    },
    {
      source: null,
      sourceLabel: null,
      amount: '300000',
      sharePercent: 20,
      trips: 0,
      bookedAmount: '0',
    },
  ],
};

const detailHref = (view: string | null) =>
  `/manage/finance${view ? `?revenueSource=${view}` : ''}`;

describe('RevenueCard - doanh thu theo nguồn', () => {
  it('mỗi nguồn một dòng: số chuyến, tiền, tỷ trọng; dòng mở đúng góc nhìn', () => {
    render(
      <RevenueCard series={query(series)} bySource={query(breakdown)} detailHref={detailHref} />,
    );

    const list = screen.getByRole('list', { name: 'Chú giải nguồn doanh thu' });
    const links = within(list).getAllByRole('link');
    expect(links).toHaveLength(3);
    expect(links[0]!.textContent).toContain('Qua XePrime');
    expect(links[0]!.textContent).toContain('2 chuyến');
    expect(links[0]!.textContent).toContain('500.000 ₫');
    expect(links[0]!.getAttribute('href')).toBe('/manage/finance?revenueSource=xeprime');
    expect(links[1]!.getAttribute('href')).toBe('/manage/finance?revenueSource=direct');
    // Thu không gắn đơn: không có chuyến, mở góc nhìn mọi nguồn.
    expect(links[2]!.textContent).not.toContain('chuyến');
    expect(links[2]!.getAttribute('href')).toBe('/manage/finance');
    expect(screen.getByRole('link', { name: 'Xem chi tiết' }).getAttribute('href')).toBe(
      '/manage/finance',
    );
  });

  it('kỳ chưa có doanh thu ⇒ khối nguồn vắng, không hiện ba dòng 0đ', () => {
    render(
      <RevenueCard
        series={query(series)}
        bySource={query({ ...breakdown, total: '0', items: [] })}
        detailHref={detailHref}
      />,
    );
    expect(screen.queryByRole('list', { name: 'Chú giải nguồn doanh thu' })).toBeNull();
  });

  it('không tải được nguồn ⇒ một dòng báo lỗi, phần thu chi vẫn hiện', () => {
    render(
      <RevenueCard
        series={query(series)}
        bySource={query<FinanceSourceBreakdown>(undefined, { isError: true, isPending: false })}
        detailHref={detailHref}
      />,
    );
    expect(screen.getByText('Chưa tải được doanh thu theo nguồn.')).toBeTruthy();
    expect(screen.getAllByText('1.500.000 ₫').length).toBeGreaterThan(0);
  });
});
