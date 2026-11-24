import React, { useCallback, useEffect, useState } from 'react';
import { CalendarCheck, Info, RefreshCw, Trophy } from 'lucide-react';
import { api } from '../api.js';
import { date } from '../utils.js';
import { Avatar, Badge, Button, EmptyState, Field, Modal, PageLoading, PlanImage, SectionHeader, StatusBadge } from '../components/UI.jsx';

export default function PointsPage({ bootstrap, notify }) {
  const [loading, setLoading] = useState(true);
  const [requests, setRequests] = useState([]);
  const [plans, setPlans] = useState(null);
  const [board, setBoard] = useState(null);
  const [review, setReview] = useState(null);
  const [reviewReason, setReviewReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [history, setHistory] = useState(null);
  const weekLabel = weekStart => {
    const start = new Date(`${weekStart}T00:00:00Z`); const end = new Date(start.getTime() + 6 * 86400000);
    const fmt = value => `${String(value.getUTCMonth() + 1).padStart(2, '0')}.${String(value.getUTCDate()).padStart(2, '0')}`;
    return `${fmt(start)} — ${fmt(end)}`;
  };
  const openHistory = async student => {
    setHistory({ user: student, plans: null });
    try { setHistory(await api(`/api/weekly-plans/history/${student.id}`)); }
    catch (err) { notify(err.message, 'error'); setHistory(null); }
  };
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [requestList, planData, boardData] = await Promise.all([api('/api/point-requests'), api('/api/weekly-plans'), api('/api/points/leaderboard')]);
      setRequests(requestList); setPlans(planData); setBoard(boardData);
    } catch (err) { notify(err.message, 'error'); } finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);
  const submitReview = async () => {
    if (!review) return; setSaving(true);
    try {
      await api(`/api/point-requests/${review.request.id}/review`, { method: 'POST', body: { decision: review.decision, reason: reviewReason } });
      const approved = review.decision === 'APPROVE';
      setReview(null); setReviewReason(''); await load();
      notify(approved ? '积分申请已通过并计入积分榜。' : '申请已驳回，学生可以看到驳回原因。');
    } catch (err) { notify(err.message, 'error'); } finally { setSaving(false); }
  };
  const pending = requests.filter(item => item.status === 'PENDING');
  const planMap = new Map((plans?.plans || []).map(item => [item.userId, item]));
  return <div className="page-enter">
    <div className="page-title-row"><div><h1>积分与计划</h1><p>确认学生每周的积分申请；每周计划照片由学生上传、同伴可见。</p></div><Button variant="ghost" size="sm" icon={RefreshCw} onClick={load}>刷新</Button></div>
    {loading ? <PageLoading /> : <>
      <section className="card table-card"><SectionHeader title="积分申请审核" description={`本周（${plans?.weekStart || ''} 开始）及历史申请；通过后计入累计积分榜。`} action={<Badge tone="warning">{pending.length} 条待审核</Badge>} />
        <div className="table-scroll"><table><thead><tr><th>学生</th><th>周次</th><th>申请积分</th><th>完成情况说明</th><th>状态</th><th>操作</th></tr></thead><tbody>{requests.map(request => <tr key={request.id}>
          <td><div className="user-cell"><Avatar user={request.user} size="sm" /><b>{request.user?.displayName}</b></div></td>
          <td>{date(request.weekStart)}</td>
          <td><strong>{request.points}</strong> 分</td>
          <td className="note-cell">{request.reason}</td>
          <td><StatusBadge status={request.status} />{request.reviewReason && <small className="table-sub">{request.reviewReason}</small>}</td>
          <td>{request.status === 'PENDING' ? <div className="table-actions"><Button variant="soft" size="sm" onClick={() => setReview({ request, decision: 'APPROVE' })}>通过</Button><Button variant="ghost" size="sm" onClick={() => setReview({ request, decision: 'REJECT' })}>驳回</Button></div> : <span className="table-sub">{date(request.reviewedAt, true)}</span>}</td>
        </tr>)}</tbody></table></div>
        {!requests.length && <EmptyState icon={Trophy} title="暂无积分申请" />}</section>
      <section className="card table-card"><SectionHeader title="本周计划提交情况" description="每周计划照片由学生上传，重复上传覆盖本周记录。" action={<CalendarCheck size={21} className="accent-icon" />} />
        <div className="table-scroll"><table><thead><tr><th>学生</th><th>本周计划</th><th>照片数</th><th>最近更新</th><th>提交历史</th></tr></thead><tbody>{bootstrap.students.map(student => {
          const plan = planMap.get(student.id);
          return <tr key={student.id}>
            <td><div className="user-cell"><Avatar user={student} size="sm" /><b>{student.displayName}</b></div></td>
            <td>{plan ? <Badge tone="success">已提交</Badge> : <Badge tone="muted">未提交</Badge>}</td>
            <td>{plan ? `${plan.files.length} 张` : '—'}</td>
            <td>{plan ? date(plan.updatedAt, true) : '—'}</td>
            <td><Button variant="ghost" size="sm" onClick={() => openHistory(student)}>查看</Button></td>
          </tr>;
        })}</tbody></table></div></section>
      <section className="card table-card"><SectionHeader title="积分总榜" description="本周榜与累计榜，学生端也能看到同款数据。" action={<Trophy size={21} className="accent-icon" />} />
        <div className="table-scroll"><table><thead><tr><th>排名</th><th>学生</th><th>本周积分</th><th>累计积分</th></tr></thead><tbody>{(board?.rows || []).map((row, index) => <tr key={row.userId}>
          <td><strong>{index + 1}</strong></td>
          <td><div className="user-cell"><Avatar user={row} size="sm" /><b>{row.displayName}</b></div></td>
          <td><strong>{row.weekly}</strong> 分</td>
          <td><strong>{row.total}</strong> 分</td>
        </tr>)}</tbody></table></div></section>
    </>}
    {review && <Modal title={review.decision === 'APPROVE' ? '通过积分申请' : '驳回积分申请'} description={`${review.request.user?.displayName} · 申请 ${review.request.points} 分 · ${date(review.request.weekStart)}`} onClose={() => setReview(null)} footer={<><Button variant="ghost" onClick={() => setReview(null)}>取消</Button><Button loading={saving} variant={review.decision === 'APPROVE' ? 'primary' : 'danger'} onClick={submitReview}>确认{review.decision === 'APPROVE' ? '通过并计入' : '驳回'}</Button></>}>
      <div className="review-impact"><Info size={18} /><p>{review.decision === 'APPROVE' ? '通过后积分计入本周与累计积分榜，学生可以看到结果。' : '驳回后不计入积分，学生可以看到驳回原因。'}</p></div>
      <div className="request-status"><p className="plan-note">{review.request.reason}</p></div>
      <Field label="审核说明" required={review.decision !== 'APPROVE'}><textarea rows="3" value={reviewReason} onChange={e => setReviewReason(e.target.value)} placeholder={review.decision === 'APPROVE' ? '选填：记录确认依据' : '必填：说明驳回原因'} /></Field>
    </Modal>}
    {history && <Modal title={`${history.user.displayName} 的计划提交记录`} description="按周展示每次上传的计划照片；重复上传只保留该周最新版本。" onClose={() => setHistory(null)} footer={<Button variant="ghost" onClick={() => setHistory(null)}>关闭</Button>}>
      {history.plans === null ? <PageLoading label="正在加载提交记录…" /> : history.plans.length ? <div className="plan-history">
        {history.plans.map(plan => <article className="plan-history-item" key={plan.id}>
          <div className="plan-history-head"><b>{weekLabel(plan.weekStart)} 那一周</b><Badge tone={plan.weekStart === plans?.weekStart ? 'blue' : 'soft'}>{plan.weekStart === plans?.weekStart ? '本周' : date(plan.weekStart)}</Badge><span>更新于 {date(plan.updatedAt, true)}</span></div>
          <div className="plan-images">{plan.files.map((file, index) => <PlanImage key={file.storedName} planId={plan.id} index={index} />)}</div>
          {plan.note && <p className="plan-note">{plan.note}</p>}
        </article>)}
      </div> : <EmptyState icon={CalendarCheck} title="还没有提交过计划" description="学生上传每周计划后会出现在这里。" />}
    </Modal>}
  </div>;
}
