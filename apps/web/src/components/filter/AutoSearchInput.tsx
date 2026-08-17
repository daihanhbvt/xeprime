'use client';

import { SearchOutlined } from '@ant-design/icons';
import { Input, type InputProps } from 'antd';
import { useEffect, useState } from 'react';

export interface AutoSearchInputProps extends Omit<
  InputProps,
  'value' | 'defaultValue' | 'onChange' | 'prefix'
> {
  value?: string;
  onSearch: (value: string) => void;
  debounceMs?: number;
}

/**
 * Ô tìm kiếm tự áp dụng sau khi người dùng ngừng gõ.
 *
 * Dùng `Input` thường thay vì `Input.Search`: kính lúp chỉ là dấu hiệu nhận biết, không còn là một nút
 * phải bấm. State nháp giúp gõ mượt; giá trị ngoài vẫn đồng bộ được khi xoá bộ lọc hoặc dùng Back/Forward.
 */
export function AutoSearchInput({
  value,
  onSearch,
  debounceMs = 300,
  allowClear = true,
  ...inputProps
}: AutoSearchInputProps) {
  const [draft, setDraft] = useState(value ?? '');
  const [previousValue, setPreviousValue] = useState(value);

  if (previousValue !== value) {
    setPreviousValue(value);
    setDraft(value ?? '');
  }

  useEffect(() => {
    const normalized = draft.trim();
    if (normalized === (value ?? '')) return;

    const timer = setTimeout(() => onSearch(normalized), debounceMs);
    return () => clearTimeout(timer);
  }, [debounceMs, draft, onSearch, value]);

  return (
    <Input
      {...inputProps}
      allowClear={allowClear}
      prefix={<SearchOutlined aria-hidden="true" />}
      value={draft}
      onChange={(event) => setDraft(event.target.value)}
    />
  );
}
