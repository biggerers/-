export const cn = (...values) => values.filter(Boolean).join(' ');
export const score = value => value == null ? '—' : Number.isInteger(Number(value)) ? String(Number(value)) : Number(value).toFixed(1);
export const percent = value => value == null ? '—' : `${score(value)}%`;
export const date = (value, withTime = false) => {
  if (!value) return '—';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return String(value);
  return parsed.toLocaleDateString('zh-CN', withTime ? { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Shanghai' } : { year: 'numeric', month: '2-digit', day: '2-digit', timeZone: 'Asia/Shanghai' });
};
export const today = () => new Date().toISOString().slice(0, 10);

export async function compressImage(file, { maxEdge = 1600, quality = 0.78 } = {}) {
  if (!file || !file.type?.startsWith('image/')) return file;
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const alreadySmall = scale === 1 && file.type === 'image/jpeg' && file.size <= 500 * 1024;
    if (alreadySmall) { bitmap.close?.(); return file; }
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, width, height);
    context.drawImage(bitmap, 0, 0, width, height);
    bitmap.close?.();
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', quality));
    if (!blob || blob.size >= file.size) return file;
    const name = `${file.name.replace(/\.(png|webp|jpe?g|heic|heif)$/i, '')}.jpg`;
    return new File([blob], name, { type: 'image/jpeg' });
  } catch {
    return file;
  }
}
export const sourceName = value => ({ MIDTERM: '期中考试', STAGE_EXAM: '阶段考试', PRACTICE: '练习卷', AI_REVIEW: 'AI 复核入账', MANUAL: '手工校准' }[value] || value || '—');
export const statusName = value => ({ PENDING: '待审核', APPROVED: '已通过', REJECTED: '已驳回', WITHDRAWN: '已撤回', AWAITING_CONFIRMATION: '待我确认', REVIEW_PENDING: '待管理员复核', POSTED: '已入账', PUBLISHED: '已上架', DRAFT: '待校对', DISABLED: '已停用', ACTIVE: '正常', SUCCESS: '生成成功', FAILED: '生成失败', GENERATING: '生成中', OPEN: '等待回应', ACCEPTED: '已接受', COMPLETED: '已完成', IGNORED: '已忽略', MASTERED: '已掌握', RETRAINING: '待重练' }[value] || value || '—');
export const statusTone = value => ({ PENDING: 'warning', REVIEW_PENDING: 'warning', AWAITING_CONFIRMATION: 'blue', APPROVED: 'success', POSTED: 'success', PUBLISHED: 'success', ACTIVE: 'success', SUCCESS: 'success', COMPLETED: 'success', MASTERED: 'success', REJECTED: 'danger', FAILED: 'danger', DISABLED: 'muted', WITHDRAWN: 'muted', DRAFT: 'muted', GENERATING: 'blue', OPEN: 'blue', RETRAINING: 'warning' }[value] || 'muted');
export const difficultyName = value => ({ 1: '基础', 2: '进阶', 3: '挑战' }[value] || '全部难度');
export const roleName = value => value === 'ADMIN' ? '小组管理员' : '学生';
