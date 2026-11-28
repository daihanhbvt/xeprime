import { Platform, Share } from 'react-native';
import {
  EncodingType,
  StorageAccessFramework,
  cacheDirectory,
  writeAsStringAsync,
} from 'expo-file-system/legacy';

/** Kết quả lưu: `saved` = đã ghi tệp / đã chia sẻ tệp; `cancelled` = người dùng huỷ chọn nơi lưu. */
export type SaveCsvResult = 'saved' | 'cancelled';

/**
 * Lưu một chuỗi CSV thành TỆP - bản app của web `downloadCsv` (tải tệp `.csv` về máy).
 *
 * - Android: hỏi THƯ MỤC lưu (Storage Access Framework, như hộp "Tải về") rồi ghi tệp ở đó.
 * - iOS: ghi tệp tạm vào cache rồi mở bảng chia sẻ với chính TỆP đó (Lưu vào Tệp, gửi Zalo/Mail…).
 *
 * Chuỗi đã mang BOM UTF-8 (`wageStatementCsv`) nên Excel đọc đúng tiếng Việt.
 */
export async function saveCsvFile(fileName: string, csv: string): Promise<SaveCsvResult> {
  if (Platform.OS === 'android') {
    const permission = await StorageAccessFramework.requestDirectoryPermissionsAsync();
    if (!permission.granted) return 'cancelled';
    const baseName = fileName.replace(/\.csv$/i, '');
    const uri = await StorageAccessFramework.createFileAsync(permission.directoryUri, baseName, 'text/csv');
    await writeAsStringAsync(uri, csv, { encoding: EncodingType.UTF8 });
    return 'saved';
  }
  const uri = `${cacheDirectory ?? ''}${fileName}`;
  await writeAsStringAsync(uri, csv, { encoding: EncodingType.UTF8 });
  const result = await Share.share({ url: uri, title: fileName });
  return result.action === Share.dismissedAction ? 'cancelled' : 'saved';
}
