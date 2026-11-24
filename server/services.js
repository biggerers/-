import { calculateProgress, totalProgress, weeklyShrink, comparisonMode, scoreRate, gapBurnDownPlan, round1 } from './domain.js';

export function publicUser(user) {
  if (!user) return null;
  const { passwordHash, ...safe } = user;
  return safe;
}

export function currentAssessment(data, userId, subjectId) {
  return data.assessments
    .filter(item => item.userId === userId && item.subjectId === subjectId && item.status === 'EFFECTIVE' && item.kind !== 'BASELINE')
    .sort((a, b) => new Date(b.occurredAt) - new Date(a.occurredAt) || new Date(b.createdAt) - new Date(a.createdAt))[0] || null;
}

export function activeTarget(data, userId, subjectId) {
  return data.targets
    .filter(item => item.userId === userId && item.subjectId === subjectId && item.status === 'ACTIVE')
    .sort((a, b) => new Date(b.effectiveAt) - new Date(a.effectiveAt) || b.version - a.version)[0] || null;
}

function baselineAssessment(data, userId, subjectId) {
  return data.assessments
    .filter(item => item.userId === userId && item.subjectId === subjectId && item.kind === 'BASELINE' && item.status === 'EFFECTIVE')
    .sort((a, b) => new Date(b.occurredAt) - new Date(a.occurredAt) || new Date(b.createdAt) - new Date(a.createdAt))[0] || null;
}

function buildSubItemRows(data, userId, subject, target) {
  const baseline = baselineAssessment(data, userId, subject.id);
  const current = currentAssessment(data, userId, subject.id);
  const baselineSource = target?.subItemBaselines?.length ? target.subItemBaselines : baseline?.subItemScores;
  const baselineScores = new Map((baselineSource || []).map(item => [item.subItemId, item.score]));
  const currentScores = new Map((current?.subItemScores || []).map(item => [item.subItemId, item.score]));
  const targetScores = new Map((target?.subItemTargets || []).map(item => [item.subItemId, item.score]));
  return subject.subItems.filter(item => item.status === 'ENABLED').map(item => {
    const baselineScore = baselineScores.get(item.id) ?? null;
    const currentScore = currentScores.get(item.id) ?? null;
    const targetScore = targetScores.get(item.id) ?? null;
    const gain = baselineScore != null && currentScore != null ? round1(Number(currentScore) - Number(baselineScore)) : null;
    const gap = currentScore != null && targetScore != null ? round1(Number(targetScore) - Number(currentScore)) : null;
    return { id: item.id, name: item.name, fullScore: item.fullScore, baseline: baselineScore, current: currentScore, target: targetScore, gain, gap, improved: gain != null && gain > 0 };
  });
}

export function subjectProgress(data, userId, subject) {
  const target = activeTarget(data, userId, subject.id);
  const assessment = currentAssessment(data, userId, subject.id);
  const baseline = target?.baselineScore ?? null;
  const current = assessment?.score ?? null;
  const targetScore = target?.targetScore ?? null;
  const progress = calculateProgress(baseline, current, targetScore);
  const weakness = { CHINESE: '现代文阅读', MATH: '综合与实践', ENGLISH: '阅读理解', PHYSICS: '实验探究' }[subject.code] || subject.subItems[0]?.name;
  return {
    subjectId: subject.id,
    code: subject.code,
    name: subject.name,
    color: subject.color,
    icon: subject.icon,
    fullScore: assessment?.fullScore ?? subject.fullScore,
    baseline,
    current,
    target: targetScore,
    targetVersion: target?.version ?? null,
    targetReason: target?.reason ?? null,
    source: assessment?.source ?? null,
    occurredAt: assessment?.occurredAt ?? null,
    updatedAt: assessment?.createdAt ?? null,
    comparisonGroup: assessment?.comparisonGroup ?? null,
    weakSubItem: weakness,
    subItems: buildSubItemRows(data, userId, subject, target),
    ...progress
  };
}

function validPlanWindow(startValue, endValue) {
  const start = new Date(startValue);
  return !Number.isNaN(start.getTime()) && !Number.isNaN(endValue.getTime()) && endValue > start;
}

