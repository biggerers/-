import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateProgress, totalProgress, weeklyShrink, comparisonMode, validateScore, gapBurnDownPlan } from './domain.js';

test('目标达成率支持正常、超额与负进步', () => {
  assert.equal(calculateProgress(60, 75, 90).rate, 50);
  assert.equal(calculateProgress(60, 95, 90).displayRate, 100);
  assert.equal(calculateProgress(60, 50, 90).rate, -33.3);
  assert.equal(calculateProgress(60, 50, 90).gap, 40);
});

test('缺失基准与保持目标不伪造 0%', () => {
  assert.equal(calculateProgress(null, 80, 90).rate, null);
  assert.equal(calculateProgress(80, 80, 80).maintenance, true);
  assert.equal(calculateProgress(80, 80, 80).rate, null);
  assert.equal(calculateProgress(80, 80, 80).achieved, true);
});

test('周差距为 0 时不计算缩小率，倒退保留负值', () => {
  assert.equal(weeklyShrink(0, 10), null);
  assert.equal(weeklyShrink(20, 10), 50);
  assert.equal(weeklyShrink(20, 30), -50);
});

test('总进度只汇总完整且相同的科目集合', () => {
  const result = totalProgress([
    { subjectId: 'a', baseline: 50, current: 60, target: 70 },
    { subjectId: 'b', baseline: 80, current: null, target: 90 }
  ]);
  assert.equal(result.current, 60);
  assert.equal(result.complete, false);
});

test('不同满分标准化，不同试卷不可比', () => {
  const a = { code: 'MATH', fullScore: 100 };
  const b = { code: 'MATH', fullScore: 120 };
  const x = { comparisonGroup: 'one', occurredAt: '2026-11-01' };
  const y = { comparisonGroup: 'one', occurredAt: '2026-11-03' };
  assert.equal(comparisonMode(a, b, x, y).mode, 'STANDARDIZED');
  assert.equal(comparisonMode(a, a, x, { ...y, comparisonGroup: 'two' }).comparable, false);
});

test('成绩范围校验允许 0，拒绝空值和超满分', () => {
  assert.equal(validateScore(0, 100), null);
  assert.ok(validateScore('', 100));
  assert.ok(validateScore(101, 100));
  assert.ok(validateScore(-1, 100));
});

test('燃尽计划从第 1 周 11 月 20 日开始，9 周从 0% 提升到 100%', () => {
  const plan = gapBurnDownPlan(80, { startDate: '2026-11-20', totalWeeks: 9, examWeekEnd: '2027-01-17' });
  assert.equal(plan.totalWeeks, 9);
  assert.equal(plan.startWeek, '2026-11-20');
  assert.equal(plan.examWeekStart, '2027-01-15');
  assert.equal(plan.points[0].type, 'START');
  assert.equal(plan.points[0].percent, 0);
  assert.equal(plan.points[0].gap, 80);
  assert.equal(plan.points[1].percent, 12.5);
  assert.equal(plan.points[1].gap, 70);
  assert.equal(plan.points.at(-1).isExamWeek, true);
  assert.equal(plan.points.at(-1).percent, 100);
  assert.equal(plan.points.at(-1).gap, 0);
  assert.ok(plan.points.every((point, index, list) => index === 0 || point.gap <= list[index - 1].gap));
});

test('已达标燃尽为 0，缺失或负差距不生成计划', () => {
  const reached = gapBurnDownPlan(0, { startDate: '2026-11-20', totalWeeks: 9, examWeekEnd: '2027-01-17' });
  assert.equal(reached.initialGap, 0);
  assert.ok(reached.points.every(point => point.gap === 0));
  assert.equal(gapBurnDownPlan(null), null);
  assert.equal(gapBurnDownPlan(-1), null);
});
