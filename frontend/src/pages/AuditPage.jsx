import React, { useEffect, useState } from 'react';
import { History, ShieldCheck } from 'lucide-react';
import { api } from '../api.js';
import { date } from '../utils.js';
import { Avatar, Badge, Button, EmptyState, PageLoading } from '../components/UI.jsx';

const actionNames = { SYSTEM_INITIALIZED: '初始化系统', USER_CREATED: '创建用户', USER_UPDATED: '更新用户', PASSWORD_RESET: '重置密码', PASSWORD_CHANGED: '修改密码', SUBJECT_CREATED: '创建科目', SUBJECT_VERSION_CREATED: '调整科目结构', SCORE_POSTED: '录入成绩', TARGET_VERSION_CREATED: '调整目标', SCORE_CHANGE_SUBMITTED: '提交成绩申请', SCORE_CHANGE_APPROVED: '通过成绩申请', SCORE_CHANGE_REJECTED: '驳回成绩申请', SCORE_CHANGE_WITHDRAWN: '撤回成绩申请', QUESTION_CREATED: '创建试题', QUESTION_UPDATED: '校对试题', PAPER_EXPORT_REQUESTED: '申请组卷', PAPER_EXPORT_SUCCEEDED: '组卷成功', PAPER_EXPORT_FAILED: '组卷失败', PAPER_UPLOADED: '上传试卷', OCR_CONFIRMED_AND_AI_GRADED: '确认识别并初判', AI_REVIEW_COMPLETED: '判卷复核入账', EXAM_REJECTED: '驳回试卷', WRONG_QUESTION_CONFIRMED: '确认错题', HELP_REQUESTED: '发起互助', HELP_RESPONDED: '回应互助', PEER_PREFERENCE_CHANGED: '修改对比偏好' };
export default function AuditPage() {
  const [logs, setLogs] = useState(null); const [keyword, setKeyword] = useState('');
  const load = () => api('/api/audit-logs').then(setLogs);
  useEffect(() => { load().catch(() => setLogs([])); }, []);
  const filtered = logs?.filter(log => `${log.actor?.displayName || ''} ${actionNames[log.action] || log.action} ${log.reason || ''}`.toLowerCase().includes(keyword.toLowerCase()));
  return <div className="page-enter"><div className="page-title-row"><div><h1>审计日志</h1><p>成绩、目标、审核、账号、题库和导出操作全量留痕。</p></div><Badge tone="soft"><ShieldCheck size={14} />不记录密码和完整试卷</Badge></div><section className="card table-card"><div className="table-toolbar"><input className="standalone-search" value={keyword} onChange={e => setKeyword(e.target.value)} placeholder="搜索操作者、动作或原因…" /><Button variant="ghost" size="sm" icon={History} onClick={load}>刷新</Button></div>{!logs ? <PageLoading /> : filtered.length ? <div className="table-scroll"><table><thead><tr><th>时间</th><th>操作者</th><th>动作</th><th>对象</th><th>原因 / 说明</th></tr></thead><tbody>{filtered.map(log => <tr key={log.id}><td>{date(log.createdAt, true)}</td><td><div className="user-cell"><Avatar user={log.actor} size="sm" />{log.actor?.displayName || '系统'}</div></td><td><Badge tone="blue">{actionNames[log.action] || log.action}</Badge></td><td><code>{log.entityType}:{log.entityId}</code></td><td>{log.reason || '—'}</td></tr>)}</tbody></table></div> : <EmptyState icon={History} title="没有匹配的日志" />}</section></div>;
}