function buildBurnDown(data, userId, summary) {
  const initialGap = summary.baseline != null && summary.target != null ? Math.max(0, Number(summary.target) - Number(summary.baseline)) : null;
  const plan = gapBurnDownPlan(initialGap, {
    startDate: data.group.gapPlanStart || '2026-11-20',
    totalWeeks: data.group.gapPlanWeeks || 9,
    examWeekEnd: data.group.examWeekEnd || '2027-01-17'
  });
  if (!plan) return null;
  const subjects = data.subjects.filter(item => item.status === 'ENABLED');
  const targets = new Map(subjects.map(subject => [subject.id, activeTarget(data, userId, subject.id)]));
  const today = new Date();
  const points = plan.points.map(point => {
    if (new Date(point.weekStart) > today) return { ...point, actualGap: null, actualPercent: null, rawActualPercent: null };
    let actualGap = 0; let baselineTotal = 0; let currentTotal = 0; let targetTotal = 0; let complete = true;
    for (const subject of subjects) {
      const target = targets.get(subject.id);
      if (!target || target.baselineScore == null || target.targetScore == null) { complete = false; break; }
      const latest = data.assessments
        .filter(item => item.userId === userId && item.subjectId === subject.id && item.status === 'EFFECTIVE' && item.kind !== 'BASELINE')
        .filter(item => new Date(item.occurredAt) <= new Date(`${point.weekStart}T23:59:59.000Z`))
        .sort((a, b) => new Date(b.occurredAt) - new Date(a.occurredAt) || new Date(b.createdAt) - new Date(a.createdAt))[0];
      const score = latest?.score ?? target.baselineScore;
      if (!Number.isFinite(Number(score))) { complete = false; break; }
      actualGap += Math.max(0, Number(target.targetScore) - Number(score));
      baselineTotal += Number(target.baselineScore);
      currentTotal += Number(score);
      targetTotal += Number(target.targetScore);
    }
    const actualGapValue = complete ? round1(actualGap) : null;
    const denominator = targetTotal - baselineTotal;
    const rawPercent = complete && denominator > 0 ? round1((currentTotal - baselineTotal) / denominator * 100) : null;
    return {
      ...point,
      actualGap: actualGapValue,
      rawActualPercent: rawPercent,
      actualPercent: rawPercent == null ? null : Math.max(0, Math.min(100, rawPercent))
    };
  });
  const currentActual = points.filter(point => point.actualGap != null).at(-1);
  return {
    ...plan,
    currentGap: summary.gap,
    currentPercent: currentActual?.actualPercent ?? null,
    points
  };
}

export function buildDashboard(data, userId) {
  const user = data.users.find(item => item.id === userId);
  const subjects = data.subjects.filter(item => item.status === 'ENABLED').sort((a, b) => a.sort - b.sort);
  const rows = subjects.map(subject => subjectProgress(data, userId, subject));
  const summary = totalProgress(rows);
  const snapshot = data.snapshots.filter(item => item.userId === userId).sort((a, b) => b.weekStart.localeCompare(a.weekStart))[0];
  const previousGap = snapshot?.gap ?? null;
  const shrinkRate = weeklyShrink(previousGap, summary.gap);
  const postedCount = data.exams.filter(exam => exam.userId === userId && exam.status === 'POSTED').length;
  const burnDown = buildBurnDown(data, userId, summary);
  const progressShare = row => row.target != null && row.baseline != null && row.current != null && Number(row.target) > Number(row.baseline)
    ? (Number(row.current) - Number(row.baseline)) / (Number(row.target) - Number(row.baseline))
    : null;
  const lowestProgressRow = [...rows]
    .filter(row => progressShare(row) != null)
    .sort((a, b) => progressShare(a) - progressShare(b) || (b.gap ?? 0) - (a.gap ?? 0))[0] || null;
  const planEnd = new Date(`${data.group.examWeekEnd || '2027-01-17'}T23:59:59.000Z`);
  const behindPlan = row => {
    const target = activeTarget(data, userId, row.subjectId);
    if (!target?.effectiveAt || !validPlanWindow(target.effectiveAt, planEnd)) return false;
    const elapsed = Date.now() - new Date(target.effectiveAt).getTime();
    const total = planEnd.getTime() - new Date(target.effectiveAt).getTime();
    const plannedGap = Math.max(0, ((row.target ?? 0) - (row.baseline ?? 0)) * (1 - elapsed / total));
    return row.gap != null && row.gap > plannedGap + 0.05;
  };
  const weeklyRows = [...new Set([lowestProgressRow, ...rows.filter(behindPlan)].filter(Boolean))]
    .sort((a, b) => progressShare(a) - progressShare(b) || (b.gap ?? 0) - (a.gap ?? 0))
    .slice(0, 3)
    .map(row => {
      const tags = [];
      if (row === lowestProgressRow) tags.push('GAP_RATIO_LOW');
      if (behindPlan(row)) tags.push('BEHIND_PLAN');
      return {
        id: `weekly_${row.subjectId}`,
        subjectId: row.subjectId,
        title: row.name,
        description: `分项建议：${row.weakSubItem}`,
        subjectName: row.name,
        weakSubItem: row.weakSubItem,
        progressRate: progressShare(row) == null ? null : round1(progressShare(row) * 100),
        tags,
        done: false
      };
    });
  const actions = weeklyRows;
  const mustTasks = (data.tasks || [])
    .filter(task => (!task.recipients?.length || task.recipients.includes(userId)) && new Date(task.deadline) >= new Date())
    .sort((a, b) => new Date(a.deadline) - new Date(b.deadline))
    .map(task => {
      const subject = data.subjects.find(item => item.id === task.subjectId);
      return {
        id: task.id,
        subjectName: subject?.name || task.subjectId,
        subItemNames: (task.subItemIds || []).map(id => subject?.subItems.find(item => item.id === id)?.name).filter(Boolean),
        note: task.note || '',
        deadline: task.deadline,
        fileCount: task.files?.length || 0,
        myStatus: (data.taskStatuses || []).find(item => item.taskId === task.id && item.userId === userId)?.status || 'PENDING'
      };
    });
  return {
    user: publicUser(user),
    group: data.group,
    summary,
    subjects: rows,
    weekly: { previousGap, currentGap: summary.gap, shrinkRate, closureCount: postedCount + 1, weekStart: snapshot?.weekStart ?? null },
    burnDown,
    gapTrend: buildGapTrend(data),
    focusSubject: lowestProgressRow ? { subjectId: lowestProgressRow.subjectId, name: lowestProgressRow.name, color: lowestProgressRow.color, rate: lowestProgressRow.rate, weakSubItem: lowestProgressRow.weakSubItem } : null,
    actions,
    mustTasks,
    pendingRequests: data.scoreRequests.filter(item => item.userId === userId && item.status === 'PENDING').length,
    recentAssessments: data.assessments.filter(item => item.userId === userId && item.kind !== 'BASELINE').sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 6),
    generatedAt: new Date().toISOString()
  };
}

