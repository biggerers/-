import React, { useCallback, useEffect, useState } from 'react';
import { Atom, Bell, BookMarked, CalendarDays, ChevronDown, ClipboardCheck, FileCheck2, History, LayoutDashboard, LibraryBig, ListChecks, LockKeyhole, LogOut, Menu, Settings, Shapes, ShieldCheck, Target, Trophy, UploadCloud, UserRound, Users, WandSparkles, X } from 'lucide-react';
import { api, getToken, setToken } from './api.js';
import { cn } from './utils.js';
import { Avatar, Badge, BrandMark, IconButton, PageLoading, Toast } from './components/UI.jsx';
import Login from './Login.jsx';
import { DashboardPage, GrowthPage, PracticePage, ScoreRequestModal, ScoresPage, SettingsPage, TaskPage, UploadPage, WeeklyPlanPage } from './pages/StudentPages.jsx';
import AdminDashboard from './pages/AdminDashboard.jsx';
import UsersPage from './pages/UsersPage.jsx';
import SubjectsPage from './pages/SubjectsPage.jsx';
import AdminScoresPage from './pages/AdminScoresPage.jsx';
import ReviewsPage from './pages/ReviewsPage.jsx';
import QuestionsPage from './pages/QuestionsPage.jsx';
import AuditPage from './pages/AuditPage.jsx';
import PointsPage from './pages/PointsPage.jsx';
import AdminTasksPage from './pages/AdminTasksPage.jsx';

const studentNav = [
  { id: 'dashboard', label: '学习总览', icon: LayoutDashboard },
  { id: 'scores', label: '成绩与目标', icon: Target },
  // 暂时隐藏：练习中心 / 试卷上传 / 错题与互助（功能保留，需要时恢复）
  // { id: 'practice', label: '练习中心', icon: WandSparkles },
  // { id: 'upload', label: '试卷上传', icon: UploadCloud },
  // { id: 'growth', label: '错题与互助', icon: BookMarked, badge: 'P1' },
  { id: 'weekly', label: '每周计划', icon: CalendarDays },
  { id: 'task', label: '任务', icon: ListChecks },
  { id: 'settings', label: '个人设置', icon: Settings }
];
const adminNav = [
  { id: 'adminDashboard', label: '管理总览', icon: LayoutDashboard },
  { id: 'users', label: '用户管理', icon: Users },
  { id: 'subjects', label: '科目设置', icon: Shapes },
  { id: 'adminScores', label: '成绩与目标', icon: ClipboardCheck },
  { id: 'points', label: '积分与计划', icon: Trophy },
  { id: 'tasks', label: '任务发布', icon: ListChecks },
  { id: 'reviews', label: '判卷审核', icon: FileCheck2 },
  { id: 'questions', label: '试题知识库', icon: LibraryBig },
  { id: 'audit', label: '审计日志', icon: History }
];
const pageTitles = Object.fromEntries([...studentNav, ...adminNav].map(item => [item.id, item.label]));

