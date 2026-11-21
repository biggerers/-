import React, { useCallback, useEffect, useState } from 'react';
import { Check, Plus, Trash2 } from 'lucide-react';
import { api } from '../api.js';
import { cn, score } from '../utils.js';
import { Badge, Button, Field, Modal, PageLoading, SubjectIcon } from '../components/UI.jsx';

export default function SubjectsPage({ bootstrap, notify, refreshBootstrap }) {
  const [subjects, setSubjects] = useState([]);
  const [selectedId, setSelectedId] = useState(bootstrap.subjects[0]?.id);
  const [draft, setDraft] = useState(null);
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [newSubject, setNewSubject] = useState({ name: '', code: '', fullScore: 100 });
  const load = useCallback(async () => { const data = await api('/api/subjects'); setSubjects(data); return data; }, []);
  useEffect(() => { load().catch(err => notify(err.message, 'error')); }, [load]);
  useEffect(() => { const selected = subjects.find(item => item.id === selectedId); if (selected) setDraft(structuredClone(selected)); }, [selectedId, subjects]);
  const updateItem = (index, changes) => setDraft(current => ({ ...current, subItems: current.subItems.map((item, i) => i === index ? { ...item, ...changes } : item) }));
  const sum = draft?.subItems.filter(item => item.status !== 'DISABLED').reduce((total, item) => total + Number(item.fullScore || 0), 0) || 0;
  const balanced = draft && Math.abs(sum - Number(draft.fullScore)) < 0.001;
  const save = async () => {
    if (!reason.trim()) { notify('请填写本次结构调整原因', 'error'); return; }
    setSaving(true);
    try {
      await api(`/api/subjects/${draft.id}`, { method: 'PUT', body: { ...draft, reason } });
      await load(); await refreshBootstrap(); setReason(''); notify(`已保存为结构 V${draft.version + 1}，历史成绩仍保留原满分。`);
    } catch (err) { notify(err.message, 'error'); } finally { setSaving(false); }
  };
  const create = async event => {
    event?.preventDefault();
    try {
      const created = await api('/api/subjects', { method: 'POST', body: { ...newSubject, subItems: [] } });
      setShowCreate(false); setSelectedId(created.id); await load(); await refreshBootstrap(); notify('新科目已创建，可继续添加分项。');
    } catch (err) { notify(err.message, 'error'); }
  };
  return <div className="page-enter">
    <div className="page-title-row"><div><h1>科目设置</h1><p>满分与分项变更创建新结构版本，不污染历史评估。</p></div><Button icon={Plus} onClick={() => setShowCreate(true)}>新增科目</Button></div>
    <div className="subject-admin-layout"><aside className="card subject-admin-list">{subjects.map(subject => <button key={subject.id} className={selectedId === subject.id ? 'active' : ''} onClick={() => setSelectedId(subject.id)}><SubjectIcon subject={subject} /><div><b>{subject.name}</b><span>{subject.code} · {subject.fullScore} 分</span></div><Badge tone={subject.status === 'ENABLED' ? 'success' : 'muted'}>V{subject.version}</Badge></button>)}</aside>
      {draft ? <article className="card subject-editor">
        <div className="editor-head"><div><h2>{draft.name}结构</h2><p>编码 {draft.code} 创建后不可修改 · 当前 V{draft.version}</p></div><Badge tone={draft.status === 'ENABLED' ? 'success' : 'muted'}>{draft.status === 'ENABLED' ? '已启用' : '已停用'}</Badge></div>
        <div className="grid-2"><Field label="科目名称"><input value={draft.name} onChange={e => setDraft({ ...draft, name: e.target.value })} /></Field><Field label="科目总分" required><div className="input-suffix"><input type="number" min="0.1" step="0.1" value={draft.fullScore} onChange={e => setDraft({ ...draft, fullScore: Number(e.target.value) })} /><span>分</span></div></Field></div>
        <div className="subitem-editor-head"><div><h3>分项与满分</h3><p>启用分项合计必须等于科目总分。</p></div><Button variant="soft" size="sm" icon={Plus} onClick={() => setDraft({ ...draft, subItems: [...draft.subItems, { name: `新分项 ${draft.subItems.length + 1}`, fullScore: 0, status: 'ENABLED' }] })}>添加分项</Button></div>
        <div className="subitem-editor">{draft.subItems.map((item, index) => <div key={item.id || index}><span className="drag-handle">{String(index + 1).padStart(2, '0')}</span><input value={item.name} onChange={e => updateItem(index, { name: e.target.value })} /><div className="input-suffix small-input"><input type="number" min="0" step="0.1" value={item.fullScore} onChange={e => updateItem(index, { fullScore: Number(e.target.value) })} /><span>分</span></div><button className="delete-subitem" onClick={() => setDraft({ ...draft, subItems: draft.subItems.filter((_, i) => i !== index) })} title="移除分项"><Trash2 size={16} /></button></div>)}</div>
        <div className={cn('score-balance', balanced ? 'balanced' : 'unbalanced')}><div><span>启用分项合计</span><strong>{score(sum)} / {score(draft.fullScore)}</strong></div>{balanced ? <Badge tone="success"><Check size={13} />分值平衡</Badge> : <Badge tone="danger">差额 {score(Math.abs(Number(draft.fullScore) - sum))} 分</Badge>}</div>
        <Field label="版本调整原因" required><input value={reason} onChange={e => setReason(e.target.value)} placeholder="例如：按最新统一考试结构更新满分" /></Field>
        <div className="editor-actions"><Button variant="ghost" onClick={() => setDraft(structuredClone(subjects.find(item => item.id === selectedId)))}>放弃更改</Button><Button loading={saving} disabled={!draft.subItems.length || !balanced} onClick={save}>保存为新版本</Button></div>
      </article> : <PageLoading />}
    </div>
    {showCreate && <Modal title="新增科目" description="创建后可继续配置分项，满分以实际考试口径为准。" onClose={() => setShowCreate(false)} footer={<><Button variant="ghost" onClick={() => setShowCreate(false)}>取消</Button><Button onClick={create}>创建科目</Button></>}><form className="form-grid" onSubmit={create}><Field label="科目名称" required><input value={newSubject.name} onChange={e => setNewSubject({ ...newSubject, name: e.target.value })} required /></Field><Field label="唯一编码" hint="大写字母开头，例如 HISTORY" required><input value={newSubject.code} onChange={e => setNewSubject({ ...newSubject, code: e.target.value.toUpperCase() })} required /></Field><Field label="科目总分" required><input type="number" min="1" value={newSubject.fullScore} onChange={e => setNewSubject({ ...newSubject, fullScore: Number(e.target.value) })} required /></Field></form></Modal>}
  </div>;
}