export function buildGapTrend(data) {
  const examWeekEnd = data.group.examWeekEnd || '2027-01-17';
  const planStart = data.group.gapPlanStart || '2026-11-20';
  const totalWeeks = data.group.gapPlanWeeks || 9;
  const shanghaiDay = value => new Date(new Date(value).getTime() + 8 * 3600 * 1000).toISOString().slice(0, 10);
  const today = shanghaiDay(new Date());
  const weeks = (gapBurnDownPlan(100, { startDate: planStart, totalWeeks, examWeekEnd })?.points || [])
    .map(point => ({ week: point.week, weekStart: point.weekStart, label: point.label, type: point.type, isExamWeek: point.isExamWeek, percent: point.percent }));
  const days = [];
  for (let cursor = new Date(`${planStart}T00:00:00Z`); cursor.toISOString().slice(0, 10) <= examWeekEnd; cursor.setUTCDate(cursor.getUTCDate() + 1)) {
    const date = cursor.toISOString().slice(0, 10);
    days.push({ date, label: date.slice(5).replace('-', '.') });
  }
  const planDays = Math.max(1, Math.round((new Date(`${examWeekEnd}T00:00:00Z`) - new Date(`${planStart}T00:00:00Z`)) / 86400000));
  const weekStartSet = new Map(weeks.map(item => [item.weekStart, item]));
  const reference = days.map(day => {
    if (day.date < planStart) return { ...day, percent: null, week: null };
    const ratio = (new Date(`${day.date}T00:00:00Z`) - new Date(`${planStart}T00:00:00Z`)) / 86400000 / planDays;
    return { ...day, week: weekStartSet.get(day.date) || null, percent: Math.round(Math.min(100, Math.max(0, ratio)) * 1000) / 10 };
  });
  const students = data.users.filter(user => user.role === 'STUDENT' && user.status === 'ACTIVE').map(user => {
    const subjects = data.subjects.filter(item => item.status === 'ENABLED');
    const targets = new Map(subjects.map(subject => [subject.id, activeTarget(data, user.id, subject.id)]));
    return {
      userId: user.id,
      displayName: user.displayName,
      color: user.avatarColor || '#0b8f87',
      points: days.map(day => {
        if (day.date > today) return { ...day, percent: null, week: weekStartSet.get(day.date) || null };
        let baselineTotal = 0; let currentTotal = 0; let targetTotal = 0; let complete = true;
        for (const subject of subjects) {
          const target = targets.get(subject.id);
          if (!target || target.baselineScore == null || target.targetScore == null) { complete = false; break; }
          const latest = data.assessments
            .filter(item => item.userId === user.id && item.subjectId === subject.id && item.status === 'EFFECTIVE' && item.kind !== 'BASELINE' && shanghaiDay(item.createdAt) <= day.date)
            .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
          const score = latest?.score ?? target.baselineScore;
          if (!Number.isFinite(Number(score))) { complete = false; break; }
          baselineTotal += Number(target.baselineScore);
          currentTotal += Number(score);
          targetTotal += Number(target.targetScore);
        }
        const denominator = targetTotal - baselineTotal;
        return { ...day, week: weekStartSet.get(day.date) || null, percent: complete && denominator > 0 ? Math.max(0, Math.min(100, round1((currentTotal - baselineTotal) / denominator * 100))) : null };
      })
    };
  });
  return { planStart, examWeekEnd, today, totalWeeks: weeks.length, days, weeks, reference, students };
}

