'use client';

import {
  ArrowDownOutlined,
  ArrowUpOutlined,
  DeleteOutlined,
  EditOutlined,
  PlusOutlined,
} from '@ant-design/icons';
import { App, Button, Tag } from 'antd';
import { useState } from 'react';
import { DataTable, actionColumn, type DataTableColumn } from '@/components/data-display/DataTable';
import { ManagePageHeader } from '@/components/layout/ManagePageHeader';
import { formatDateTime } from '@/lib/datetime';
import { getErrorMessage } from '@/services/api-client';
import { BannerFormModal } from '@/features/banners/components/BannerFormModal';
import {
  useAdminBanners,
  useDeleteBanner,
  useReorderBanners,
  useUpdateBanner,
} from '@/features/banners/use-admin-banners';
import type { AdminBanner } from '@/features/banners/types';
import styles from './banners-page.module.css';

const MIN_TABLE_WIDTH = 960;

/**
 * Quản lý banner hero trang chủ — nơi DUY NHẤT tạo/sửa nội dung carousel công khai.
 *
 * Trang chủ chỉ lấy 3 banner "đang hiển thị" đầu tiên theo thứ tự; cột "Trạng thái" phân biệt
 * rõ đã tắt / chờ tới lịch / hết lịch để admin không phải tự nhẩm.
 */
export default function AdminBannersPage() {
  const { message } = App.useApp();
  const { data, isError, refetch, isFetching } = useAdminBanners();
  const update = useUpdateBanner();
  const remove = useDeleteBanner();
  const reorder = useReorderBanners();

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<AdminBanner | null>(null);

  const items = data ?? [];

  function openCreate() {
    setEditing(null);
    setFormOpen(true);
  }

  function openEdit(banner: AdminBanner) {
    setEditing(banner);
    setFormOpen(true);
  }

  /** Đổi chỗ với mục liền kề rồi gửi TRỌN thứ tự — nút mũi tên dùng được bàn phím, khỏi kéo-thả. */
  function move(index: number, delta: number) {
    const target = index + delta;
    if (target < 0 || target >= items.length) return;
    const ids = items.map((b) => b.id);
    [ids[index], ids[target]] = [ids[target]!, ids[index]!];
    reorder.mutate(ids, { onError: (err) => message.error(getErrorMessage(err)) });
  }

  const createButton = (
    <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
      Tạo banner
    </Button>
  );

  const columns: DataTableColumn<AdminBanner>[] = [
    {
      title: 'Ảnh',
      key: 'preview',
      width: 150,
      render: (_, b) => (
        // eslint-disable-next-line @next/next/no-img-element -- ảnh từ R2/URL admin nhập
        <img src={b.imageUrl} alt={b.altText} className={styles.thumb} />
      ),
    },
    {
      title: 'Banner',
      key: 'title',
      render: (_, b) => (
        <div>
          <div className={styles.title}>{b.title}</div>
          <div className={styles.alt}>{b.altText}</div>
          {b.linkUrl ? <div className={styles.link}>{b.linkUrl}</div> : null}
        </div>
      ),
    },
    {
      title: 'Lịch hiển thị',
      key: 'schedule',
      width: 210,
      render: (_, b) =>
        b.startsAt || b.endsAt ? (
          <div className={styles.schedule}>
            <div>{b.startsAt ? formatDateTime(b.startsAt) : 'Ngay lập tức'}</div>
            <div>→ {b.endsAt ? formatDateTime(b.endsAt) : 'vô hạn'}</div>
          </div>
        ) : (
          'Không giới hạn'
        ),
    },
    {
      title: 'Trạng thái',
      key: 'status',
      width: 140,
      render: (_, b) => {
        if (!b.active) return <Tag>Đã tắt</Tag>;
        if (b.visibleNow) return <Tag color="green">Đang hiển thị</Tag>;
        // active nhưng ngoài khung lịch — nói rõ vì sao không thấy ngoài trang chủ.
        const upcoming = b.startsAt && new Date(b.startsAt).getTime() > Date.now();
        return upcoming ? <Tag color="gold">Chờ tới lịch</Tag> : <Tag color="orange">Hết lịch</Tag>;
      },
    },
    actionColumn<AdminBanner>(
      (b) => {
        const index = items.findIndex((i) => i.id === b.id);
        return [
          {
            key: 'up',
            label: 'Đưa lên trên',
            icon: <ArrowUpOutlined />,
            disabled: index <= 0 || reorder.isPending,
            onClick: () => move(index, -1),
          },
          {
            key: 'down',
            label: 'Đưa xuống dưới',
            icon: <ArrowDownOutlined />,
            disabled: index >= items.length - 1 || reorder.isPending,
            onClick: () => move(index, 1),
          },
          {
            key: 'toggle',
            label: b.active ? 'Tắt' : 'Bật',
            loading: update.isPending && update.variables?.id === b.id,
            onClick: () =>
              update.mutate(
                { id: b.id, active: !b.active },
                {
                  onSuccess: () => message.success(b.active ? 'Đã tắt banner' : 'Đã bật banner'),
                  onError: (err) => message.error(getErrorMessage(err)),
                },
              ),
          },
          { key: 'edit', label: 'Sửa', icon: <EditOutlined />, onClick: () => openEdit(b) },
          {
            key: 'delete',
            label: 'Xoá',
            icon: <DeleteOutlined />,
            danger: true,
            loading: remove.isPending && remove.variables === b.id,
            confirm: {
              title: 'Xoá banner này? Ảnh vẫn còn trên kho lưu trữ, tạo lại được từ URL cũ.',
              okText: 'Xoá',
              cancelText: 'Đóng',
            },
            onClick: () =>
              remove.mutate(b.id, {
                onSuccess: () => message.success('Đã xoá banner'),
                onError: (err) => message.error(getErrorMessage(err)),
              }),
          },
        ];
      },
      { width: 190 },
    ),
  ];

  return (
    <div>
      <ManagePageHeader title="Banner trang chủ" />
      <p className={styles.hint}>
        Trang chủ hiển thị tối đa 3 banner đang bật, theo thứ tự từ trên xuống. Mỗi cỡ màn một
        ảnh đúng tỉ lệ: PC 1440×300 · tablet 1024×320 · mobile 780×390 (hoặc @2x) — sai tỉ lệ sẽ
        bị chặn lúc tải lên. Chừa trống ~15% mép dưới: thẻ tìm kiếm của trang chủ đè lên đó.
      </p>
      <div className={styles.toolbar}>{createButton}</div>

      <DataTable<AdminBanner>
        label="Banner trang chủ"
        columns={columns}
        items={items}
        minWidth={MIN_TABLE_WIDTH}
        loading={isFetching}
        error={
          isError && !data
            ? { title: 'Không tải được danh sách banner', onRetry: () => void refetch() }
            : null
        }
        empty={{ title: 'Chưa có banner nào — trang chủ đang dùng hero mặc định', action: createButton }}
      />

      <BannerFormModal
        key={editing?.id ?? 'new'}
        open={formOpen}
        banner={editing}
        onClose={() => setFormOpen(false)}
      />
    </div>
  );
}
