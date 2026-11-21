import { Info, TrendingUp } from 'lucide-react';
import { SectionHeader } from './UI.jsx';
import { cn } from '../utils.js';

export default function GapTrendCard({ trend, highlightUserId }) {
  const width = 760; const height = 250; const left = 48; const right = 28; const top = 34; const bottom = 204;
  const weeks = trend.weeks;
  const xAt = index => left + index * ((width - left - right) / Math.max(weeks.length - 1, 1));
  const yAt = value => top + (bottom - top) * (1 - Math.max(0, Math.min(100, value || 0)) / 100);
  const reference = trend.reference.map((point, index) => ({ ...point, x: xAt(index), y: yAt(point.percent) }));
  const referenceLine = reference.map((point, index) => `${index ? 'L' : 'M'}${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(' ');
  const series = trend.students.map(student => ({ ...student, positions: student.points.map((point, index) => ({ ...point, x: xAt(index), y: yAt(point.percent) })).filter(point => point.percent != null) }));
  const ticks = [0, 50, 100].map(value => ({ value, y: yAt(value) }));
  return <article className="card gap-trend-card">
    <SectionHeader title="全员差距追上比例趋势对比" description="1 条 0% → 100% 计划参考线 + 每位同学每周实际追上差距比例。" action={<TrendingUp size={21} className="accent-icon" />} />
    <div className="trend-legend">
      <span><i className="reference" />计划参考线</span>
      {series.map(student => <span key={student.userId} className={cn(highlightUserId === student.userId && 'self')}><i style={{ background: student.color }} />{student.displayName}{highlightUserId === student.userId ? '（我）' : ''}</span>)}
    </div>
    <svg className="trend-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="全员已追上差距比例趋势图">
      {ticks.map(tick => <g key={tick.value}><line className="trend-grid" x1={left} x2={width - right} y1={tick.y} y2={tick.y} /><text className="trend-axis" x={left - 8} y={tick.y + 4} textAnchor="end">{tick.value}%</text></g>)}
      {weeks.map((week, index) => <text key={week.weekStart} className={cn('trend-label', week.isExamWeek && 'exam')} x={xAt(index)} y={bottom + 24} textAnchor={index === 0 ? 'start' : week.isExamWeek ? 'end' : 'middle'}>{week.isExamWeek ? '期末' : week.label}</text>)}
      <path className="trend-reference-line" d={referenceLine} />
      {reference.map(point => <circle key={`reference-${point.week}`} className="trend-dot reference" cx={point.x} cy={point.y} r={point.isExamWeek ? 5.5 : 3.6}><title>{`${point.label} · 计划追上 ${point.percent}%`}</title></circle>)}
      {series.map(student => {
        const line = student.positions.map((point, index) => `${index ? 'L' : 'M'}${point.x},${point.y}`).join(' ');
        const highlighted = highlightUserId === student.userId;
        return <g key={student.userId} style={{ color: student.color }}>
          {student.positions.length > 1 && <path className={cn('trend-line', highlighted && 'self')} d={line} style={{ stroke: student.color }} />}
          {student.positions.map(point => <circle key={`${student.userId}-${point.weekStart}`} className={cn('trend-dot', highlighted && 'self')} cx={point.x} cy={point.y} r={highlighted ? 5.2 : 4.6} style={{ stroke: student.color }}><title>{`${student.displayName} · ${point.label}：实际追上 ${point.percent}%`}</title></circle>)}
        </g>;
      })}
    </svg>
    <p className="burn-footnote"><Info size={14} />参考线从第 1 周 0% 线性提升到期末 100%；实际线只绘制到当前周。比例 =（当前分数 − 期中分数）÷（期末目标 − 期中分数）× 100%。</p>
  </article>;
}
