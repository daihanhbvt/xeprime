'use client';

import { Spin } from 'antd';
import { Suspense } from 'react';
import { BookingsListView } from '@/features/bookings/components/BookingsListView';
import styles from './bookings-page.module.css';

export default function BookingsPage() {
  // useBookingFilters đọc useSearchParams → cần Suspense trong route tĩnh (Next).
  return (
    <Suspense fallback={<Spin size="large" className={styles.state} />}>
      <BookingsListView />
    </Suspense>
  );
}
