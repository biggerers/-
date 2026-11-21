import React, { useCallback, useEffect, useState } from 'react';
import { KeyRound, Search, ShieldCheck, UserCheck, UserPlus, UserX } from 'lucide-react';
import { api } from '../api.js';
import { date, roleName } from '../utils.js';
import { Avatar, Badge, Button, Field, Modal, PageLoading, StatusBadge } from '../components/UI.jsx';

const emptyForm = { account: '', displayName: '', role: 'STUDENT', initialPassword: 'Study@2026' };
export default function UsersPage({ notify }) {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [credential, setCredential] = useState(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    setLoading(true);
    try { setUsers(await api('/api/users')); } catch (err) { notify(err.message, 'error'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);
  const create = async event => {
    event?.preventDefault(); setSaving(true); setError('');
    try {
      const result = await api('/api/users', { method: 'POST', body: form });
      setShowCreate(false);
      setCredential({ user: result.user, password: result.initialPassword, title: '账号创建成功' });
      setForm(emptyForm); await load();
    } catch (err) { setError(err.message); } finally { setSaving(false); }
  };
  const toggle = async user => {
    try {
      const disabling = user.status === 'ACTIVE';
      await api(`/api/users/${user.id}`, { method: 'PATCH', body: { status: disabling ? 'DISABLED' : 'ACTIVE', reason: disabling ? '停用账号，保留历史数据' : '重新启用账号' } });
      await load(); notify(disabling ? '账号已停用，历史数据仍保留。' : '账号已重新启用');
    } catch (err) { notify(err.message, 'error'); }
  };
  const reset = async user => {
    if (!window.confirm(`确认重置 ${user.displayName} 的密码？所有旧会话将失效。`)) return;
    try {
      const result = await api(`/api/users/${user.id}/reset-password`, { method: 'POST' });
      setCredential({ user, password: result.initialPassword, title: '密码已重置' });
    } catch (err) { notify(err.message, 'error'); }
  };
  return <div className="page-enter">
    <div className="page-title-row"><div><h1>用户管理</h1><p>账号在小组内唯一；停用不删除任何学习历史。</p></div><Button icon={UserPlus} onClick={() => setShowCreate(true)}>创建用户</Button></div>
    <section className="card table-card">
      <div className="table-toolbar"><div className="toolbar-search"><Search size={17} /><input placeholder="搜索姓名或账号…" onChange={e => { const key = e.target.value.toLowerCase(); document.querySelectorAll('.user-table-row').forEach(row => { row.style.display = row.dataset.search.includes(key) ? '' : 'none'; }); }} /></div><Badge tone="soft"><ShieldCheck size={13} />密码仅保存强哈希</Badge></div>
      {loading ? <PageLoading /> : <div className="table-scroll"><table><thead><tr><th>成员</th><th>登录账号</th><th>角色</th><th>状态</th><th>最近登录</th><th>操作</th></tr></thead><tbody>{users.map(user => <tr key={user.id} className="user-table-row" data-search={`${user.displayName} ${user.account}`.toLowerCase()}><td><div className="user-cell"><Avatar user={user} size="sm" /><b>{user.displayName}</b></div></td><td><code>{user.account}</code></td><td><Badge tone={user.role === 'ADMIN' ? 'blue' : 'soft'}>{roleName(user.role)}</Badge></td><td><StatusBadge status={user.status} /></td><td>{date(user.lastLoginAt, true)}</td><td><div className="table-actions"><Button variant="ghost" size="sm" icon={KeyRound} onClick={() => reset(user)}>重置密码</Button><Button variant="ghost" size="sm" icon={user.status === 'ACTIVE' ? UserX : UserCheck} onClick={() => toggle(user)}>{user.status === 'ACTIVE' ? '停用' : '启用'}</Button></div></td></tr>)}</tbody></table></div>}
    </section>
    <div className="security-footnote"><ShieldCheck size={16} />初始密码仅显示一次；学生访问管理接口会返回 403；重置后旧会话全部失效。</div>
    {showCreate && <Modal title="创建小组成员" description="请把初始密码通过安全方式交给本人。" onClose={() => setShowCreate(false)} footer={<><Button variant="ghost" onClick={() => setShowCreate(false)}>取消</Button><Button loading={saving} onClick={create}>创建账号</Button></>}><form className="form-grid" onSubmit={create}><div className="grid-2"><Field label="展示姓名" required><input value={form.displayName} onChange={e => setForm({ ...form, displayName: e.target.value })} required /></Field><Field label="登录账号" required><input value={form.account} onChange={e => setForm({ ...form, account: e.target.value })} placeholder="4–32 位字母、数字或下划线" required /></Field></div><div className="grid-2"><Field label="角色"><select value={form.role} onChange={e => setForm({ ...form, role: e.target.value })}><option value="STUDENT">学生</option><option value="ADMIN">小组管理员</option></select></Field><Field label="初始密码" required><input value={form.initialPassword} onChange={e => setForm({ ...form, initialPassword: e.target.value })} required /></Field></div>{error && <div className="form-error">{error}</div>}<button hidden type="submit" /></form></Modal>}
    {credential && <Modal title={credential.title} description="密码只显示这一次，关闭后只能重新重置。" onClose={() => setCredential(null)} footer={<Button onClick={() => setCredential(null)}>我已安全保存</Button>}><div className="credential-box"><Avatar user={credential.user} size="lg" /><h3>{credential.user.displayName}</h3><p>登录账号</p><code>{credential.user.account}</code><p>一次性初始密码</p><code className="credential-password">{credential.password}</code><Button variant="secondary" size="sm" onClick={() => { navigator.clipboard?.writeText(`账号：${credential.user.account}\n密码：${credential.password}`); notify('已复制，请安全发送。'); }}>复制账号信息</Button></div></Modal>}
  </div>;
}
