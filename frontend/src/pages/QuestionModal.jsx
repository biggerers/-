import React, { useState } from 'react';
import { Info } from 'lucide-react';
import { api } from '../api.js';
import { Button, Field, Modal } from '../components/UI.jsx';

export default function QuestionModal({ bootstrap, question, onClose, onSaved, notify }) {
  const [form, setForm] = useState(() => ({
    subjectId: question?.subjectId || bootstrap.subjects[0]?.id,
    subItemId: question?.subItemId || bootstrap.subjects[0]?.subItems[0]?.id,
    stem: question?.stem || '', answer: question?.answer || '', analysis: question?.analysis || '',
    knowledge: question?.knowledge || '', type: question?.type || '选择题',
    difficulty: question?.difficulty || 1, fullScore: question?.fullScore || 3,
    source: question?.source || '小组原创', copyrightStatus: question?.copyrightStatus || 'ORIGINAL',
    qualityStatus: question?.qualityStatus || 'DRAFT', version: question?.version,
    optionsText: question?.options?.join('\n') || ''
  }));
  const [saving, setSaving] = useState(false); const [error, setError] = useState(''); const [duplicate, setDuplicate] = useState(false);
  const subject = bootstrap.subjects.find(item => item.id === form.subjectId);
  const changeSubject = subjectId => { const next = bootstrap.subjects.find(item => item.id === subjectId); setForm({ ...form, subjectId, subItemId: next?.subItems[0]?.id || '' }); };
  const save = async (event, allowDuplicate = false) => {
    event?.preventDefault(); setSaving(true); setError('');
    const body = { ...form, options: form.optionsText.split('\n').map(item => item.trim()).filter(Boolean), allowDuplicate };
    delete body.optionsText;
    try {
      await api(question ? `/api/questions/${question.id}` : '/api/questions', { method: question ? 'PATCH' : 'POST', body });
      notify(question ? '试题校对已保存，版本号已递增。' : body.qualityStatus === 'PUBLISHED' ? '试题已校对并上架。' : '试题草稿已保存。'); onSaved();
    } catch (err) { setError(err.message); setDuplicate(err.code === 'POSSIBLE_DUPLICATE'); }
    finally { setSaving(false); }
  };
  return <Modal title={question ? '校对试题' : '录入新试题'} description="题干、答案、评分依据和版权状态均可追踪；未达质量门槛不能上架。" onClose={onClose} width="720px" footer={<><Button variant="ghost" onClick={onClose}>取消</Button><Button loading={saving} onClick={save}>{form.qualityStatus === 'PUBLISHED' ? '校对并上架' : '保存草稿'}</Button></>}>
    <form className="form-grid" onSubmit={save}>
      <div className="grid-3"><Field label="科目" required><select value={form.subjectId} onChange={e => changeSubject(e.target.value)}>{bootstrap.subjects.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field><Field label="分项" required><select value={form.subItemId} onChange={e => setForm({ ...form, subItemId: e.target.value })}>{subject?.subItems.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field><Field label="知识点"><input value={form.knowledge} onChange={e => setForm({ ...form, knowledge: e.target.value })} placeholder="例如：一次方程" /></Field></div>
      <Field label="题干" required><textarea rows="4" value={form.stem} onChange={e => setForm({ ...form, stem: e.target.value })} required placeholder="输入完整、无歧义的题目内容" /></Field>
      <Field label="选项" hint="每行一个，非选择题可留空"><textarea rows="3" value={form.optionsText} onChange={e => setForm({ ...form, optionsText: e.target.value })} placeholder={'A. 选项一\nB. 选项二'} /></Field>
      <div className="grid-2"><Field label="标准答案" required={form.qualityStatus === 'PUBLISHED'}><textarea rows="3" value={form.answer} onChange={e => setForm({ ...form, answer: e.target.value })} placeholder="客观题答案或主观题评分要点" /></Field><Field label="解析 / 评分依据"><textarea rows="3" value={form.analysis} onChange={e => setForm({ ...form, analysis: e.target.value })} placeholder="说明关键步骤和给分点" /></Field></div>
      <div className="grid-4"><Field label="题型"><select value={form.type} onChange={e => setForm({ ...form, type: e.target.value })}>{['选择题', '填空题', '解答题', '简答题', '阅读理解', '实验题', '作文'].map(type => <option key={type}>{type}</option>)}</select></Field><Field label="难度"><select value={form.difficulty} onChange={e => setForm({ ...form, difficulty: Number(e.target.value) })}><option value="1">基础</option><option value="2">进阶</option><option value="3">挑战</option></select></Field><Field label="题目分值" required><input type="number" min="0.5" step="0.5" value={form.fullScore} onChange={e => setForm({ ...form, fullScore: Number(e.target.value) })} required /></Field><Field label="质量状态"><select value={form.qualityStatus} onChange={e => setForm({ ...form, qualityStatus: e.target.value })}><option value="DRAFT">待校对</option><option value="PUBLISHED">已上架</option><option value="DISABLED">已停用</option></select></Field></div>
      <div className="grid-2"><Field label="来源" required><input value={form.source} onChange={e => setForm({ ...form, source: e.target.value })} required /></Field><Field label="版权 / 授权状态"><select value={form.copyrightStatus} onChange={e => setForm({ ...form, copyrightStatus: e.target.value })}><option value="ORIGINAL">小组原创</option><option value="AUTHORIZED">已获授权</option><option value="PENDING">待确认</option></select></Field></div>
      {error && <div className="form-error"><Info size={16} /><span>{error}</span></div>}
      {duplicate && <Button variant="secondary" size="sm" loading={saving} onClick={event => save(event, true)}>确认不是重复题，保留独立题</Button>}
      <button type="submit" hidden />
    </form>
  </Modal>;
}
