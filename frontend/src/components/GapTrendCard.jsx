import { Info, TrendingUp } from 'lucide-react';
import { SectionHeader } from './UI.jsx';
import { cn } from '../utils.js';

export default function GapTrendCard({ trend, highlightUserId }) {
  const width = 760; const height = 250; const left = 48; const right = 28; const top = 34; const bottom = 204;
  const days = trend?.days || [];
  const n = days.length;
  if (!n) return null;
  const xAt = index => left + index * ((width - left - right) / Math.max(n - 1, 1));
  const yAt = value => top + (bottom - top) * (1 - Math.max(0, Math.min(100, value || 0)) / 100);
  const reference = (trend?.reference || []).map((point, index) => ({ ...point, x: xAt(index), y: yAt(point.percent) })).filter(point => point.percent != null);
  const referenceLine = reference.map((point, index) => `${index ? 'L' : 'M'}${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(' ');
  const weekNodes = reference.filter(point => point.week).map(point => ({ ...point, label: point.week.label, isExamWeek: point.week.isExamWeek }));
  const weekStartSet = new Set((trend?.weeks || []).map(week => week.weekStart));
  const series = (trend?.students || []).map(student => {
    const positions = (student.points || []).map((point, index) => ({ ...point, x: xAt(index), y: yAt(point.percent) })).filter(point => point.percent != null);
    const jumps = positions.filter((point, index) => index === 0 || positions[index - 1].percent !== point.percent);
    const weekDots = positions.filter(point => point.week && weekStartSet.has(point.date));
    return { ...student, positions, jumps, weekDots, last: positions.at(-1) };
  });
  const todayIndex = days.findIndex(day => day.date === trend?.today);
  const ticks = [0, 25, 50, 75, 100].map(value => ({ value, y: yAt(value) }));
  return <article className="card gap-trend-card">
    <SectionHeader title="全员差距追上比例趋势对比" description="按天为颗粒度，曲线每天向右生长一个点；周是曲线上的大节点，录分当天即可看到跳升。" action={<TrendingUp size={21} className="accent-icon" />} />
    <div className="trend-legend">
      <span><i className="reference" />计划参考线（按天）</span>
      <span><i className="week-node" />周节点</span>
      {series.map(student => <span key={student.userId} className={cn(highlightUserId === student.userId && 'self')}><i style={{ background: student.color }} />{student.displayName}{highlightUserId === student.userId ? '（我）' : ''}{student.last ? ` · 最新 ${student.last.percent}%` : ''}</span>)}
    </div>
    <svg className="trend-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="全员已追上差距比例按天趋势图">
      {ticks.map(tick => <g key={tick.value}><line className="trend-grid" x1={left} x2={width - right} y1={tick.y} y2={tick.y} /><text className="trend-axis" x={left - 8} y={tick.y + 4} textAnchor="end">{tick.value}%</text></g>)}
      {weekNodes.map(point => <g key={`weekline-${point.date}`}><line className="trend-weekline" x1={point.x} x2={point.x} y1={top} y2={bottom} /><text className="trend-label" x={point.x} y={bottom + 24} textAnchor={point.x < left + 40 ? 'start' : point.x > width - right - 40 ? 'end' : 'middle'}>{point.isExamWeek ? '期末' : point.label}</text></g>)}
      {todayIndex >= 0 && <g><line className="trend-today-line" x1={xAt(todayIndex)} x2={xAt(todayIndex)} y1={top} y2={bottom} /><text className="trend-today-label" x={xAt(todayIndex)} y={top - 8} textAnchor="middle">今天</text></g>}
      <path className="trend-reference-line" d={referenceLine} />
      {reference.filter(point => !point.week).map(point => <circle key={`ref-${point.date}`} className="trend-dot reference" cx={point.x} cy={point.y} r={1.6}><title>{`${point.date} · 计划追上 ${point.percent}%`}</title></circle>)}
      {weekNodes.map(point => <circle key={`week-${point.date}`} className="trend-dot reference week" cx={point.x} cy={point.y} r={point.isExamWeek ? 5.5 : 4.4}><title>{`${point.label} · 计划追上 ${point.percent}%`}</title></circle>)}
      {series.map(student => {
        const line = student.positions.map((point, index) => `${index ? 'L' : 'M'}${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(' ');
        const highlighted = highlightUserId === student.userId;
        return <g key={student.userId} style={{ color: student.color }}>
          {student.positions.length > 1 && <path className={cn('trend-line', highlighted && 'self')} d={line} style={{ stroke: student.color }} />}
          {student.jumps.map(point => <circle key={`${student.userId}-jump-${point.date}`} className={cn('trend-dot', highlighted && 'self')} cx={point.x} cy={point.y} r={highlighted ? 4.2 : 3.4} style={{ stroke: student.color }}><title>{`${student.displayName} · ${point.date}：追上 ${point.percent}%`}</title></circle>)}
          {student.weekDots.map(point => <circle key={`${student.userId}-week-${point.date}`} className={cn('trend-dot week', highlighted && 'self')} cx={point.x} cy={point.y} r={5.6} style={{ fill: student.color, stroke: '#fff', strokeWidth: 1.6 }}><title>{`${student.displayName} · ${point.label || point.date}：追上 ${point.percent}%`}</title></circle>)}
          {student.last && <circle className={cn('trend-dot last', highlighted && 'self')} cx={student.last.x} cy={student.last.y} r={highlighted ? 6.4 : 5.4} style={{ fill: student.color, stroke: '#fff', strokeWidth: 1.8 }}><title>{`${student.displayName} · 最新（${student.last.date}）追上 ${student.last.percent}%`}</title></circle>}
        </g>;
      })}
    </svg>
    <p className="burn-footnote"><Info size={14} />比例 =（当前分数 − 期中分数）÷（期末目标 − 期中分数）× 100%，按成绩入账日期逐天绘制；大圆点为每周一节点，小圆点为比例发生变化的日期，虚线参考线从第 1 周线性提升到期末 100%。</p>
  </article>;
}
