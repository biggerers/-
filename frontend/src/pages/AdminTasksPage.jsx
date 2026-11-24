import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { CheckCircle2, ListChecks, RefreshCw, RotateCcw, Trash2, X } from 'lucide-react';
import { api, getToken } from '../api.js';
import { date } from '../utils.js';
import { Avatar, Badge, Button, EmptyState, Field, Modal, PageLoading, SectionHeader } from '../components/UI.jsx';

const taskStatusName = value => ({ PENDING: '待完成', SUBMITTED: '审核中', DONE: '答对了', STUCK: '不会', REVIEW: '完成需复习' }[value] || value || '待完成');
const remainingLabel = deadline => {
  const ms = new Date(deadline) - Date.now();
  if (ms <= 0) return '已超期';
  const days = Math.floor(ms / 86400000);
  const hours = Math.floor((ms % 86400000) / 3600000);
  const minutes = Math.floor((ms % 3600000) / 60000);
  return days > 0 ? `剩 ${days} 天 ${hours} 小时` : hours > 0 ? `剩 ${hours} 小时 ${minutes} 分` : `剩 ${minutes} 分钟`;
};

function TaskImage({ taskId, index }) {
  const [url, setUrl] = useState(null);
  const [zoom, setZoom] = useState(false);
  useEffect(() => {
    let active = true;
    fetch(`/api/tasks/${taskId}/files/${index}`, { headers: { Authorization: `Bearer ${getToken()}` } })
      .then(response => response.ok ? response.blob() : Promise.reject(new Error('图片加载失败')))
      .then(blob => { if (active) setUrl(URL.createObjectURL(blob)); })
      .catch(() => {});
    return () => { active = false; };
  }, [taskId, index]);
  useEffect(() => {
    if (!zoom) return;
    const onKey = event => { if (event.key === 'Escape') setZoom(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [zoom]);
  return <>
    {url ? <img className="plan-image zoomable" src={url} alt="任务题目图片" onClick={() => setZoom(true)} /> : <div className="plan-image loading" />}
    {zoom && url && createPortal(<div className="image-viewer" onClick={() => setZoom(false)}>
      <img src={url} alt="任务题目大图" onClick={event => event.stopPropagation()} />
      <button className="image-viewer-close" onClick={() => setZoom(false)} aria-label="关闭大图"><X size={22} /></button>
    </div>, document.body)}
  </>;
}

function AnswerImage({ taskId, userId, index }) {
  const [url, setUrl] = useState(null);
  const [zoom, setZoom] = useState(false);
  useEffect(() => {
    let active = true;
    fetch(`/api/tasks/${taskId}/answers/${userId}/${index}`, { headers: { Authorization: `Bearer ${getToken()}` } })
      .then(response => response.ok ? response.blob() : Promise.reject(new Error('答案加载失败')))
      .then(blob => { if (active) setUrl(URL.createObjectURL(blob)); })
      .catch(() => {});
    return () => { active = false; };
  }, [taskId, userId, index]);
  useEffect(() => {
    if (!zoom) return;
    const onKey = event => { if (event.key === 'Escape') setZoom(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [zoom]);
  return <>
    {url ? <img className="plan-image zoomable" src={url} alt="学生答案图片" onClick={() => setZoom(true)} /> : <div className="plan-image loading" />}
    {zoom && url && createPortal(<div className="image-viewer" onClick={() => setZoom(false)}>
      <img src={url} alt="学生答案大图" onClick={event => event.stopPropagation()} />
      <button className="image-viewer-close" onClick={() => setZoom(false)} aria-label="关闭大图"><X size={22} /></button>
    </div>, document.body)}
  </>;
}

export default function AdminTasksPage({ bootstrap, notify }) {
  const [tasks, setTasks] = useState(null);
  const [subjectId, setSubjectId] = useState('');
  const [subItemIds, setSubItemIds] = useState([]);
  const [deadline, setDeadline] = useState('');
  const [scopeAll, setScopeAll] = useState(true);
  const [recipients, setRecipients] = useState([]);
  const [note, setNote] = useState('');
  const [fileCount, setFileCount] = useState(0);
  const [saving, setSaving] = useState(false);
  const [grading, setGrading] = useState(null);
  const [confirmTask, setConfirmTask] = useState(null);
  const subjects = bootstrap.subjects || [];
  const students = bootstrap.students || [];
  const subject = subjects.find(item => item.id === subjectId);
  const load = async () => {
    try { setTasks(await api('/api/tasks')); }
    catch (err) { notify(err.message, 'error'); }
  };
  useEffect(() => { load(); }, []);
  const submit = async event => {
    event.preventDefault();
    if (!subjectId) { notify('请选择科目', 'error'); return; }
    if (!deadline) { notify('请设置截止时间', 'error'); return; }
    setSaving(true);
    try {
      const body = new FormData();
      body.append('subjectId', subjectId);
      body.append('subItemIds', JSON.stringify(subItemIds));
      body.append('deadline', new Date(deadline).toISOString());
      body.append('recipients', JSON.stringify(scopeAll ? [] : recipients));
      body.append('note', note);
      const input = document.getElementById('task-file-input');
      Array.from(input?.files || []).slice(0, 4).forEach(file => body.append('files', file));
      await api('/api/tasks', { method: 'POST', body });
      setSubjectId(''); setSubItemIds([]); setDeadline(''); setScopeAll(true); setRecipients([]); setNote('');
      if (input) input.value = '';
      setFileCount(0);
      await load();
      notify('任务已发布');
    } catch (err) { notify(err.message, 'error'); } finally { setSaving(false); }
  };
  const grade = async (task, student, result) => {
    setGrading(`${task.id}_${student.id}`);
    try {
      await api(`/api/tasks/${task.id}/grade`, { method: 'POST', body: { userId: student.id, result } });
      setTasks(current => current.map(item => item.id === task.id ? {
        ...item,
        statuses: [...(item.statuses || []).filter(s => s.userId !== student.id), { userId: student.id, status: result, files: (item.statuses || []).find(s => s.userId === student.id)?.files || [], updatedAt: new Date().toISOString() }]
      } : item));
      notify(result === 'DONE' ? `已判卷：${student.displayName} 答对了` : `已退回：${student.displayName} 待完成`);
    } catch (err) { notify(err.message, 'error'); } finally { setGrading(null); }
  };
  const remove = async () => {
    if (!confirmTask) return;
    setSaving(true);
    try {
      await api(`/api/tasks/${confirmTask.id}`, { method: 'DELETE' });
      setConfirmTask(null);
      await load();
      notify('任务已删除');
    } catch (err) { notify(err.message, 'error'); } finally { setSaving(false); }
  };
  return <div className="page-enter">
    <div className="page-title-row"><div><h1>任务发布</h1><p>发布任务后学生上传答案；在判卷区查看答案并标记「答对了」或退回「待完成」。</p></div><Badge tone="soft"><ListChecks size={14} />{tasks?.length ?? 0} 个任务</Badge></div>
    <div className="weekly-layout">
      <section className="card">
        <SectionHeader title="发布新任务" description="图片支持 JPG/PNG/WebP，最多 4 张。" action={<ListChecks size={21} className="accent-icon" />} />
        <form className="form-grid" onSubmit={submit}>
          <Field label="科目" required><select value={subjectId} onChange={e => { setSubjectId(e.target.value); setSubItemIds([]); }}>
            <option value="">请选择科目</option>
            {subjects.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select></Field>
          {subject && <Field label="分项（可多选）">
            <div className="subitem-picker">{subject.subItems.filter(item => item.status === 'ENABLED').map(item => <label key={item.id} className={subItemIds.includes(item.id) ? 'active' : ''}>
              <input type="checkbox" checked={subItemIds.includes(item.id)} onChange={() => setSubItemIds(current => current.includes(item.id) ? current.filter(id => id !== item.id) : [...current, item.id])} />
              {item.name}
            </label>)}</div>
          </Field>}
          <Field label="截止时间" required><input type="datetime-local" value={deadline} onChange={e => setDeadline(e.target.value)} /></Field>
          <Field label="接收范围" hint="默认所有学生">
            <div className="scope-picker">
              <label className={scopeAll ? 'active' : ''}><input type="radio" name="scope" checked={scopeAll} onChange={() => setScopeAll(true)} />所有用户</label>
              <label className={!scopeAll ? 'active' : ''}><input type="radio" name="scope" checked={!scopeAll} onChange={() => setScopeAll(false)} />指定学生</label>
            </div>
            {!scopeAll && <div className="subitem-picker">{students.map(student => <label key={student.id} className={recipients.includes(student.id) ? 'active' : ''}>
              <input type="checkbox" checked={recipients.includes(student.id)} onChange={() => setRecipients(current => current.includes(student.id) ? current.filter(id => id !== student.id) : [...current, student.id])} />
              {student.displayName}
            </label>)}</div>}
          </Field>
          <label className="plan-file-input"><input id="task-file-input" type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={e => setFileCount(Array.from(e.target.files || []).length)} /><span>{fileCount ? `已选择 ${fileCount} 张（最多 4 张）` : '选择任务题目图片（1-4 张）'}</span></label>
          <Field label="任务说明" hint="选填"><textarea rows="2" value={note} onChange={e => setNote(e.target.value)} placeholder="例如：完成阅读专项 2 篇并订正。" /></Field>
          <Button type="submit" loading={saving} icon={ListChecks}>发布任务</Button>
        </form>
      </section>
      <section className="card">
        <SectionHeader title="已发布任务 · 判卷" description="查看每位学生提交的答案，标记判卷结果。" action={<Button size="sm" variant="ghost" icon={RefreshCw} onClick={load}>刷新</Button>} />
        {tasks === null ? <PageLoading /> : tasks.length ? <div className="task-admin-list">{tasks.map(task => {
          const statusOf = userId => (task.statuses || []).find(item => item.userId === userId)?.status || 'PENDING';
          const recordOf = userId => (task.statuses || []).find(item => item.userId === userId) || null;
          const stats = { DONE: 0, SUBMITTED: 0, PENDING: 0 };
          for (const student of task.students) stats[statusOf(student.id)] += 1;
          return <article className="task-row" key={task.id}>
            <div className="task-row-head">
              <b>{task.subject?.name}</b>
              {task.subItems.map(item => <Badge key={item.id} tone="blue">{item.name}</Badge>)}
              <Badge tone={new Date(task.deadline) < new Date() ? 'danger' : 'success'}>{remainingLabel(task.deadline)}</Badge>
              <Badge tone="soft">{task.recipients?.length ? `指定 ${task.recipients.length} 人` : '全部学生'}</Badge>
            </div>
            <div className="plan-images">{task.files.map((file, index) => <TaskImage key={file.storedName} taskId={task.id} index={index} />)}</div>
            {task.note && <p className="plan-note">{task.note}</p>}
            <div className="task-stats">答对了 {stats.DONE}/{task.students.length} · 审核中 {stats.SUBMITTED} · 待完成 {stats.PENDING} · 截止 {date(task.deadline, true)}</div>
            <div className="grade-list">{task.students.map(student => {
              const status = statusOf(student.id);
              const record = recordOf(student.id);
              const key = `${task.id}_${student.id}`;
              return <div className="grade-row" key={student.id}>
                <div className="grade-row-user"><Avatar user={student} size="sm" /><div><b>{student.displayName}</b><span>{taskStatusName(status)}{record?.submittedAt ? ` · 提交于 ${date(record.submittedAt, true)}` : ''}</span></div></div>
                <div className="plan-images">{(record?.files || []).map((file, index) => <AnswerImage key={file.storedName} taskId={task.id} userId={student.id} index={index} />)}</div>
                <div className="grade-actions">
                  {status !== 'DONE' && <Button size="sm" variant="secondary" icon={CheckCircle2} loading={grading === key} onClick={() => grade(task, student, 'DONE')}>答对了</Button>}
                  {status !== 'PENDING' && <Button size="sm" variant="ghost" icon={RotateCcw} loading={grading === key} onClick={() => grade(task, student, 'PENDING')}>退回待完成</Button>}
                </div>
              </div>;
            })}</div>
            <div className="task-admin-actions"><Button size="sm" variant="ghost" icon={Trash2} onClick={() => setConfirmTask(task)}>删除任务</Button></div>
          </article>;
        })}</div> : <EmptyState icon={ListChecks} title="还没有发布任务" description="在左侧发布第一个任务。" />}
      </section>
    </div>
    {confirmTask && <Modal title="删除任务" description={`确认删除「${confirmTask.subject?.name}」的这个任务？学生的答案与判卷记录会一并删除。`} onClose={() => setConfirmTask(null)} footer={<><Button variant="ghost" onClick={() => setConfirmTask(null)}>取消</Button><Button tone="danger" onClick={remove} loading={saving}>删除</Button></>}>
      <div className="plan-images">{confirmTask.files.map((file, index) => <TaskImage key={file.storedName} taskId={confirmTask.id} index={index} />)}</div>
    </Modal>}
  </div>;
}