export function availableQuestions(data, userId, filters = {}) {
  const used = new Set(data.exportItems.filter(item => item.userId === userId).map(item => item.canonicalId));
  const subject = data.subjects.find(item => item.id === filters.subjectId);
  if (!subject) return [];
  const enabledSubItems = new Set(subject.subItems.filter(item => item.status === 'ENABLED').map(item => item.id));
  const requestedSubItems = Array.isArray(filters.subItemIds) && filters.subItemIds.length ? new Set(filters.subItemIds) : null;
  const unique = new Map();
  data.questions
    .filter(question => question.subjectId === filters.subjectId && question.qualityStatus === 'PUBLISHED')
    .filter(question => enabledSubItems.has(question.subItemId))
    .filter(question => !requestedSubItems || requestedSubItems.has(question.subItemId))
    .filter(question => !filters.type || question.type === filters.type)
    .filter(question => !filters.difficulty || String(question.difficulty) === String(filters.difficulty))
    .filter(question => !used.has(question.canonicalId))
    .forEach(question => { if (!unique.has(question.canonicalId)) unique.set(question.canonicalId, question); });
  return [...unique.values()];
}

export function buildPeerComparison(data, requester, subjectId) {
  const subject = data.subjects.find(item => item.id === subjectId);
  if (!subject) return null;
  const requesterAssessment = currentAssessment(data, requester.id, subjectId);
  const students = data.users.filter(user => user.role === 'STUDENT' && user.status === 'ACTIVE');
  const rows = students.map(student => {
    const progress = subjectProgress(data, student.id, subject);
    const assessment = currentAssessment(data, student.id, subjectId);
    const ownSubject = { ...subject, fullScore: requesterAssessment?.fullScore ?? subject.fullScore };
    const otherSubject = { ...subject, fullScore: assessment?.fullScore ?? subject.fullScore };
    const comparison = student.id === requester.id
      ? { comparable: true, mode: 'RAW', reason: '本人数据' }
      : comparisonMode(ownSubject, otherSubject, requesterAssessment, assessment);
    const snapshot = data.snapshots.find(item => item.userId === student.id && item.subjectGaps?.[subjectId] != null);
    const lastWeekGap = snapshot?.subjectGaps?.[subjectId] ?? null;
    const shrinkRate = weeklyShrink(lastWeekGap, progress.gap);
    const hideAbsolute = student.id !== requester.id && (!requester.showAbsoluteScores || !data.group.showAbsoluteScores || comparison.mode === 'STANDARDIZED');
    return {
      userId: student.id,
      displayName: student.displayName,
      avatarColor: student.avatarColor,
      isSelf: student.id === requester.id,
      score: hideAbsolute ? null : progress.current,
      fullScore: hideAbsolute ? null : progress.fullScore,
      scoreRate: scoreRate(progress.current, progress.fullScore),
      progressRate: progress.rate,
      displayRate: progress.displayRate,
      targetGap: progress.gap,
      lastWeekGap,
      shrinkRate,
      comparable: comparison.comparable,
      mode: comparison.mode,
      reason: comparison.reason,
      source: assessment?.source ?? null,
      occurredAt: assessment?.occurredAt ?? null
    };
  });
  return { subject: { id: subject.id, name: subject.name, code: subject.code, fullScore: subject.fullScore }, rows, showAbsoluteScores: Boolean(requester.showAbsoluteScores && data.group.showAbsoluteScores), sortedBy: '小组约定顺序（非排名）' };
}

export function adminOverview(data) {
  const students = data.users.filter(user => user.role === 'STUDENT' && user.status === 'ACTIVE').map(user => {
    const dashboard = buildDashboard(data, user.id);
    return { user: publicUser(user), summary: dashboard.summary, weekly: dashboard.weekly, subjects: dashboard.subjects, generatedAt: dashboard.generatedAt };
  });
  const gapTrend = buildGapTrend(data);
  return {
    students,
    gapTrend,
    pending: {
      scoreRequests: data.scoreRequests.filter(item => item.status === 'PENDING').length,
      exams: data.exams.filter(item => item.status === 'REVIEW_PENDING').length,
      draftQuestions: data.questions.filter(item => item.qualityStatus !== 'PUBLISHED').length
    },
    alerts: students.flatMap(student => student.subjects.filter(subject => subject.rate != null && subject.rate < 0).map(subject => ({ userId: student.user.id, displayName: student.user.displayName, subjectName: subject.name, type: 'REGRESSION', message: `${subject.name}低于期中基准，请先核查数据与学习负担` }))),
    group: data.group
  };
}
