import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CheckCircle2, ChevronDown, FileText, FileUp, Filter, LibraryBig, Plus, Search, ShieldCheck } from 'lucide-react';
import { api } from '../api.js';
import { difficultyName, score } from '../utils.js';
import { Badge, Button, EmptyState, PageLoading, StatusBadge } from '../components/UI.jsx';
import QuestionModal from './QuestionModal.jsx';
import QuestionPdfModal from './QuestionPdfModal.jsx';

export default function QuestionsPage({ bootstrap, notify }) {
  const [questions, setQuestions] = useState(null);
  const [subjectId, setSubjectId] = useState(''); const [status, setStatus] = useState(''); const [keyword, setKeyword] = useState('');
  const [modal, setModal] = useState(null); const fileRef = useRef(null);
  const load = useCallback(() => api('/api/questions').then(setQuestions).catch(err => notify(err.message, 'error')), []);
  useEffect(() => { load(); }, [load]);
  const filtered = useMemo(() => (questions || []).filter(question => (!subjectId || question.subjectId === subjectId) && (!status || question.qualityStatus === status) && (!keyword || `${question.stem} ${question.knowledge}`.toLowerCase().includes(keyword.toLowerCase()))), [questions, subjectId, status, keyword]);
  const changeStatus = async (question, qualityStatus) => {
    if (qualityStatus === 'DISABLED' && !window.confirm('停用后新组卷不可再选此题，历史 PDF 和作答记录不受影响。确认停用？')) return;
    try { await api(`/api/questions/${question.id}`, { method: 'PATCH', body: { version: question.version, qualityStatus, reason: qualityStatus === 'PUBLISHED' ? '完成校对并上架' : '停用错误题，保留历史引用' } }); await load(); notify(qualityStatus === 'PUBLISHED' ? '试题已上架，可用于新组卷。' : '试题已停用，历史引用保留。'); }
    catch (err) { notify(err.message, 'error'); }
  };
  const importJson = async file => {
    if (!file) return;
    try {
      const data = JSON.parse(await file.text()); const list = Array.isArray(data) ? data : [data];
      let success = 0;
      for (const item of list) {
        try { await api('/api/questions', { method: 'POST', body: { ...item, qualityStatus: 'DRAFT' } }); success += 1; } catch { /* 单题失败继续，其余保留 */ }
      }
      notify(`已导入 ${success} / ${list.length} 道草稿，请逐题校对后上架。`); await load();
    } catch { notify('JSON 文件格式不正确，请按示例字段准备数据。', 'error'); }
    fileRef.current.value = '';
  };
  return <div className="page-enter">
    <div className="page-title-row"><div><h1>试题知识库</h1><p>从录入、校对到上架，每一道题都有来源与质量状态。</p></div><div className="title-actions"><input ref={fileRef} type="file" accept="application/json" hidden onChange={e => importJson(e.target.files[0])} /><Button variant="secondary" icon={FileUp} onClick={() => fileRef.current.click()}>导入 JSON</Button><Button variant="secondary" icon={FileText} onClick={() => setModal({ type: 'pdf' })}>录入 PDF 试卷</Button><Button icon={Plus} onClick={() => setModal({ type: 'create' })}>录入试题</Button></div></div>
    <section className="bank-metrics"><div><strong>{questions?.length || 0}</strong><span>题库总量</span></div><div><strong>{questions?.filter(item => item.qualityStatus === 'PUBLISHED').length || 0}</strong><span>已上架</span></div><div><strong>{questions?.filter(item => item.qualityStatus === 'DRAFT').length || 0}</strong><span>待校对</span></div><div><strong>0</strong><span>非变式重复导出</span></div><p><ShieldCheck size={16} />无答案、无分值、版权待确认的题不能上架</p></section>
    <section className="card table-card"><div className="table-toolbar question-filters"><div className="toolbar-search"><Search size={17} /><input value={keyword} onChange={e => setKeyword(e.target.value)} placeholder="搜索题干或知识点…" /></div><select value={subjectId} onChange={e => setSubjectId(e.target.value)}><option value="">全部科目</option>{bootstrap.subjects.map(subject => <option value={subject.id} key={subject.id}>{subject.name}</option>)}</select><select value={status} onChange={e => setStatus(e.target.value)}><option value="">全部状态</option><option value="PUBLISHED">已上架</option><option value="DRAFT">待校对</option><option value="DISABLED">已停用</option></select><Badge tone="muted"><Filter size={13} />{filtered.length} 道</Badge></div>
      {!questions ? <PageLoading /> : filtered.length ? <div className="table-scroll"><table className="question-table"><thead><tr><th>题目内容</th><th>科目 / 分项</th><th>题型 / 难度</th><th>分值</th><th>来源与版权</th><th>状态</th><th>操作</th></tr></thead><tbody>{filtered.map(question => { const subject = bootstrap.subjects.find(item => item.id === question.subjectId); const subItem = subject?.subItems.find(item => item.id === question.subItemId); return <tr key={question.id}><td className="question-stem-cell"><b>{question.stem}</b><span>{question.knowledge || '未标知识点'} · V{question.version}</span></td><td>{subject?.name}<small className="table-sub">{subItem?.name || '未关联分项'}</small></td><td>{question.type}<small className="table-sub">{difficultyName(question.difficulty)}</small></td><td>{score(question.fullScore)} 分</td><td>{question.source}<small className="table-sub">{({ ORIGINAL: '原创', AUTHORIZED: '已授权', PENDING: '版权待确认' })[question.copyrightStatus]}</small></td><td><StatusBadge status={question.qualityStatus} /></td><td><div className="table-actions"><Button variant="ghost" size="sm" onClick={() => setModal({ type: 'edit', question })}>校对</Button>{question.qualityStatus === 'PUBLISHED' ? <Button variant="ghost" size="sm" onClick={() => changeStatus(question, 'DISABLED')}>停用</Button> : <Button variant="soft" size="sm" onClick={() => changeStatus(question, 'PUBLISHED')}>上架</Button>}</div></td></tr>; })}</tbody></table></div> : <EmptyState icon={LibraryBig} title="没有符合条件的试题" description="调整筛选条件，或录入一道新题。" />}</section>
    {modal?.type === 'pdf' && <QuestionPdfModal bootstrap={bootstrap} onClose={() => setModal(null)} onSaved={() => { setModal(null); load(); }} notify={notify} />}
    {modal?.type === 'create' && <QuestionModal bootstrap={bootstrap} question={modal.question} onClose={() => setModal(null)} onSaved={() => { setModal(null); load(); }} notify={notify} />}
  </div>;
}
