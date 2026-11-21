import React, { useState } from 'react';
import { ArrowRight, BookOpen, Eye, EyeOff, LockKeyhole, ShieldCheck, Sparkles, Target, UserRound, WandSparkles } from 'lucide-react';
import { api, setToken } from './api.js';
import { BrandMark, Button, Field } from './components/UI.jsx';

export default function Login({ onLogin }) {
  const [account, setAccount] = useState(''); const [password, setPassword] = useState(''); const [showPassword, setShowPassword] = useState(false); const [loading, setLoading] = useState(false); const [error, setError] = useState('');
  const submit = async event => {
    event.preventDefault(); setLoading(true); setError('');
    try { const result = await api('/api/auth/login', { method: 'POST', body: { account, password } }); setToken(result.token); await onLogin(result.user); }
    catch (err) { setError(err.message); setToken(null); } finally { setLoading(false); }
  };
  return <main className="login-page">
    <section className="login-brand-panel"><div className="login-orb orb-one" /><div className="login-orb orb-two" /><div className="login-brand"><BrandMark /><div><strong>同窗进阶</strong><small>TONGCHUANG GROWTH</small></div></div><div className="login-story"><span className="login-eyebrow"><Sparkles size={14} />三人共学 · AI 学习闭环</span><h1>让目标看得见，<br />让进步<span>有迹可循。</span></h1><p>从一次练习开始，走完「练习—判卷—诊断—更新—再练习」。每个人的起点不同，成长不需要排名。</p><div className="login-flow"><div><span><Target size={20} /></span><b>看见目标</b><small>个人差距可解释</small></div><i><ArrowRight size={17} /></i><div><span><WandSparkles size={20} /></span><b>针对练习</b><small>题目永久不重复</small></div><i><ArrowRight size={17} /></i><div><span><ShieldCheck size={20} /></span><b>可信反馈</b><small>AI 建议人工复核</small></div></div></div><div className="login-quote"><BookOpen size={21} /><p>“我们约定的不是分数本身，<br />而是把自己的方法讲给同伴听，三个人一起往前走。”</p><span>—— UP·03 三人共学共同体</span></div><div className="login-brand-foot"><span>进步优先于名次</span><i /> <span>可比才比较</span><i /><span>关系安全一票否决</span></div></section>
    <section className="login-form-panel"><div className="login-form-wrap"><div className="mobile-login-brand"><BrandMark /><strong>同窗进阶</strong></div><div className="login-form-heading"><span className="eyebrow">WELCOME BACK</span><h2>欢迎回来</h2><p>登录后继续你的本周学习闭环。</p></div><form onSubmit={submit} className="login-form"><Field label="登录账号"><div className="login-input"><UserRound size={18} /><input value={account} onChange={e => setAccount(e.target.value)} placeholder="请输入账号" autoComplete="username" required autoFocus /></div></Field><Field label="登录密码"><div className="login-input"><LockKeyhole size={18} /><input type={showPassword ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)} placeholder="请输入密码" autoComplete="current-password" required /><button type="button" onClick={() => setShowPassword(!showPassword)} aria-label={showPassword ? '隐藏密码' : '显示密码'}>{showPassword ? <EyeOff size={17} /> : <Eye size={17} />}</button></div></Field>{error && <div className="login-error" role="alert">{error}</div>}<Button type="submit" size="lg" loading={loading} className="login-submit">进入学习空间<ArrowRight size={17} /></Button></form></div><footer className="login-form-foot">未成年人学习数据仅用于本小组闭环 · 不做公开排名</footer></section>
  </main>;
}
