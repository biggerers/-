import React, { useCallback, useEffect, useState } from 'react';
import { AlertCircle, Check, CheckCircle2, Download, FileText, Info, RefreshCw, ShieldCheck, Sparkles, XCircle } from 'lucide-react';
import { api, downloadFile } from '../api.js';
import { cn, date, score, sourceName } from '../utils.js';
import { Avatar, Badge, Button, EmptyState, Field, PageLoading, StatusBadge } from '../components/UI.jsx';

const confidenceName = { HIGH: '高置信', MEDIUM: '中置信', LOW: '低置信' };
export default function ReviewsPage({ notify }) {
  const [exams, setExams] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [reason, setReason] = useState('');
  const [rejecting, setRejecting] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api('/api/exams'); setExams(data);
      if (!selectedId && data.length) setSelectedId((data.find(item => item.status === 'REVIEW_PENDING') || data[0]).id);
    } catch (err) { notify(err.message, 'error'); } finally { setLoading(false); }
  }, [selectedId]);
  useEffect(() => { load(); }, []);
  const selected = exams.find(item => item.id === selectedId);
  useEffect(() => { if (selected) setItems(structuredClone(selected.items || [])); }, [selected?.id, selected?.version]);
  const updateItem = (id, changes) => setItems(current => current.map(item => item.id === id ? { ...item, ...changes } : item));
  const total = items.reduce((sum, item) => sum + Number(item.reviewedScore ?? item.suggestedScore ?? 0), 0);
  const review = async () => {
    setSaving(true);
    try {
      await api(`/api/exams/${selected.id}/review`, { method: 'POST', body: { reason, items: items.map(item => ({ id: item.id, reviewedScore: item.reviewedScore ?? item.suggestedScore, reviewReason: item.reviewReason, recognizedText: item.recognizedText })) } });
      notify(`复核完成，${selected.user?.displayName}的${selected.subject?.name}成绩已更新为 ${total} 分。`);
      setReason(''); setSelectedId(null); await load();
    } catch (err) { notify(err.message, 'error'); } finally { setSaving(false); }
  };
  const reject = async () => {
    if (!rejectReason.trim()) { notify('请填写驳回原因与补图建议', 'error'); return; }
    setSaving(true);
    try {
      await api(`/api/exams/${selected.id}/reject`, { method: 'POST', body: { reason: rejectReason } });
      notify('已驳回，学生可查看原因并重新上传。'); setRejecting(false); setRejectReason(''); setSelectedId(null); await load();
    } catch (err) { notify(err.message, 'error'); } finally { setSaving(false); }
  };
  return <div className="page-enter">
    <div className="page-title-row"><div><h1>判卷审核</h1><p>原卷、识别文本、AI 建议并列核对；确认后原子入账。</p></div><Badge tone="warning"><ShieldCheck size={14} />全部结果必须人工复核</Badge></div>
    <div className="review-layout"><aside className="card review-queue"><div className="review-queue-head"><h3>审核任务</h3><Button variant="ghost" size="sm" icon={RefreshCw} onClick={load}>刷新</Button></div>{loading ? <PageLoading /> : exams.length ? exams.map(exam => <button key={exam.id} className={cn('review-queue-item', selectedId === exam.id && 'active')} onClick={() => setSelectedId(exam.id)}><div className="user-cell"><Avatar user={exam.user} size="sm" /><div><b>{exam.user?.displayName}</b><span>{exam.subject?.name} · {sourceName(exam.source)}</span></div></div><div><StatusBadge status={exam.status} /><small>{date(exam.createdAt, true)}</small></div></button>) : <EmptyState icon={CheckCircle2} title="没有审核任务" />}</aside>
      <main className="review-workspace">{selected ? <>
        <section className="card review-file-head"><div className="user-cell"><span className="pdf-icon"><FileText size={22} /></span><div><h2>{selected.originalName}</h2><p>{selected.user?.displayName} · {selected.subject?.name} · 作答 {date(selected.occurredAt)}</p></div></div><div><StatusBadge status={selected.status} /><span className="model-tag">模型 {selected.aiModel}</span></div></section>
        <section className="review-compare"><article className="card original-paper"><div className="review-pane-title"><h3>原卷对照</h3><div className="table-actions"><Badge tone="muted">{selected.fileCount || 2} 页</Badge>{selected.fileCount > 0 && <Button variant="ghost" size="sm" icon={Download} onClick={() => downloadFile(`/api/exams/${selected.id}/files/0`, selected.originalName).catch(err => notify(err.message, 'error'))}>下载原卷</Button>}</div></div><div className="paper-preview"><div className="paper-sheet"><span className="paper-brand">UP·03 同窗进阶</span><h3>{selected.subject?.name}阶段练习</h3><p>姓名：{selected.user?.displayName}</p><hr />{items.map((item, index) => <div className="paper-question" key={item.id}><b>{item.number}. 题目作答区域</b><span /><span /><span className={index === items.length - 1 ? 'faint' : ''} /></div>)}<small>演示原卷预览 · 实际文件受权限保护</small></div></div><div className="soft-note"><Info size={14} /><p>学生之间不可查看原始试卷；此处仅管理员审核可见。</p></div></article>
          <article className="card ai-review-pane"><div className="review-pane-title"><div><h3>AI 建议与人工复核</h3><p>修改分数时必须填写该题改分理由</p></div>{selected.aiSuggestedTotal != null && <Badge tone="warning"><Sparkles size={13} />AI 建议 {selected.aiSuggestedTotal} 分</Badge>}</div>
            <div className="review-items">{items.map(item => <div className={cn('review-item', item.confidence === 'LOW' && 'low-confidence')} key={item.id}><div className="review-item-head"><strong>第 {item.number} 题</strong><Badge tone={item.confidence === 'LOW' ? 'danger' : item.confidence === 'MEDIUM' ? 'warning' : 'success'}>{confidenceName[item.confidence]}</Badge><span>满分 {item.fullScore} 分</span></div><div className="recognized-text"><span>识别作答</span><textarea rows="2" value={item.recognizedText || ''} onChange={e => updateItem(item.id, { recognizedText: e.target.value })} disabled={selected.status !== 'REVIEW_PENDING'} /></div><div className="rationale"><Sparkles size={14} /><p>{item.rationale}</p></div><div className="review-score-row"><div><span>AI 建议</span><b>{item.suggestedScore} 分</b></div><div><span>人工复核</span><div className="input-suffix score-input"><input type="number" min="0" max={item.fullScore} step="0.5" value={item.reviewedScore ?? item.suggestedScore} disabled={selected.status !== 'REVIEW_PENDING'} onChange={e => updateItem(item.id, { reviewedScore: Number(e.target.value) })} /><span>分</span></div></div></div>{Number(item.reviewedScore ?? item.suggestedScore) !== item.suggestedScore && <Field label="本题改分理由" required><input value={item.reviewReason || ''} onChange={e => updateItem(item.id, { reviewReason: e.target.value })} placeholder="说明评分点或 AI 误判原因" /></Field>}</div>)}</div>
            {selected.status === 'REVIEW_PENDING' && <div className="review-submit-area"><div className="review-total"><span>复核后总分</span><strong>{score(total)}<small> / {selected.subject?.fullScore}</small></strong>{total !== selected.aiSuggestedTotal && <Badge tone="blue">较 AI 建议 {total > selected.aiSuggestedTotal ? '+' : ''}{score(total - selected.aiSuggestedTotal)} 分</Badge>}</div><Field label="整卷审核备注"><input value={reason} onChange={e => setReason(e.target.value)} placeholder="选填：记录整体复核情况" /></Field><div className="review-buttons"><Button variant="ghost" icon={XCircle} onClick={() => setRejecting(!rejecting)}>驳回并补图</Button><Button icon={Check} loading={saving} onClick={review}>确认复核并入账</Button></div>{rejecting && <div className="reject-box"><Field label="驳回原因" required><textarea rows="2" value={rejectReason} onChange={e => setRejectReason(e.target.value)} placeholder="例如：第 2 页模糊，请重新拍摄并补齐页脚" /></Field><Button variant="danger" size="sm" loading={saving} onClick={reject}>确认驳回</Button></div>}</div>}
            {selected.status === 'POSTED' && <div className="posted-result"><CheckCircle2 size={25} /><div><b>已复核入账：{selected.reviewedTotal} 分</b><p>原 AI 建议 {selected.aiSuggestedTotal} 分仍完整保留，可追溯每题改分理由。</p></div></div>}
          </article>
        </section>
      </> : <EmptyState icon={FileText} title="选择一份试卷开始审核" />}</main>
    </div>
  </div>;
}
