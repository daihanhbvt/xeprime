'use client';

import {
  AlignCenterOutlined,
  AlignLeftOutlined,
  AlignRightOutlined,
  BoldOutlined,
  ItalicOutlined,
  RedoOutlined,
  UnderlineOutlined,
  UndoOutlined,
} from '@ant-design/icons';
import TextAlign from '@tiptap/extension-text-align';
import { Placeholder } from '@tiptap/extensions';
import { EditorContent, useEditor, useEditorState, type Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { Form, Tooltip } from 'antd';
import { useTranslations } from 'next-intl';
import { useEffect, useId, type ReactNode } from 'react';
import { useController, type Control, type FieldValues, type Path } from 'react-hook-form';

import { cx } from '@/lib/cx';
import richTextStyles from '@/components/data-display/RichText.module.css';
import fieldStyles from './field.module.css';
import styles from './RichTextField.module.css';

interface RichTextFieldProps<T extends FieldValues> {
  control: Control<T>;
  name: Path<T>;
  label: ReactNode;
  placeholder?: string;
  help?: ReactNode;
  required?: boolean;
  disabled?: boolean;
  /** Trần CHỮ (không tính thẻ) - đếm như server đếm chữ thuần rút từ HTML. */
  maxLength?: number;
}

/**
 * Ô soạn văn bản CÓ ĐỊNH DẠNG (TipTap) - đúng thanh công cụ design 06/11/2026: hoàn tác · làm lại ·
 * nghiêng · đậm · gạch chân · căn trái/giữa/phải. Không ảnh, không link, không tiêu đề: server lọc
 * HTML theo đúng tập này (`sanitizeShopBioHtml`), nên thêm một nút ở đây mà không mở ở server là
 * định dạng biến mất ngay sau lần lưu.
 *
 * Giá trị của field là CHUỖI HTML; editor rỗng ghi chuỗi rỗng (không phải `<p></p>`) để `isDirty`
 * và "bắt buộc" của schema làm việc như với một ô chữ thường.
 */
export function RichTextField<T extends FieldValues>({
  control,
  name,
  label,
  placeholder,
  help,
  required,
  disabled = false,
  maxLength,
}: RichTextFieldProps<T>) {
  const t = useTranslations('Common.components.richText');
  const { field, fieldState } = useController({ control, name });
  const id = useId();
  const describedById = `${id}-help`;
  const value = (field.value as string | null | undefined) ?? '';

  const editor = useEditor({
    // SSR an toàn: dựng editor sau khi hydrate, không render lệch giữa server và client.
    immediatelyRender: false,
    editable: !disabled,
    extensions: [
      StarterKit.configure({
        heading: false,
        bulletList: false,
        orderedList: false,
        listItem: false,
        blockquote: false,
        code: false,
        codeBlock: false,
        horizontalRule: false,
        strike: false,
        link: false,
      }),
      TextAlign.configure({ types: ['paragraph'], alignments: ['left', 'center', 'right'] }),
      Placeholder.configure({ placeholder: placeholder ?? '' }),
    ],
    content: value,
    editorProps: {
      attributes: {
        id,
        role: 'textbox',
        'aria-multiline': 'true',
        'aria-label': typeof label === 'string' ? label : '',
        class: cx(styles.content, richTextStyles.richText),
      },
    },
    onUpdate: ({ editor: current }) => field.onChange(current.isEmpty ? '' : current.getHTML()),
    onBlur: () => field.onBlur(),
  });

  // Giá trị đổi từ NGOÀI (reset form, mở lại hộp thoại) ⇒ nạp lại nội dung, không phát `onUpdate`.
  useEffect(() => {
    if (!editor) return;
    const current = editor.isEmpty ? '' : editor.getHTML();
    if (current !== value) editor.commands.setContent(value, { emitUpdate: false });
  }, [editor, value]);

  useEffect(() => {
    editor?.setEditable(!disabled);
  }, [editor, disabled]);

  const length = useEditorState({
    editor,
    selector: ({ editor: current }) => current?.getText().length ?? 0,
  });
  const errorMessage = fieldState.error?.message;
  const helpText = errorMessage ?? help;

  return (
    <Form.Item
      label={label}
      htmlFor={id}
      required={required}
      validateStatus={fieldState.error ? 'error' : ''}
      help={helpText ? <span id={describedById}>{helpText}</span> : undefined}
      className={fieldStyles.item}
    >
      <div
        className={cx(
          styles.box,
          fieldState.error && styles.boxError,
          disabled && styles.boxDisabled,
        )}
      >
        <Toolbar editor={editor} disabled={disabled} labels={t} />
        <EditorContent editor={editor} className={styles.area} />
        {maxLength ? (
          <span className={cx(styles.count, (length ?? 0) > maxLength && styles.countOver)}>
            {t('count', { count: length ?? 0, max: maxLength })}
          </span>
        ) : null}
      </div>
    </Form.Item>
  );
}

type ToolbarLabel = (
  key:
    | 'toolbar'
    | 'undo'
    | 'redo'
    | 'italic'
    | 'bold'
    | 'underline'
    | 'alignLeft'
    | 'alignCenter'
    | 'alignRight',
) => string;

function Toolbar({
  editor,
  disabled,
  labels,
}: {
  editor: Editor | null;
  disabled: boolean;
  labels: ToolbarLabel;
}) {
  const state = useEditorState({
    editor,
    selector: ({ editor: current }) => ({
      bold: current?.isActive('bold') ?? false,
      italic: current?.isActive('italic') ?? false,
      underline: current?.isActive('underline') ?? false,
      left: current?.isActive({ textAlign: 'left' }) ?? false,
      center: current?.isActive({ textAlign: 'center' }) ?? false,
      right: current?.isActive({ textAlign: 'right' }) ?? false,
      canUndo: current?.can().undo() ?? false,
      canRedo: current?.can().redo() ?? false,
    }),
  });

  const run = (command: (chain: ReturnType<Editor['chain']>) => ReturnType<Editor['chain']>) => {
    if (!editor) return;
    command(editor.chain().focus()).run();
  };

  const buttons = [
    {
      key: 'undo',
      icon: <UndoOutlined />,
      active: false,
      enabled: state?.canUndo,
      onClick: () => run((c) => c.undo()),
    },
    {
      key: 'redo',
      icon: <RedoOutlined />,
      active: false,
      enabled: state?.canRedo,
      onClick: () => run((c) => c.redo()),
    },
    {
      key: 'italic',
      icon: <ItalicOutlined />,
      active: state?.italic,
      enabled: true,
      onClick: () => run((c) => c.toggleItalic()),
    },
    {
      key: 'bold',
      icon: <BoldOutlined />,
      active: state?.bold,
      enabled: true,
      onClick: () => run((c) => c.toggleBold()),
    },
    {
      key: 'underline',
      icon: <UnderlineOutlined />,
      active: state?.underline,
      enabled: true,
      onClick: () => run((c) => c.toggleUnderline()),
    },
    {
      key: 'alignLeft',
      icon: <AlignLeftOutlined />,
      active: state?.left,
      enabled: true,
      onClick: () => run((c) => c.setTextAlign('left')),
    },
    {
      key: 'alignCenter',
      icon: <AlignCenterOutlined />,
      active: state?.center,
      enabled: true,
      onClick: () => run((c) => c.setTextAlign('center')),
    },
    {
      key: 'alignRight',
      icon: <AlignRightOutlined />,
      active: state?.right,
      enabled: true,
      onClick: () => run((c) => c.setTextAlign('right')),
    },
  ] as const;

  return (
    <div className={styles.toolbar} role="toolbar" aria-label={labels('toolbar')}>
      {buttons.map((button) => (
        <Tooltip key={button.key} title={labels(button.key)}>
          <button
            type="button"
            className={cx(styles.tool, button.active && styles.toolActive)}
            aria-label={labels(button.key)}
            aria-pressed={
              button.key === 'undo' || button.key === 'redo' ? undefined : Boolean(button.active)
            }
            disabled={disabled || !editor || !button.enabled}
            // Giữ vùng chọn: bấm chuột vào nút không được lấy focus khỏi editor.
            onMouseDown={(event) => event.preventDefault()}
            onClick={button.onClick}
          >
            {button.icon}
          </button>
        </Tooltip>
      ))}
    </div>
  );
}
