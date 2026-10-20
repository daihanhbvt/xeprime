/** Đếm ngược gửi lại mã ở dạng đồng hồ "00:58" — đúng cách bản vẽ v2 ghi ("Gửi lại mã (00:58)"). */
export function formatOtpCooldown(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(total / 60);
  return `${String(minutes).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}
