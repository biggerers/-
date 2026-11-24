import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, LoaderCircle, Inbox, CheckCircle2, AlertCircle, BookOpen, Sigma, Languages, Atom, ArrowUpRight } from 'lucide-react';
import { cn, score, statusName, statusTone } from '../utils.js';
import { getToken } from '../api.js';

export function Button({ children, variant = 'primary', size = 'md', loading = false, icon: Icon, className, ...props }) {
  return <button className={cn('button', `button-${variant}`, `button-${size}`, className)} disabled={loading || props.disabled} {...props}>
    {loading ? <LoaderCircle size={16} className="spin" /> : Icon ? <Icon size={16} /> : null}{children}
  </button>;
}

export function IconButton({ icon: Icon, label, className, ...props }) {
  return <button className={cn('icon-button', className)} aria-label={label} title={label} {...props}><Icon size={18} /></button>;
}

export function Badge({ children, tone, dot = false }) {
  return <span className={cn('badge', `badge-${tone || 'muted'}`)}>{dot && <i />}{children}</span>;
}
export function StatusBadge({ status }) { return <Badge tone={statusTone(status)} dot>{statusName(status)}</Badge>; }

export function PlanImage({ planId, index }) {
  const [url, setUrl] = useState(null);
  const [zoom, setZoom] = useState(false);
  useEffect(() => {
    let active = true;
    fetch(`/api/weekly-plans/${planId}/files/${index}`, { headers: { Authorization: `Bearer ${getToken()}` } })
      .then(response => response.ok ? response.blob() : Promise.reject(new Error('图片加载失败')))
      .then(blob => { if (active) setUrl(URL.createObjectURL(blob)); })
      .catch(() => {});
    return () => { active = false; };
  }, [planId, index]);
  useEffect(() => {
    if (!zoom) return;
    const onKey = event => { if (event.key === 'Escape') setZoom(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [zoom]);
  return <>
    {url ? <img className="plan-image zoomable" src={url} alt="每周计划照片" onClick={() => setZoom(true)} /> : <div className="plan-image loading" />}
    {zoom && url && createPortal(<div className="image-viewer" onClick={() => setZoom(false)}>
      <img src={url} alt="每周计划照片大图" onClick={event => event.stopPropagation()} />
      <button className="image-viewer-close" onClick={() => setZoom(false)} aria-label="关闭大图"><X size={22} /></button>
    </div>, document.body)}
  </>;
}

export function SubItemScoreList({ items }) {
  if (!items?.length) return null;
  return <div className="subitem-score-list">
    {items.map(item => <div key={item.id} className="subitem-score-row">
      <div className="subitem-score-name"><b>{item.name}</b><span>满分 {score(item.fullScore)}</span></div>
      <div className="subitem-score-values"><span>期中 {score(item.baseline)}</span><strong>{score(item.current)}</strong><span>目标 {score(item.target)}</span>
        {item.gain != null && item.gain !== 0 && <Badge tone={item.gain > 0 ? 'success' : 'danger'}>{item.gain > 0 ? `提分 +${score(item.gain)}` : `退步 ${score(Math.abs(item.gain))}`}</Badge>}
      </div>
    </div>)}
  </div>;
}

export function Avatar({ user, size = 'md' }) {
  return <span className={cn('avatar', `avatar-${size}`)} style={{ background: user?.avatarColor || '#4d83cf' }}>{user?.displayName?.slice(-2) || '同窗'}</span>;
}

export function BrandMark({ className }) {
  return <span className={cn('brand-mark', 'brand-icon', className)} aria-hidden="true"><img src="/icons/icon-512x512.png" alt="" /></span>;
}

const icons = { BookOpen, Sigma, Languages, Atom };
export function SubjectIcon({ subject, size = 'md' }) {
  const Icon = icons[subject?.icon] || BookOpen;
  return <span className={cn('subject-icon', `subject-icon-${size}`)} style={{ color: subject?.color, background: `${subject?.color || '#4d83cf'}16` }}><Icon size={size === 'lg' ? 25 : 19} /></span>;
}

export function ProgressBar({ value, color = '#0b8f87', label }) {
  const width = value == null ? 0 : Math.max(0, Math.min(100, Number(value)));
  return <div className="progress-wrap" aria-label={label}><div className="progress-track"><span style={{ width: `${width}%`, background: color }} /></div></div>;
}

export function Modal({ title, description, children, onClose, width = '600px', footer }) {
  useEffect(() => {
    const handler = event => event.key === 'Escape' && onClose();
    document.addEventListener('keydown', handler);
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', handler); document.body.style.overflow = ''; };
  }, [onClose]);
  return createPortal(<div className="modal-backdrop" onMouseDown={event => event.target === event.currentTarget && onClose()}>
    <section className="modal" style={{ maxWidth: width }} role="dialog" aria-modal="true" aria-label={title}>
      <header className="modal-header"><div><h2>{title}</h2>{description && <p>{description}</p>}</div><IconButton icon={X} label="关闭" onClick={onClose} /></header>
      <div className="modal-body">{children}</div>
      {footer && <footer className="modal-footer">{footer}</footer>}
    </section>
  </div>, document.body);
}

export function Field({ label, hint, error, required, children, className }) {
  return <label className={cn('field', className)}><span className="field-label">{label}{required && <b>*</b>}{hint && <small>{hint}</small>}</span>{children}{error && <span className="field-error">{error}</span>}</label>;
}

export function EmptyState({ icon: Icon = Inbox, title = '暂无数据', description, action }) {
  return <div className="empty-state"><span><Icon size={25} /></span><h3>{title}</h3>{description && <p>{description}</p>}{action}</div>;
}

export function PageLoading({ label = '正在加载学习数据…' }) {
  return <div className="page-loading"><LoaderCircle size={25} className="spin" /><span>{label}</span></div>;
}

export function ErrorState({ message, retry }) {
  return <div className="empty-state error-state"><span><AlertCircle size={25} /></span><h3>暂时无法加载</h3><p>{message}</p>{retry && <Button variant="secondary" onClick={retry}>重新加载</Button>}</div>;
}

export function Toast({ toast, onClose }) {
  useEffect(() => { if (!toast) return; const timer = setTimeout(onClose, 3500); return () => clearTimeout(timer); }, [toast, onClose]);
  if (!toast) return null;
  return <div className={cn('toast', `toast-${toast.type || 'success'}`)}>{toast.type === 'error' ? <AlertCircle size={19} /> : <CheckCircle2 size={19} />}<div><b>{toast.type === 'error' ? '操作未完成' : '操作成功'}</b><p>{toast.message}</p></div><IconButton icon={X} label="关闭提示" onClick={onClose} /></div>;
}

export function MetricCard({ label, value, suffix, note, icon: Icon, tone = 'teal', children }) {
  return <article className="metric-card"><div className={cn('metric-icon', `metric-${tone}`)}>{Icon && <Icon size={20} />}</div><div className="metric-content"><span>{label}</span><strong>{value}<small>{suffix}</small></strong>{note && <p>{note}</p>}{children}</div></article>;
}

export function SectionHeader({ eyebrow, title, description, action }) {
  return <div className="section-header"><div>{eyebrow && <span className="eyebrow">{eyebrow}</span>}<h2>{title}</h2>{description && <p>{description}</p>}</div>{action}</div>;
}

export function InlineLink({ children, ...props }) { return <button className="inline-link" {...props}>{children}<ArrowUpRight size={14} /></button>; }
