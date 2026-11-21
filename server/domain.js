export function round1(value) {
  return value == null || !Number.isFinite(value) ? null : Math.round((value + Number.EPSILON) * 10) / 10;
}

export function validNumber(value) {
  return value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value));
}

export function validateScore(value, fullScore) {
  if (!validNumber(value)) return '请输入有效分数，不能用空白代替 0 分';
  const score = Number(value);
  if (score < 0 || score > Number(fullScore)) return `分数应在 0 至 ${fullScore} 之间`;
  return null;
}

export function distributeSubItemScores(subject, total) {
  const enabled = (subject?.subItems || []).filter(item => item.status === 'ENABLED');
  if (!enabled.length || !validNumber(total)) return [];
  const fullScore = enabled.reduce((sum, item) => sum + Number(item.fullScore || 0), 0);
  if (fullScore <= 0) return [];
  let remaining = Number(total);
  return enabled.map((item, index, list) => {
    const isLast = index === list.length - 1;
    const value = isLast ? round1(remaining) : round1(Number(total) * Number(item.fullScore || 0) / fullScore);
    if (!isLast) remaining = round1(remaining - value);
    return { subItemId: item.id, score: value };
  });
}

export function calculateProgress(baseline, current, target) {
  if (![baseline, current, target].every(validNumber)) {
    return { rate: null, displayRate: null, gap: null, achieved: null, maintenance: false, missing: true };
  }
  const m = Number(baseline); const c = Number(current); const t = Number(target);
  const gap = Math.max(t - c, 0);
  if (t === m) {
    return { rate: null, displayRate: null, gap: round1(gap), achieved: c >= t, maintenance: true, missing: false };
  }
  if (t < m) {
    return { rate: null, displayRate: null, gap: round1(gap), achieved: null, maintenance: false, invalid: true, missing: false };
  }
  const rate = ((c - m) / (t - m)) * 100;
  return {
    rate: round1(rate),
    displayRate: Math.max(0, Math.min(100, round1(rate))),
    gap: round1(gap),
    achieved: c >= t,
    maintenance: false,
    missing: false,
    exceeded: Math.max(0, round1(c - t))
  };
}

export function totalProgress(rows) {
  const complete = rows.filter(row => [row.baseline, row.current, row.target].every(validNumber));
  if (!complete.length) return { baseline: null, current: null, target: null, rate: null, displayRate: null, gap: null, complete: false };
  const baseline = complete.reduce((sum, row) => sum + Number(row.baseline), 0);
  const current = complete.reduce((sum, row) => sum + Number(row.current), 0);
  const target = complete.reduce((sum, row) => sum + Number(row.target), 0);
  const result = calculateProgress(baseline, current, target);
  return { baseline: round1(baseline), current: round1(current), target: round1(target), ...result, complete: complete.length === rows.length, includedSubjects: complete.map(row => row.subjectId) };
}

export function weeklyShrink(previousGap, currentGap) {
  if (!validNumber(previousGap) || !validNumber(currentGap) || Number(previousGap) === 0) return null;
  return round1(((Number(previousGap) - Number(currentGap)) / Number(previousGap)) * 100);
}

function weekStart(value) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  const day = (parsed.getUTCDay() + 6) % 7;
  parsed.setUTCDate(parsed.getUTCDate() - day);
  parsed.setUTCHours(0, 0, 0, 0);
  return parsed;
}

export function gapBurnDownPlan(initialGap, { startDate = new Date(), totalWeeks = 9, examWeekEnd = null } = {}) {
  if (!validNumber(initialGap) || Number(initialGap) < 0) return null;
  const start = new Date(startDate);
  const weeks = Math.min(52, Math.max(2, Number(totalWeeks) || 9));
  if (Number.isNaN(start.getTime())) return null;
  start.setUTCHours(0, 0, 0, 0);
  const initial = Number(initialGap);
  const points = [];
  for (let index = 0; index < weeks; index += 1) {
    const week = new Date(start);
    week.setUTCDate(week.getUTCDate() + index * 7);
    const remainingRatio = 1 - index / (weeks - 1);
    const percent = round1(100 * (1 - remainingRatio));
    points.push({
      week: index + 1,
      weekStart: week.toISOString().slice(0, 10),
      label: `${week.getUTCMonth() + 1}.${String(week.getUTCDate()).padStart(2, '0')}`,
      type: index === 0 ? 'START' : 'PLANNED',
      isExamWeek: index === weeks - 1,
      gap: round1(initial * remainingRatio),
      percent
    });
  }
  return {
    startWeek: start.toISOString().slice(0, 10),
    examWeekStart: points.at(-1).weekStart,
    examWeekEnd,
    totalWeeks: weeks,
    initialGap: round1(initial),
    weeklyReduction: round1(initial / (weeks - 1)),
    points
  };
}

export function comparisonMode(subjectA, subjectB, assessmentA, assessmentB, now = new Date()) {
  if (!subjectA || !subjectB || subjectA.code !== subjectB.code) return { comparable: false, mode: 'INCOMPARABLE', reason: '需要相同科目与可映射的分项结构' };
  if (!assessmentA || !assessmentB) return { comparable: false, mode: 'MISSING', reason: '待录入同口径成绩后再比较' };
  if (assessmentA.comparisonGroup !== assessmentB.comparisonGroup) return { comparable: false, mode: 'INCOMPARABLE', reason: '试卷或评估口径不同，暂不支持直接比较' };
  const days = Math.abs(new Date(assessmentA.occurredAt) - new Date(assessmentB.occurredAt)) / 86400000;
  if (days > 31) return { comparable: false, mode: 'INCOMPARABLE', reason: '考试日期相差超过小组设定的 31 天窗口' };
  if (Number(subjectA.fullScore) !== Number(subjectB.fullScore)) return { comparable: true, mode: 'STANDARDIZED', reason: '满分不同，已转换为得分率与目标达成率' };
  return { comparable: true, mode: 'RAW', reason: '同科目、同满分、同评估口径' };
}

export function scoreRate(score, fullScore) {
  return validNumber(score) && validNumber(fullScore) && Number(fullScore) > 0 ? round1(Number(score) / Number(fullScore) * 100) : null;
}

export function clampScore(value, fullScore) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0 || n > Number(fullScore)) throw new Error(`分数必须在 0-${fullScore} 之间`);
  return round1(n);
}
