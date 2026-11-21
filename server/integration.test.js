import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createApp } from './app.js';
import PDFDocument from 'pdfkit';

async function startServer(t) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'tongchuang-test-'));
  const app = await createApp({ dataDirectory: directory });
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  t.after(async () => { await new Promise(resolve => server.close(resolve)); await fs.rm(directory, { recursive: true, force: true }); });
  return { base, app };
}

async function request(base, route, { token, ...options } = {}) {
  const headers = { ...(options.headers || {}) };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (options.body && !(options.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
    options.body = JSON.stringify(options.body);
  }
  const response = await fetch(`${base}${route}`, { ...options, headers });
  const payload = await response.json().catch(() => null);
  return { status: response.status, body: payload, response };
}

async function login(base, account, password) {
  const result = await request(base, '/api/auth/login', { method: 'POST', body: { account, password } });
  assert.equal(result.status, 200, JSON.stringify(result.body));
  return result.body.data.token;
}

test('端到端：权限、成绩申请审核、去重 PDF、偏好和 AI 复核', { timeout: 30000 }, async t => {
  const { base, app } = await startServer(t);
  const admin = await login(base, 'admin', 'Admin@2026');
  const student = await login(base, 'wangsy', '1');

  const forbidden = await request(base, '/api/admin/overview', { token: student });
  assert.equal(forbidden.status, 403);
  const dashboard = await request(base, '/api/dashboard', { token: student });
  assert.equal(dashboard.status, 200);
  assert.equal(dashboard.body.data.subjects.find(item => item.code === 'MATH').current, 91);
  assert.equal(dashboard.body.data.weekly.previousGap, dashboard.body.data.weekly.currentGap);
  const burnDown = dashboard.body.data.burnDown;
  assert.ok(dashboard.body.data.gapTrend);
  assert.ok(burnDown);
  assert.equal(burnDown.totalWeeks, 9);
  assert.equal(burnDown.startWeek, '2026-11-20');
  assert.equal(burnDown.points.length, 9);
  assert.equal(burnDown.points[0].type, 'START');
  assert.equal(burnDown.points[0].percent, 0);
  assert.equal(burnDown.points.at(-1).isExamWeek, true);
  assert.equal(burnDown.points.at(-1).gap, 0);
  assert.ok(burnDown.points.every((point, index, list) => index === 0 || point.gap <= list[index - 1].gap));
  assert.ok(burnDown.points.some(point => point.actualGap != null));
  assert.ok(burnDown.points.filter(point => point.actualPercent != null).every(point => point.actualPercent >= 0 && point.actualPercent <= 100));
  assert.ok(burnDown.points.filter(point => point.actualGap != null).every(point => new Date(point.weekStart) <= new Date(dashboard.body.data.generatedAt)));
  assert.equal(dashboard.body.data.actions[0].tags.includes('GAP_RATIO_LOW') || dashboard.body.data.actions[0].tags.includes('BEHIND_PLAN'), true);
  const overview = await request(base, '/api/admin/overview', { token: admin });
  assert.equal(overview.status, 200);
  const gapTrend = overview.body.data.gapTrend;
  assert.ok(gapTrend);
  assert.equal(gapTrend.students.length, 3);
  assert.equal(gapTrend.totalWeeks, 9);
  assert.equal(gapTrend.reference.length, 9);
  assert.equal(gapTrend.reference[0].percent, 0);
  assert.equal(gapTrend.reference.at(-1).percent, 100);
  assert.ok(gapTrend.students.every(student => student.points.length === gapTrend.weeks.length));
  assert.equal(gapTrend.weeks[0].type, 'START');
  assert.equal(gapTrend.weeks.at(-1).isExamWeek, true);
  assert.ok(gapTrend.students.every(student => {
    const actual = student.points.filter(point => point.percent != null);
    return actual.every((point, index, list) => index === 0 || point.percent >= list[index - 1].percent);
  }));

  const requestResult = await request(base, '/api/score-requests', { token: student, method: 'POST', body: { subjectId: 'sub_math', score: 90, source: 'PRACTICE', occurredAt: '2026-11-19', note: '集成测试申请' } });

  assert.equal(requestResult.status, 201, JSON.stringify(requestResult.body));
  const requestId = requestResult.body.data.id;
  const beforeReview = await request(base, '/api/dashboard', { token: student });
  assert.equal(beforeReview.body.data.subjects.find(item => item.code === 'MATH').current, 91);
  const approved = await request(base, `/api/score-requests/${requestId}/review`, { token: admin, method: 'POST', body: { decision: 'APPROVE', reason: '集成测试复核' } });
  assert.equal(approved.status, 200, JSON.stringify(approved.body));
  const afterReview = await request(base, '/api/dashboard', { token: student });
  assert.equal(afterReview.body.data.subjects.find(item => item.code === 'MATH').current, 90);
  const duplicateReview = await request(base, `/api/score-requests/${requestId}/review`, { token: admin, method: 'POST', body: { decision: 'APPROVE' } });
  assert.equal(duplicateReview.status, 409);

  const available = await request(base, '/api/practice/available', { token: student, method: 'POST', body: { subjectId: 'sub_math' } });
  assert.equal(available.body.data.count, 12);
  const first = await request(base, '/api/practice/generate', { token: student, method: 'POST', body: { subjectId: 'sub_math', count: 3 } });
  assert.equal(first.status, 201, JSON.stringify(first.body));
  assert.equal(first.body.data.status, 'SUCCESS');
  const second = await request(base, '/api/practice/generate', { token: student, method: 'POST', body: { subjectId: 'sub_math', count: 3 } });
  assert.equal(second.status, 201, JSON.stringify(second.body));
  const firstIds = new Set(first.body.data.questionIds.map(id => app.locals.store.data.questions.find(q => q.id === id).canonicalId));
  const secondIds = second.body.data.questionIds.map(id => app.locals.store.data.questions.find(q => q.id === id).canonicalId);
  assert.equal(secondIds.some(id => firstIds.has(id)), false);
  const download = await fetch(`${base}${first.body.data.downloadUrl}`, { headers: { Authorization: `Bearer ${student}` } });
  assert.equal(download.status, 200);
  assert.equal((await download.arrayBuffer()).byteLength > 1000, true);

  await request(base, '/api/me/preferences', { token: student, method: 'PATCH', body: { showAbsoluteScores: false } });
  const comparison = await request(base, '/api/peer-comparison?subjectId=sub_math', { token: student });
  const other = comparison.body.data.rows.find(row => !row.isSelf);
  assert.equal(other.score, null);
  assert.equal(other.fullScore, null);

  const form = new FormData();
  form.append('files', new Blob([Buffer.from('89504e470d0a1a0a', 'hex')], { type: 'image/png' }), 'answer.png');
  form.append('subjectId', 'sub_math'); form.append('source', 'PRACTICE'); form.append('occurredAt', '2026-11-19');
  const uploaded = await request(base, '/api/exams', { token: student, method: 'POST', body: form });
  assert.equal(uploaded.status, 201, JSON.stringify(uploaded.body));
  const examId = uploaded.body.data.id;
  const confirmed = await request(base, `/api/exams/${examId}/confirm`, { token: student, method: 'POST' });
  assert.equal(confirmed.status, 200, JSON.stringify(confirmed.body));
  assert.equal(confirmed.body.data.status, 'REVIEW_PENDING');
  const reviewItems = confirmed.body.data.items.map(item => ({ id: item.id, reviewedScore: item.suggestedScore, reviewReason: '' }));
  const reviewed = await request(base, `/api/exams/${examId}/review`, { token: admin, method: 'POST', body: { reason: '集成测试逐题复核', items: reviewItems } });
  assert.equal(reviewed.status, 200, JSON.stringify(reviewed.body));
  assert.equal(reviewed.body.data.exam.status, 'POSTED');
  const postedAgain = await request(base, `/api/exams/${examId}/review`, { token: admin, method: 'POST', body: { items: reviewItems } });
  assert.equal(postedAgain.status, 409);
});

test('并发组卷不重复，题量不足不偷补，其他用户历史独立', { timeout: 30000 }, async t => {
  const { base, app } = await startServer(t);
  const firstUser = await login(base, 'wangsy', '1');
  const secondUser = await login(base, 'zhangxy', '1');
  const generate = token => request(base, '/api/practice/generate', { token, method: 'POST', body: { subjectId: 'sub_math', count: 6 } });
  const [left, right] = await Promise.all([generate(firstUser), generate(firstUser)]);
  assert.equal(left.status, 201, JSON.stringify(left.body));
  assert.equal(right.status, 201, JSON.stringify(right.body));
  const canonical = id => app.locals.store.data.questions.find(question => question.id === id).canonicalId;
  const leftIds = new Set(left.body.data.questionIds.map(canonical));
  assert.equal(right.body.data.questionIds.map(canonical).some(id => leftIds.has(id)), false);
  const insufficient = await request(base, '/api/practice/generate', { token: firstUser, method: 'POST', body: { subjectId: 'sub_math', count: 1 } });
  assert.equal(insufficient.status, 409);
  assert.equal(insufficient.body.error.details.available, 0);
  const independent = await request(base, '/api/practice/generate', { token: secondUser, method: 'POST', body: { subjectId: 'sub_math', count: 6 } });
  assert.equal(independent.status, 201);
  assert.equal(independent.body.data.questionIds.map(canonical).some(id => leftIds.has(id)), true);
});

test('同伴错题互助支持文字/语音思路和小红花', async t => {
  const { base } = await startServer(t);
  const wang = await login(base, 'wangsy', '1');
  const zhang = await login(base, 'zhangxy', '1');
  const peerWrong = await request(base, '/api/peer-wrong-questions', { token: wang });
  assert.equal(peerWrong.status, 200);
  const target = peerWrong.body.data.find(item => item.ownerId === 'user_zhang');
  assert.ok(target);
  const ownWrong = await request(base, '/api/wrong-questions', { token: wang });
  const ownHelp = await request(base, `/api/wrong-questions/${ownWrong.body.data[0].id}/helps`, { token: wang, method: 'POST', body: { content: '不能帮助自己' } });
  assert.equal(ownHelp.status, 400);
  const help = await request(base, `/api/wrong-questions/${target.id}/helps`, { token: wang, method: 'POST', body: { content: '先比较形容词原级，再看句中有没有 than。', inputMode: 'VOICE' } });
  assert.equal(help.status, 201);
  assert.equal(help.body.data.inputMode, 'VOICE');
  const received = await request(base, '/api/wrong-helps', { token: zhang });
  assert.equal(received.status, 200);
  const targetHelp = received.body.data.find(item => item.id === help.body.data.id);
  assert.equal(targetHelp.wrong.ownerId, 'user_zhang');
  const flower = await request(base, `/api/wrong-helps/${targetHelp.id}/flowers`, { token: zhang, method: 'POST' });
  assert.equal(flower.status, 200);
  assert.equal(flower.body.data.flowerCount, 1);
  assert.equal(flower.body.data.likedByMe, true);
  const helperView = await request(base, '/api/wrong-helps', { token: wang });
  assert.equal(helperView.body.data.find(item => item.id === targetHelp.id).flowerCount, 1);
});

test('PDF 试卷解析、切题和答案预填', { timeout: 20000 }, async t => {
  const { base } = await startServer(t);
  const admin = await login(base, 'admin', 'Admin@2026');
  const chunks = [];
  const doc = new PDFDocument({ margin: 50 });
  doc.on('data', chunk => chunks.push(chunk));
  const finished = new Promise(resolve => doc.on('end', resolve));
  doc.font('Helvetica').fontSize(14).text('Autumn Stage Test');
  doc.moveDown().fontSize(11);
  doc.text('1. Solve the equation x + 1 = 2.');
  doc.text('A. 0');
  doc.text('B. 1');
  doc.text('C. 2');
  doc.text('D. 3');
  doc.moveDown();
  doc.text('2. Find the area of a triangle with base 4 and height 3.');
  doc.moveDown();
  doc.text('3. Explain why the angles in a triangle sum to 180 degrees.');
  doc.moveDown();
  doc.text('Answer key:');
  doc.text('1. B');
  doc.text('2. 6');
  doc.text('3. Triangle angle sum theorem.');
  doc.end();
  await finished;
  const form = new FormData();
  form.append('file', new Blob([Buffer.concat(chunks)], { type: 'application/pdf' }), 'stage.pdf');
  form.append('subjectId', 'sub_math');
  form.append('source', 'Autumn Stage Test');
  const result = await request(base, '/api/questions/parse-pdf', { token: admin, method: 'POST', body: form });
  assert.equal(result.status, 200, JSON.stringify(result.body));
  const data = result.body.data;
  assert.equal(data.pageCount, 1);
  assert.equal(data.questions.length, 3);
  assert.equal(data.questions[0].options.length, 4);
  assert.equal(data.questions[0].answer, 'B');
  assert.equal(data.questions[1].answer, '6');
  assert.equal(data.questions.every(item => item.subItemId && item.type && item.fullScore > 0), true);
});
