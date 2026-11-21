import React, { useCallback, useEffect, useState } from 'react';
import { ClipboardCheck, History, Info, RefreshCw, Target } from 'lucide-react';
import { api } from '../api.js';
import { date, score, sourceName, today } from '../utils.js';
import { Avatar, Badge, Button, EmptyState, Field, Modal, SectionHeader, StatusBadge, SubjectIcon } from '../components/UI.jsx';

export default function AdminScoresPage({ bootstrap, notify }) {
  const [tab, setTab] = useState('requests');
  const [requests, setRequests] = useState([]);
  const [selectedUser, setSelectedUser] = useState(bootstrap.students[0]?.id);
  const [selectedSubject, setSelectedSubject] = useState(bootstrap.subjects[0]?.id);
  const [dashboard, setDashboard] = useState(null);
  const [scoreForm, setScoreForm] = useState({ subItemScores: {}, occurredAt: today(), note: '' });
  const [targetForm, setTargetForm] = useState({ subItemTargets: {}, subItemBaselines: {}, reason: '' });
  const [review, setReview] = useState(null);
  const [reviewReason, setReviewReason] = useState('');
  const [saving, setSaving] = useState(false);
  const loadRequests = useCallback(() => api('/api/score-requests').then(setRequests).catch(err => notify(err.message, 'error')), []);
  useEffect(() => { loadRequests(); }, [loadRequests]);
  useEffect(() => { if (selectedUser) api(`/api/dashboard?userId=${selectedUser}`).then(setDashboard).catch(err => notify(err.message, 'error')); }, [selectedUser, tab]);
  const current = dashboard?.subjects.find(item => item.subjectId === selectedSubject);
  const refreshDashboard = async () => setDashboard(await api(`/api/dashboard?userId=${selectedUser}`));
  const targetSignature = current ? `${selectedUser}:${current.subjectId}:V${current.targetVersion}:${current.subItems.map(item => `${item.id}:${item.baseline ?? ''}:${item.target ?? ''}`).join('|')}` : '';
  useEffect(() => {
    if (current) setTargetForm({ subItemTargets: Object.fromEntries(current.subItems.map(item => [item.id, item.target ?? ''])), subItemBaselines: Object.fromEntries(current.subItems.map(item => [item.id, item.baseline ?? ''])), reason: '' });
  }, [targetSignature]);
  const targetTotal = Object.values(targetForm.subItemTargets || {}).reduce((sum, value) => sum + (Number(value) || 0), 0);
  const baselineTotal = Object.values(targetForm.subItemBaselines || {}).reduce((sum, value) => sum + (Number(value) || 0), 0);
  const scoreSignature = current ? `${selectedUser}:${current.subjectId}:${current.subItems.map(item => `${item.id}:${item.current ?? ''}`).join('|')}` : '';
  useEffect(() => {
    if (current) setScoreForm({ subItemScores: Object.fromEntries(current.subItems.map(item => [item.id, item.current ?? ''])), occurredAt: today(), note: '' });
  }, [scoreSignature]);
  const scoreTotal = Object.values(scoreForm.subItemScores || {}).reduce((sum, value) => sum + (Number(value) || 0), 0);
  const currentScoreTotal = (current?.subItems || []).reduce((sum, item) => sum + (Number(item.current) || 0), 0);
  const currentBaselineTotal = (current?.subItems || []).reduce((sum, item) => sum + (Number(item.baseline) || 0), 0);
  const submitScore = async event => {
    event.preventDefault(); setSaving(true);
    try {
      await api('/api/scores', { method: 'POST', body: { ...scoreForm, score: scoreTotal, userId: selectedUser, subjectId: selectedSubject } });
      const updated = await api(`/api/dashboard?userId=${selectedUser}`); setDashboard(updated);
      const updatedSubject = updated.subjects.find(item => item.subjectId === selectedSubject);
      setScoreForm({ subItemScores: Object.fromEntries((updatedSubject?.subItems || []).map(item => [item.id, item.current ?? ''])), occurredAt: today(), note: '' });
      notify('成绩已作为新评估记录生效，历史记录未覆盖。');
    } catch (err) { notify(err.message, 'error'); } finally { setSaving(false); }
  };
  const submitTarget = async event => {
    event.preventDefault(); setSaving(true);
    try {
      await api('/api/targets', { method: 'POST', body: { ...targetForm, targetScore: targetTotal, baselineScore: baselineTotal, userId: selectedUser, subjectId: selectedSubject } });
      await refreshDashboard(); notify('目标新版本已生效，历史目标保留。');
    } catch (err) { notify(err.message, 'error'); } finally { setSaving(false); }
  };
  const submitReview = async () => {
    if (!review) return; setSaving(true);
    try {
      await api(`/api/score-requests/${review.request.id}/review`, { method: 'POST', body: { decision: review.decision, reason: reviewReason } });
      const approved = review.decision === 'APPROVE'; setReview(null); setReviewReason(''); await loadRequests();
      notify(approved ? '申请已通过，学生当前成绩已更新。' : '申请已驳回，原正式成绩保持不变。');
    } catch (err) { notify(err.message, 'error'); } finally { setSaving(false); }
  };
  return <div className="page-enter">
    <div className="page-title-row"><div><h1>成绩与目标管理</h1><p>学生申请必须经审核；所有变更创建新记录。</p></div><div className="segmented"><button className={tab === 'requests' ? 'active' : ''} onClick={() => setTab('requests')}>学生申请 <Badge tone="warning">{requests.filter(item => item.status === 'PENDING').length}</Badge></button><button className={tab === 'entry' ? 'active' : ''} onClick={() => setTab('entry')}>录入与目标</button></div></div>
    {tab === 'requests' ? <section className="card table-card"><SectionHeader title="成绩变更审核" description="核对来源与发生日期。驳回不影响原有成绩，通过会创建新评估记录。" action={<Button variant="ghost" size="sm" icon={RefreshCw} onClick={loadRequests}>刷新</Button>} /><div className="table-scroll"><table><thead><tr><th>学生</th><th>科目</th><th>申请成绩</th><th>来源与日期</th><th>备注</th><th>状态</th><th>操作</th></tr></thead><tbody>{requests.map(request => <tr key={request.id}><td><div className="user-cell"><Avatar user={request.user} size="sm" /><b>{request.user?.displayName}</b></div></td><td>{request.subject?.name}</td><td><strong>{score(request.requestedScore)}</strong> / {request.subject?.fullScore}</td><td>{sourceName(request.source)}<small className="table-sub">{date(request.occurredAt)}</small></td><td className="note-cell">{request.note || '—'}</td><td><StatusBadge status={request.status} /></td><td>{request.status === 'PENDING' ? <div className="table-actions"><Button variant="soft" size="sm" onClick={() => setReview({ request, decision: 'APPROVE' })}>通过</Button><Button variant="ghost" size="sm" onClick={() => setReview({ request, decision: 'REJECT' })}>驳回</Button></div> : <span className="table-sub">{request.reviewReason || '已处理'}</span>}</td></tr>)}</tbody></table></div>{!requests.length && <EmptyState icon={ClipboardCheck} title="暂无成绩申请" />}</section> : <>
      <section className="card admin-entry-selector"><Field label="选择学生"><div className="student-selector">{bootstrap.students.map(student => <button key={student.id} className={selectedUser === student.id ? 'active' : ''} onClick={() => setSelectedUser(student.id)}><Avatar user={student} size="sm" />{student.displayName}</button>)}</div></Field><div className="subject-tabs compact">{bootstrap.subjects.map(subject => <button key={subject.id} className={selectedSubject === subject.id ? 'active' : ''} onClick={() => setSelectedSubject(subject.id)}><span style={{ background: subject.color }} />{subject.name}</button>)}</div></section>
      {current && <section className="admin-score-edit-grid"><article className="card"><div className="editor-head"><div><h2>录入{current.name}成绩</h2><p>当前有效 {score(current.current)} / {current.fullScore}</p></div><SubjectIcon subject={current} size="lg" /></div><form className="form-grid" onSubmit={submitScore}><Field label="发生日期" required><input type="date" value={scoreForm.occurredAt} onChange={e => setScoreForm({ ...scoreForm, occurredAt: e.target.value })} required /></Field><div className="form-section-title">本次分项得分（总分自动合计）</div><div className="subitem-target-list">{current.subItems.map(item => <div key={item.id} className="subitem-target-row"><div className="subitem-target-name"><b>{item.name}</b><span>期中 {score(item.baseline)} · 满分 {item.fullScore}</span></div><div className="subitem-target-col"><small>当前</small><span className="subitem-static-value">{score(item.current)} 分</span></div><div className="subitem-target-col"><small>本次得分</small><div className="input-suffix"><input type="number" min="0" max={item.fullScore} step="0.1" value={scoreForm.subItemScores[item.id] ?? ''} onChange={e => setScoreForm({ ...scoreForm, subItemScores: { ...scoreForm.subItemScores, [item.id]: e.target.value } })} required /><span>分</span></div></div></div>)}</div><div className="target-total"><span>期中合计 {score(currentBaselineTotal)} 分 · 当前合计 {score(currentScoreTotal)} 分</span><strong>本次合计 {score(scoreTotal)} / {current.fullScore}</strong></div><Field label="录入备注" required><textarea rows="3" value={scoreForm.note} onChange={e => setScoreForm({ ...scoreForm, note: e.target.value })} required placeholder="记录试卷或校准依据" /></Field><Button type="submit" loading={saving}>保存并生效</Button></form></article>
      <article className="card"><div className="editor-head"><div><h2>调整期末目标</h2><p>当前目标 V{current.targetVersion} · 期中基准 {score(current.baseline)}</p></div><Target size={25} className="accent-icon" /></div><form className="form-grid" onSubmit={submitTarget}><div className="form-section-title">每个分项目标</div><div className="subitem-target-list">{current.subItems.map(item => <div key={item.id} className="subitem-target-row"><div className="subitem-target-name"><b>{item.name}</b><span>当前 {score(item.current)} · 满分 {item.fullScore}</span></div><div className="subitem-target-col"><small>期中成绩</small><div className="input-suffix"><input type="number" min="0" max={item.fullScore} step="0.1" value={targetForm.subItemBaselines[item.id] ?? ''} onChange={e => setTargetForm({ ...targetForm, subItemBaselines: { ...targetForm.subItemBaselines, [item.id]: e.target.value } })} required /><span>分</span></div></div><div className="subitem-target-col"><small>期末目标</small><div className="input-suffix"><input type="number" min="0" max={item.fullScore} step="0.1" value={targetForm.subItemTargets[item.id] ?? ''} onChange={e => setTargetForm({ ...targetForm, subItemTargets: { ...targetForm.subItemTargets, [item.id]: e.target.value } })} required /><span>分</span></div></div></div>)}</div><div className="target-total"><span>期中合计 {score(baselineTotal)} 分</span><strong>目标合计 {score(targetTotal)} / {current.fullScore}</strong></div><Field label="调整原因" required><textarea rows="3" value={targetForm.reason} onChange={e => setTargetForm({ ...targetForm, reason: e.target.value })} required placeholder="目标变化必须说明原因并留下版本" /></Field><div className="soft-note"><History size={16} /><p>当前规划使用分项目标合计，历史报告仍保留当时目标。目标等于期中基准时按“保持目标”处理。</p></div><Button type="submit" loading={saving}>创建目标新版本</Button></form></article></section>}
    </>}
    {review && <Modal title={review.decision === 'APPROVE' ? '通过成绩变更申请' : '驳回成绩变更申请'} description={`${review.request.user?.displayName} · ${review.request.subject?.name} · 申请 ${score(review.request.requestedScore)} 分`} onClose={() => setReview(null)} footer={<><Button variant="ghost" onClick={() => setReview(null)}>取消</Button><Button loading={saving} variant={review.decision === 'APPROVE' ? 'primary' : 'danger'} onClick={submitReview}>确认{review.decision === 'APPROVE' ? '通过并入账' : '驳回'}</Button></>}><div className="review-impact"><Info size={18} /><p>{review.decision === 'APPROVE' ? '通过后创建新的已生效评估记录，原成绩历史不会删除。' : '驳回后当前成绩保持不变，学生可查看原因并重新提交。'}</p></div><Field label="审核说明" required={review.decision !== 'APPROVE'}><textarea rows="4" value={reviewReason} onChange={e => setReviewReason(e.target.value)} placeholder={review.decision === 'APPROVE' ? '选填：记录核对依据' : '必填：说明驳回原因与下一步建议'} /></Field></Modal>}
  </div>;
}
