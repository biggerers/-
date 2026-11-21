import React, { useState } from 'react';
import { FileText, Info, LoaderCircle, ScanSearch } from 'lucide-react';
import { api } from '../api.js';
import { difficultyName } from '../utils.js';
import { Badge, Button, Field, Modal } from '../components/UI.jsx';

export default function QuestionPdfModal({ bootstrap, onClose, onSaved, notify }) {
  const [file, setFile] = useState(null);
  const [form, setForm] = useState({ subjectId: bootstrap.subjects[0]?.id || '', source: '', copyrightStatus: 'PENDING' });
  const [meta, setMeta] = useState(null);
  const [items, setItems] = useState(null);
  const [parsing, setParsing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState('');
  const subject = bootstrap.subjects.find(item => item.id === form.subjectId);
  const patchItem = (index, patch) => setItems(value => value?.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item) ?? value);

  const parse = async () => {
    if (!file) return setError('请先选择一张文字版 PDF 试卷');
    setParsing(true); setError('');
    try {
      const body = new FormData();
      body.append('file', file);
      body.append('subjectId', form.subjectId);
      body.append('source', form.source);
      body.append('copyrightStatus', form.copyrightStatus);
      const result = await api('/api/questions/parse-pdf', { method: 'POST', body });
      setMeta({ pageCount: result.pageCount, textLength: result.textLength });
      setItems(result.questions.map(item => ({ ...item, selected: true })));
    } catch (err) { setError(err.message); setItems(null); setMeta(null); }
    finally { setParsing(false); }
  };

  const saveSelected = async () => {
    const selected = (items || []).filter(item => item.selected);
    if (!selected.length) return setError('请至少勾选一道要保存的题目');
    setImporting(true); setError('');
    let success = 0; let duplicate = 0;
    for (const item of selected) {
      try {
        await api('/api/questions', { method: 'POST', body: { ...item, qualityStatus: 'DRAFT', allowDuplicate: false } });
        success += 1;
      } catch (err) { if (err.code === 'POSSIBLE_DUPLICATE') duplicate += 1; }
    }
    setImporting(false);
    notify(`已保存 ${success} / ${selected.length} 道草稿${duplicate ? `，跳过 ${duplicate} 道疑似重复题` : ''}。`);
    onSaved();
  };

  return <Modal title="录入 PDF 试卷" description="上传整张试卷，系统会提取题目并按科目分项预分类；保存后请逐题校对。" onClose={onClose} width="860px" footer={<>
    <Button variant="ghost" onClick={onClose}>取消</Button>
    {items?.length ? <Button variant="secondary" icon={ScanSearch} loading={parsing} onClick={parse}>重新解析</Button> : null}
    {items?.length ? <Button loading={importing} onClick={saveSelected}>保存 {items.filter(item => item.selected).length} 道草稿</Button> : <Button icon={ScanSearch} loading={parsing} onClick={parse}>解析试卷</Button>}
  </>}>
    <div className="form-grid">
      <div className="grid-2">
        <Field label="所属科目" required>
          <select value={form.subjectId} onChange={e => setForm({ ...form, subjectId: e.target.value })}>
            {bootstrap.subjects.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
        </Field>
        <Field label="来源" required hint="默认取文件名，可改成考试名称">
          <input value={form.source} onChange={e => setForm({ ...form, source: e.target.value })} placeholder="例如：2026 秋季阶段卷" />
        </Field>
      </div>
      <div className="grid-2">
        <Field label="PDF 试卷" required hint="支持文字版 PDF；扫描图片版无法直接识别">
          <input type="file" accept=".pdf,application/pdf" onChange={event => { const next = event.target.files?.[0]; setFile(next || null); setItems(null); setMeta(null); if (next) setForm(value => ({ ...value, source: value.source || next.name.replace(/\.pdf$/i, '') })); }} />
        </Field>
        <Field label="版权 / 授权状态">
          <select value={form.copyrightStatus} onChange={e => setForm({ ...form, copyrightStatus: e.target.value })}>
            <option value="PENDING">待确认</option>
            <option value="AUTHORIZED">已获授权</option>
            <option value="ORIGINAL">小组原创</option>
          </select>
        </Field>
      </div>
      {error && <div className="form-error"><Info size={16} /><span>{error}</span></div>}
      {meta && <div className="pdf-parse-meta"><Badge tone="muted"><FileText size={13} />{meta.pageCount} 页</Badge><Badge tone="muted"><LoaderCircle size={13} />有效文本 {meta.textLength} 字</Badge><Badge tone="warning">{items.length} 道题待确认</Badge></div>}
      {items?.length ? <div className="pdf-question-list">
        {items.map((item, index) => {
          const itemSubject = bootstrap.subjects.find(value => value.id === item.subjectId);
          return <article key={index} className={item.selected ? 'pdf-question-card selected' : 'pdf-question-card'}>
            <header><label><input type="checkbox" checked={item.selected} onChange={e => patchItem(index, { selected: e.target.checked })} /><b>第 {index + 1} 题</b></label><Badge tone="muted">{item.type} · {difficultyName(item.difficulty)} · {item.fullScore} 分</Badge></header>
            <p>{item.stem.length > 220 ? `${item.stem.slice(0, 220)}…` : item.stem}</p>
            {item.options.length ? <small>{item.options.length} 个选项</small> : null}
            <div className="pdf-question-controls">
              <label>分项<select value={item.subItemId} onChange={e => patchItem(index, { subItemId: e.target.value })}>{itemSubject?.subItems.map(value => <option key={value.id} value={value.id}>{value.name}</option>)}</select></label>
              <label>题型<select value={item.type} onChange={e => patchItem(index, { type: e.target.value })}>{['选择题', '填空题', '解答题', '简答题', '阅读理解', '实验题', '作文'].map(value => <option key={value}>{value}</option>)}</select></label>
              <label>分值<input type="number" min="0.5" step="0.5" value={item.fullScore} onChange={e => patchItem(index, { fullScore: Number(e.target.value) })} /></label>
            </div>
          </article>;
        })}
      </div> : null}
    </div>
  </Modal>;
}