export default function App() {
  const [bootstrap, setBootstrap] = useState(null);
  const [checking, setChecking] = useState(Boolean(getToken()));
  const [page, setPage] = useState('dashboard');
  const [pageKey, setPageKey] = useState(0);
  const [toast, setToast] = useState(null);
  const [scoreSubject, setScoreSubject] = useState(null);
  const [practicePreset, setPracticePreset] = useState(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const notify = useCallback((message, type = 'success') => setToast({ message, type, id: Date.now() }), []);
  const loadBootstrap = useCallback(async () => {
    const data = await api('/api/bootstrap'); setBootstrap(data); return data;
  }, []);
  useEffect(() => {
    if (!getToken()) { setChecking(false); return; }
    loadBootstrap().then(data => setPage(data.user.role === 'ADMIN' ? 'adminDashboard' : 'dashboard')).catch(() => setToken(null)).finally(() => setChecking(false));
    const unauthorized = () => { setBootstrap(null); setToken(null); };
    window.addEventListener('tongchuang:unauthorized', unauthorized);
    return () => window.removeEventListener('tongchuang:unauthorized', unauthorized);
  }, [loadBootstrap]);
  const login = async () => { const data = await loadBootstrap(); setPage(data.user.role === 'ADMIN' ? 'adminDashboard' : 'dashboard'); };
  const logout = async () => { try { await api('/api/auth/logout', { method: 'POST' }); } catch { /* 本地仍退出 */ } setToken(null); setBootstrap(null); setPage('dashboard'); };
  const navigate = id => { setPage(id); setPageKey(key => key + 1); setMobileOpen(false); setNotificationsOpen(false); window.scrollTo({ top: 0, behavior: 'smooth' }); };
  const openPractice = subjectId => { setPracticePreset({ subjectId, at: Date.now() }); navigate('practice'); };
  const scoreSaved = async () => { setScoreSubject(null); notify('成绩变更申请已提交；管理员复核后才会更新正式成绩。'); await loadBootstrap(); setPageKey(key => key + 1); };
  if (checking) return <div className="app-loading"><BrandMark /><PageLoading label="正在进入同窗进阶…" /></div>;
  if (!bootstrap) return <Login onLogin={login} />;
  const { user, group } = bootstrap;
  const nav = user.role === 'ADMIN' ? adminNav : studentNav;
  const common = { bootstrap, notify, navigate, refreshBootstrap: loadBootstrap };
  let content;
  switch (page) {
    case 'dashboard': content = <DashboardPage {...common} openScore={setScoreSubject} openPractice={openPractice} />; break;
    case 'scores': content = <ScoresPage {...common} openScore={setScoreSubject} />; break;
    case 'practice': content = <PracticePage {...common} presetSubject={practicePreset?.subjectId} />; break;
    case 'upload': content = <UploadPage {...common} />; break;
    case 'growth': content = <GrowthPage {...common} />; break;
    case 'weekly': content = <WeeklyPlanPage {...common} />; break;
    case 'task': content = <TaskPage {...common} />; break;
    case 'settings': content = <SettingsPage {...common} onUserChange={updated => setBootstrap(current => ({ ...current, user: updated }))} />; break;
    case 'adminDashboard': content = <AdminDashboard {...common} />; break;
    case 'users': content = <UsersPage {...common} />; break;
    case 'subjects': content = <SubjectsPage {...common} />; break;
    case 'adminScores': content = <AdminScoresPage {...common} />; break;
    case 'points': content = <PointsPage {...common} />; break;
    case 'tasks': content = <AdminTasksPage {...common} />; break;
    case 'reviews': content = <ReviewsPage {...common} />; break;
    case 'questions': content = <QuestionsPage {...common} />; break;
    case 'audit': content = <AuditPage {...common} />; break;
    default: content = null;
  }
  return <div className="app-shell">
    {mobileOpen && <div className="sidebar-overlay" onClick={() => setMobileOpen(false)} />}
    <aside className={cn('sidebar', mobileOpen && 'mobile-open')}>
      <div className="sidebar-brand"><BrandMark /><div><strong>同窗进阶</strong><small>TONGCHUANG GROWTH</small></div><IconButton icon={X} label="关闭导航" className="sidebar-close" onClick={() => setMobileOpen(false)} /></div>
      <div className="group-chip"><span className="group-symbol"><Atom size={20} /></span><div><b>三人共学共同体</b><small>2026—2027 学年</small></div><ChevronDown size={14} /></div>
      <nav className="main-nav"><span className="nav-section-label">{user.role === 'ADMIN' ? '小组管理' : '我的学习'}</span>{nav.map(item => <button key={item.id} className={page === item.id ? 'active' : ''} onClick={() => navigate(item.id)}><item.icon size={19} /><span>{item.label}</span>{item.badge && <em>{item.badge}</em>}{page === item.id && <i />}</button>)}</nav>
      <div className="sidebar-principle"><ShieldCheck size={18} /><div><b>进步，而非排名</b><p>只比较同口径数据<br />AI 建议必须人工复核</p></div></div>
      <div className="sidebar-user"><Avatar user={user} /><div><b>{user.displayName}</b><span>{user.role === 'ADMIN' ? '小组管理员' : '学生账号'}</span></div><IconButton icon={LogOut} label="退出登录" onClick={logout} /></div>
    </aside>
    <div className="app-main"><header className="topbar"><div className="topbar-left"><IconButton icon={Menu} label="打开导航" className="mobile-menu" onClick={() => setMobileOpen(true)} /><span>三人共学共同体</span><ChevronDown size={13} /><b>{pageTitles[page]}</b></div><div className="topbar-right"><IconButton icon={LogOut} label="退出登录" className="mobile-logout" onClick={logout} /><span className="term-chip">{group.term}</span><div className="notification-wrap"><IconButton icon={Bell} label="查看通知" onClick={() => setNotificationsOpen(!notificationsOpen)} />{user.role === 'STUDENT' && bootstrap.dashboard?.pendingRequests > 0 && <i className="notification-dot" />}{notificationsOpen && <div className="notification-panel"><div><h3>状态提醒</h3><Badge tone="soft">不推送排名</Badge></div>{user.role === 'STUDENT' ? <><button onClick={() => navigate('scores')}><ClipboardCheck size={18} /><span><b>成绩申请</b><small>{bootstrap.dashboard?.pendingRequests ? `${bootstrap.dashboard.pendingRequests} 条申请正在等待审核` : '没有待审核申请'}</small></span></button><button onClick={() => navigate('upload')}><FileCheck2 size={18} /><span><b>试卷进度</b><small>AI 建议复核后才会更新成绩</small></span></button></> : <><button onClick={() => navigate('adminScores')}><ClipboardCheck size={18} /><span><b>成绩审核</b><small>核对学生申请的来源与日期</small></span></button><button onClick={() => navigate('reviews')}><SparkleIcon /><span><b>判卷审核</b><small>低置信结果需重点复核</small></span></button></>}</div>}</div><Avatar user={user} size="sm" /></div></header>
      <main className="content-area" key={`${page}-${pageKey}`}>{content}</main>
      <nav className="mobile-bottom-nav">{nav.slice(0, 4).map(item => <button key={item.id} className={page === item.id ? 'active' : ''} onClick={() => navigate(item.id)}><item.icon size={20} /><span>{item.label.replace('学习', '').replace('管理', '')}</span></button>)}<button onClick={() => setMobileOpen(true)}><Menu size={20} /><span>全部</span></button></nav>
    </div>
    {scoreSubject && <ScoreRequestModal subject={scoreSubject} onClose={() => setScoreSubject(null)} onSuccess={scoreSaved} />}
    <Toast toast={toast} onClose={() => setToast(null)} />
  </div>;
}
function SparkleIcon() { return <FileCheck2 size={18} />; }
