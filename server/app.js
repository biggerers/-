import express from 'express';
import cors from 'cors';
import multer from 'multer';
import bcrypt from 'bcryptjs';
import fs from 'node:fs';
import fsPromises from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { Store, uid, now } from './store.js';
import { validateScore, clampScore, distributeSubItemScores, round1 } from './domain.js';
import { publicUser, currentAssessment, activeTarget, buildDashboard, availableQuestions, buildPeerComparison, adminOverview } from './services.js';
import { createPracticePdf } from './pdf.js';
import { parsePaperPdf } from './paperParser.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const asyncRoute = handler => (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
class HttpError extends Error {
  constructor(status, message, code = 'BAD_REQUEST', details = null) {
    super(message); this.status = status; this.code = code; this.details = details;
  }
}
const fail = (status, message, code, details) => { throw new HttpError(status, message, code, details); };
const text = (value, max = 500) => String(value ?? '').trim().slice(0, max);
const normalizeSubItemScores = (subject, values, total) => {
  const entries = Array.isArray(values) ? values
    : values && typeof values === 'object' ? Object.entries(values).map(([subItemId, score]) => ({ subItemId, score }))
    : null;
  if (!entries || !entries.length) return distributeSubItemScores(subject, total);
  const enabled = subject.subItems.filter(item => item.status === 'ENABLED');
  const ids = new Set(enabled.map(item => item.id));
  const normalized = entries.map(item => ({ subItemId: text(item.subItemId), score: Number(item.score) }));
  if (normalized.some(item => !ids.has(item.subItemId) || !Number.isFinite(item.score) || item.score < 0)) fail(400, '分项分数格式不正确', 'INVALID_SUB_ITEM_SCORES');
  const subItemTotal = normalized.reduce((sum, item) => sum + item.score, 0);
  if (Math.abs(subItemTotal - Number(total)) > 0.05) fail(400, '分项分数合计需要等于总分', 'INVALID_SUB_ITEM_TOTAL');
  return normalized;
};
const send = (res, data, status = 200) => res.status(status).json({ data });

function addAudit(data, actorId, action, entityType, entityId, reason = '', before = null, after = null) {
  data.auditLogs.push({ id: uid('audit'), actorId, action, entityType, entityId, reason: text(reason, 300), before, after, createdAt: now() });
}

function publicQuestion(question, privileged = false) {
  if (!question) return null;
  if (privileged) return question;
  const { answer, analysis, rubric, reviewerId, ...safe } = question;
  return safe;
}

function publicExam(exam, privileged = false) {
  const { files, ...safe } = exam;
  return { ...safe, fileCount: files?.length || 0, files: privileged ? files.map(file => ({ name: file.originalName, size: file.size, mimeType: file.mimeType })) : undefined };
}

export async function createApp(options = {}) {
  const store = await new Store(options.dataDirectory).init();
  const app = express();
  const sessions = new Map();
  const attempts = new Map();
  app.locals.store = store;
  app.locals.sessions = sessions;
  app.disable('x-powered-by');
  app.use(cors({ origin: true, credentials: false }));
  app.use(express.json({ limit: '2mb' }));
  app.use(express.urlencoded({ extended: true }));
  app.use((req, res, next) => { req.requestId = crypto.randomUUID().slice(0, 8); res.setHeader('X-Request-Id', req.requestId); next(); });

  const auth = (req, res, next) => {
    const token = req.headers.authorization?.replace(/^Bearer\s+/i, '');
    const session = token && sessions.get(token);
    if (!session) return next(new HttpError(401, '登录状态已失效，请重新登录', 'UNAUTHORIZED'));
    const user = store.data.users.find(item => item.id === session.userId && item.status === 'ACTIVE');
    if (!user) { sessions.delete(token); return next(new HttpError(401, '账号不可用，请联系管理员', 'ACCOUNT_DISABLED')); }
    req.user = user; req.token = token; next();
  };
  const adminOnly = (req, res, next) => req.user.role === 'ADMIN' ? next() : next(new HttpError(403, '当前角色无管理权限', 'FORBIDDEN'));
  const ownsOrAdmin = (req, userId) => req.user.role === 'ADMIN' || req.user.id === userId;

  app.get('/api/health', (req, res) => send(res, { status: 'ok', service: '同窗进阶 API', time: now(), aiMode: 'mock' }));

  app.post('/api/auth/login', asyncRoute(async (req, res) => {
    const account = text(req.body.account, 32).toLowerCase();
    const key = `${req.ip}:${account}`;
    const attempt = attempts.get(key);
    if (attempt && attempt.count >= 5 && Date.now() - attempt.startedAt < 10 * 60 * 1000) fail(429, '登录尝试过多，请 10 分钟后再试', 'LOGIN_RATE_LIMIT');
    const user = store.data.users.find(item => item.account.toLowerCase() === account && item.status === 'ACTIVE');
    if (!user || !await bcrypt.compare(String(req.body.password ?? ''), user.passwordHash)) {
      const current = attempt && Date.now() - attempt.startedAt < 10 * 60 * 1000 ? attempt : { count: 0, startedAt: Date.now() };
      current.count += 1; attempts.set(key, current);
      fail(401, '账号或密码不正确', 'INVALID_CREDENTIALS');
    }
    attempts.delete(key);
    const token = crypto.randomBytes(32).toString('hex');
    sessions.set(token, { userId: user.id, createdAt: Date.now() });
    await store.transaction(data => {
      const target = data.users.find(item => item.id === user.id);
      target.lastLoginAt = now();
    });
    send(res, { token, user: publicUser(store.data.users.find(item => item.id === user.id)) });
  }));

  app.get('/api/auth/me', auth, (req, res) => send(res, { user: publicUser(req.user) }));
  app.post('/api/auth/logout', auth, (req, res) => { sessions.delete(req.token); send(res, { success: true }); });
  app.post('/api/auth/password', auth, asyncRoute(async (req, res) => {
    const oldPassword = String(req.body.oldPassword ?? '');
    const newPassword = String(req.body.newPassword ?? '');
    if (!await bcrypt.compare(oldPassword, req.user.passwordHash)) fail(400, '当前密码不正确', 'INVALID_PASSWORD');
    if (newPassword.length < 8 || !/[A-Za-z]/.test(newPassword) || !/\d/.test(newPassword)) fail(400, '新密码至少 8 位，且同时包含字母和数字', 'WEAK_PASSWORD');
    const passwordHash = await bcrypt.hash(newPassword, 10);
    await store.transaction(data => {
      data.users.find(item => item.id === req.user.id).passwordHash = passwordHash;
      addAudit(data, req.user.id, 'PASSWORD_CHANGED', 'USER', req.user.id, '用户主动修改密码');
    });
    for (const [token, session] of sessions) if (session.userId === req.user.id && token !== req.token) sessions.delete(token);
    send(res, { success: true, message: '密码已更新，其他会话已退出' });
  }));

  app.get('/api/bootstrap', auth, (req, res) => {
    const students = store.data.users.filter(user => user.role === 'STUDENT' && user.status === 'ACTIVE').map(publicUser);
    send(res, { user: publicUser(req.user), group: store.data.group, subjects: store.data.subjects.filter(item => item.status === 'ENABLED').sort((a, b) => a.sort - b.sort), students, dashboard: req.user.role === 'STUDENT' ? buildDashboard(store.data, req.user.id) : null });
  });
  app.get('/api/dashboard', auth, (req, res) => {
    const userId = req.user.role === 'ADMIN' ? text(req.query.userId || store.data.users.find(user => user.role === 'STUDENT')?.id) : req.user.id;
    if (!ownsOrAdmin(req, userId)) fail(403, '不可查看其他学生的详细成绩', 'FORBIDDEN');
    send(res, buildDashboard(store.data, userId));
  });
  app.get('/api/admin/overview', auth, adminOnly, (req, res) => send(res, adminOverview(store.data)));
  app.get('/api/peer-comparison', auth, (req, res) => {
    if (req.user.role !== 'STUDENT') fail(403, '请使用学生账号查看个人同伴视图', 'FORBIDDEN');
    const comparison = buildPeerComparison(store.data, req.user, text(req.query.subjectId));
    if (!comparison) fail(404, '科目不存在', 'NOT_FOUND');
    send(res, comparison);
  });
  app.patch('/api/me/preferences', auth, asyncRoute(async (req, res) => {
    await store.transaction(data => {
      const user = data.users.find(item => item.id === req.user.id);
      if (typeof req.body.showAbsoluteScores === 'boolean') user.showAbsoluteScores = req.body.showAbsoluteScores;
      addAudit(data, req.user.id, 'PEER_PREFERENCE_CHANGED', 'USER', req.user.id, '修改同伴对比偏好');
    });
    send(res, { user: publicUser(store.data.users.find(item => item.id === req.user.id)) });
  }));

  app.get('/api/users', auth, adminOnly, (req, res) => send(res, store.data.users.map(publicUser)));
  app.post('/api/users', auth, adminOnly, asyncRoute(async (req, res) => {
    const account = text(req.body.account, 32).toLowerCase();
    const displayName = text(req.body.displayName, 30);
    const role = req.body.role === 'ADMIN' ? 'ADMIN' : 'STUDENT';
    const initialPassword = String(req.body.initialPassword || `Tc${crypto.randomBytes(5).toString('hex')}26`);
    if (!/^[a-zA-Z0-9_]{4,32}$/.test(account)) fail(400, '账号需为 4–32 位字母、数字或下划线', 'INVALID_ACCOUNT');
    if (!displayName) fail(400, '请填写展示姓名', 'INVALID_NAME');
    if (initialPassword.length < 8) fail(400, '初始密码至少 8 位', 'WEAK_PASSWORD');
    if (store.data.users.some(user => user.account.toLowerCase() === account)) fail(409, '账号已存在', 'DUPLICATE_ACCOUNT');
    const id = uid('user');
    await store.transaction(data => {
      data.users.push({ id, groupId: data.group.id, account, displayName, role, status: 'ACTIVE', passwordHash: bcrypt.hashSync(initialPassword, 10), avatarColor: ['#e88c65', '#4b83c9', '#24a397', '#9a7bd0'][data.users.length % 4], showAbsoluteScores: true, createdAt: now(), lastLoginAt: null });
      addAudit(data, req.user.id, 'USER_CREATED', 'USER', id, '管理员创建账号', null, { account, displayName, role });
    });
    send(res, { user: publicUser(store.data.users.find(user => user.id === id)), initialPassword }, 201);
  }));
  app.patch('/api/users/:id', auth, adminOnly, asyncRoute(async (req, res) => {
    const id = req.params.id;
    if (!store.data.users.some(user => user.id === id)) fail(404, '用户不存在', 'NOT_FOUND');
    if (id === req.user.id && req.body.status === 'DISABLED') fail(400, '不能停用当前登录的管理员账号', 'INVALID_OPERATION');
    await store.transaction(data => {
      const user = data.users.find(item => item.id === id);
      const before = publicUser(user);
      if (req.body.displayName != null) user.displayName = text(req.body.displayName, 30);
      if (['ACTIVE', 'DISABLED'].includes(req.body.status)) user.status = req.body.status;
      if (['STUDENT', 'ADMIN'].includes(req.body.role)) user.role = req.body.role;
      addAudit(data, req.user.id, 'USER_UPDATED', 'USER', id, text(req.body.reason || '管理员更新账号'), before, publicUser(user));
    });
    for (const [token, session] of sessions) if (session.userId === id && store.data.users.find(user => user.id === id).status === 'DISABLED') sessions.delete(token);
    send(res, publicUser(store.data.users.find(user => user.id === id)));
  }));
  app.post('/api/users/:id/reset-password', auth, adminOnly, asyncRoute(async (req, res) => {
    const id = req.params.id;
    if (!store.data.users.some(user => user.id === id)) fail(404, '用户不存在', 'NOT_FOUND');
    const initialPassword = `Tc${crypto.randomBytes(6).toString('hex')}26`;
    await store.transaction(data => {
      data.users.find(user => user.id === id).passwordHash = bcrypt.hashSync(initialPassword, 10);
      addAudit(data, req.user.id, 'PASSWORD_RESET', 'USER', id, '管理员重置密码');
    });
    for (const [token, session] of sessions) if (session.userId === id) sessions.delete(token);
    send(res, { initialPassword, message: '密码已重置，旧会话已全部失效' });
  }));

  app.get('/api/subjects', auth, (req, res) => send(res, store.data.subjects.sort((a, b) => a.sort - b.sort)));
  app.post('/api/subjects', auth, adminOnly, asyncRoute(async (req, res) => {
    const name = text(req.body.name, 30); const code = text(req.body.code, 20).toUpperCase();
    const fullScore = Number(req.body.fullScore); const subItems = Array.isArray(req.body.subItems) ? req.body.subItems : [];
    if (!name || !/^[A-Z][A-Z0-9_]{1,19}$/.test(code)) fail(400, '请填写科目名称和有效编码', 'INVALID_SUBJECT');
    if (!Number.isFinite(fullScore) || fullScore <= 0) fail(400, '科目总分必须为正数', 'INVALID_SCORE');
    const sum = subItems.filter(item => item.status !== 'DISABLED').reduce((total, item) => total + Number(item.fullScore || 0), 0);
    if (subItems.length && Math.abs(sum - fullScore) > 0.001) fail(400, `启用分项合计为 ${sum}，与科目总分相差 ${Math.abs(fullScore - sum)}`, 'SUBITEM_TOTAL_MISMATCH');
    const id = uid('sub');
    await store.transaction(data => {
      if (data.subjects.some(subject => subject.code === code)) fail(409, '科目编码已存在', 'DUPLICATE_SUBJECT');
      data.subjects.push({ id, code, name, fullScore, color: req.body.color || '#4d83cf', icon: 'BookOpen', sort: data.subjects.length + 1, version: 1, status: 'ENABLED', createdAt: now(), subItems: subItems.map((item, index) => ({ id: uid('item'), name: text(item.name, 30), fullScore: Number(item.fullScore), sort: index + 1, status: 'ENABLED' })) });
      addAudit(data, req.user.id, 'SUBJECT_CREATED', 'SUBJECT', id, '创建科目结构');
    });
    send(res, store.data.subjects.find(subject => subject.id === id), 201);
  }));
  app.put('/api/subjects/:id', auth, adminOnly, asyncRoute(async (req, res) => {
    const id = req.params.id;
    const existing = store.data.subjects.find(subject => subject.id === id);
    if (!existing) fail(404, '科目不存在', 'NOT_FOUND');
    const fullScore = Number(req.body.fullScore ?? existing.fullScore);
    const subItems = Array.isArray(req.body.subItems) ? req.body.subItems : existing.subItems;
    const sum = subItems.filter(item => item.status !== 'DISABLED').reduce((total, item) => total + Number(item.fullScore || 0), 0);
    if (!Number.isFinite(fullScore) || fullScore <= 0) fail(400, '科目总分必须为正数', 'INVALID_SCORE');
    if (subItems.length && Math.abs(sum - fullScore) > 0.001) fail(400, `启用分项合计为 ${sum}，与科目总分相差 ${Math.abs(fullScore - sum)}`, 'SUBITEM_TOTAL_MISMATCH');
    await store.transaction(data => {
      const subject = data.subjects.find(item => item.id === id);
      const before = structuredClone(subject);
      subject.name = text(req.body.name ?? subject.name, 30);
      subject.fullScore = fullScore;
      subject.status = ['ENABLED', 'DISABLED'].includes(req.body.status) ? req.body.status : subject.status;
      subject.subItems = subItems.map((item, index) => ({ id: item.id || uid('item'), name: text(item.name, 30), fullScore: Number(item.fullScore), sort: index + 1, status: item.status || 'ENABLED' }));
      subject.version += 1;
      addAudit(data, req.user.id, 'SUBJECT_VERSION_CREATED', 'SUBJECT', id, text(req.body.reason || '调整科目结构'), before, subject);
    });
    send(res, store.data.subjects.find(subject => subject.id === id));
  }));

  app.get('/api/scores', auth, (req, res) => {
    const userId = req.user.role === 'ADMIN' ? text(req.query.userId) : req.user.id;
    if (userId && !ownsOrAdmin(req, userId)) fail(403, '不可查看其他学生成绩', 'FORBIDDEN');
    const records = store.data.assessments.filter(item => !userId || item.userId === userId).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    send(res, records);
  });
  app.post('/api/scores', auth, adminOnly, asyncRoute(async (req, res) => {
    const userId = text(req.body.userId); const subjectId = text(req.body.subjectId);
    const user = store.data.users.find(item => item.id === userId && item.role === 'STUDENT');
    const subject = store.data.subjects.find(item => item.id === subjectId);
    if (!user || !subject) fail(404, '学生或科目不存在', 'NOT_FOUND');
    const error = validateScore(req.body.score, subject.fullScore); if (error) fail(400, error, 'INVALID_SCORE');
    const occurredAt = text(req.body.occurredAt, 30); const source = text(req.body.source, 40) || 'STAGE_EXAM';
    if (!occurredAt) fail(400, '请填写作答日期', 'MISSING_SOURCE');
    const id = uid('assessment');
    await store.transaction(data => {
      data.assessments.push({ id, userId, subjectId, subjectVersion: subject.version, score: Number(req.body.score), fullScore: subject.fullScore, subItemScores: normalizeSubItemScores(subject, req.body.subItemScores, Number(req.body.score)), source, kind: 'CURRENT', status: 'EFFECTIVE', occurredAt: new Date(occurredAt).toISOString(), createdAt: now(), comparisonGroup: text(req.body.comparisonGroup || source, 80), reviewerId: req.user.id, note: text(req.body.note, 500), originalRecordId: req.body.originalRecordId || null });
      addAudit(data, req.user.id, 'SCORE_POSTED', 'ASSESSMENT', id, text(req.body.note || '管理员录入并生效'), null, { userId, subjectId, score: Number(req.body.score), source, occurredAt });
    });
    send(res, store.data.assessments.find(item => item.id === id), 201);
  }));
  app.get('/api/targets', auth, (req, res) => {
    const userId = req.user.role === 'ADMIN' ? text(req.query.userId) : req.user.id;
    if (userId && !ownsOrAdmin(req, userId)) fail(403, '不可查看其他学生目标', 'FORBIDDEN');
    send(res, store.data.targets.filter(item => !userId || item.userId === userId).sort((a, b) => b.version - a.version));
  });
  app.post('/api/targets', auth, adminOnly, asyncRoute(async (req, res) => {
    const { userId, subjectId } = req.body;
    const subject = store.data.subjects.find(item => item.id === subjectId);
    const user = store.data.users.find(item => item.id === userId && item.role === 'STUDENT');
    if (!subject || !user) fail(404, '学生或科目不存在', 'NOT_FOUND');
    const error = validateScore(req.body.targetScore, subject.fullScore); if (error) fail(400, error, 'INVALID_SCORE');
    if (!text(req.body.reason)) fail(400, '目标调整必须填写原因', 'MISSING_REASON');
    const baselineEntries = Array.isArray(req.body.subItemBaselines) ? req.body.subItemBaselines
      : req.body.subItemBaselines && typeof req.body.subItemBaselines === 'object' ? Object.entries(req.body.subItemBaselines).map(([subItemId, itemScore]) => ({ subItemId, score: itemScore }))
      : null;
    const subItemBaselines = baselineEntries ? normalizeSubItemScores(subject, baselineEntries, round1(baselineEntries.reduce((sum, item) => sum + Number(item.score), 0))) : [];
    const baselineTotal = subItemBaselines.length ? round1(subItemBaselines.reduce((sum, item) => sum + item.score, 0)) : null;
    if (subItemBaselines.length) {
      const baselineError = validateScore(baselineTotal, subject.fullScore); if (baselineError) fail(400, baselineError, 'INVALID_BASELINE');
    }
    const previous = activeTarget(store.data, userId, subjectId);
    const baselineScore = subItemBaselines.length ? baselineTotal : (req.body.baselineScore != null ? Number(req.body.baselineScore) : previous?.baselineScore);
    if (!Number.isFinite(baselineScore)) fail(400, '请先补录有效的期中基准', 'MISSING_BASELINE');
    if (Number(req.body.targetScore) < baselineScore && !req.body.confirmReverse) fail(400, '目标低于期中基准，请确认目标口径', 'REVERSE_TARGET');
    const id = uid('target');
    await store.transaction(data => {
      data.targets.filter(item => item.userId === userId && item.subjectId === subjectId && item.status === 'ACTIVE').forEach(item => { item.status = 'SUPERSEDED'; });
      data.targets.push({ id, userId, subjectId, baselineAssessmentId: previous?.baselineAssessmentId || null, baselineScore, targetScore: Number(req.body.targetScore), subItemTargets: normalizeSubItemScores(subject, req.body.subItemTargets, Number(req.body.targetScore)), subItemBaselines: subItemBaselines.length ? subItemBaselines : previous?.subItemBaselines || null, version: (previous?.version || 0) + 1, effectiveAt: req.body.effectiveAt ? new Date(req.body.effectiveAt).toISOString() : now(), createdAt: now(), reason: text(req.body.reason, 500), status: 'ACTIVE' });
      if (subItemBaselines.length) {
        const baselineRecord = data.assessments.find(item => item.userId === userId && item.subjectId === subjectId && item.kind === 'BASELINE' && item.status === 'EFFECTIVE');
        if (baselineRecord) { baselineRecord.score = baselineScore; baselineRecord.subItemScores = subItemBaselines; }
      }
      addAudit(data, req.user.id, 'TARGET_VERSION_CREATED', 'TARGET', id, req.body.reason, previous, { targetScore: Number(req.body.targetScore), baselineScore, subItemBaselines: subItemBaselines.length ? subItemBaselines : undefined });
    });
    send(res, store.data.targets.find(item => item.id === id), 201);
  }));

  app.get('/api/score-requests', auth, (req, res) => {
    const records = store.data.scoreRequests.filter(item => req.user.role === 'ADMIN' || item.userId === req.user.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    send(res, records.map(item => ({ ...item, user: publicUser(store.data.users.find(user => user.id === item.userId)), subject: store.data.subjects.find(subject => subject.id === item.subjectId) })));
  });
  app.post('/api/score-requests', auth, asyncRoute(async (req, res) => {
    if (req.user.role !== 'STUDENT') fail(403, '管理员请使用直接录入接口', 'FORBIDDEN');
    const subject = store.data.subjects.find(item => item.id === req.body.subjectId && item.status === 'ENABLED');
    if (!subject) fail(404, '科目不存在', 'NOT_FOUND');
    const error = validateScore(req.body.score, subject.fullScore); if (error) fail(400, error, 'INVALID_SCORE');
    if (!text(req.body.occurredAt)) fail(400, '请填写作答日期', 'MISSING_SOURCE');
    const id = uid('request');
    await store.transaction(data => {
      data.scoreRequests.push({ id, userId: req.user.id, subjectId: subject.id, requestedScore: Number(req.body.score), subItemScores: normalizeSubItemScores(subject, req.body.subItemScores, Number(req.body.score)), source: text(req.body.source, 40) || 'STAGE_EXAM', occurredAt: text(req.body.occurredAt, 30), comparisonGroup: text(req.body.comparisonGroup || req.body.source, 80) || 'STAGE_EXAM', note: text(req.body.note, 500), status: 'PENDING', version: 1, createdAt: now() });
      addAudit(data, req.user.id, 'SCORE_CHANGE_SUBMITTED', 'SCORE_REQUEST', id, '学生提交成绩变更申请', null, { subjectId: subject.id, requestedScore: Number(req.body.score) });
    });
    send(res, store.data.scoreRequests.find(item => item.id === id), 201);
  }));
  app.post('/api/score-requests/:id/withdraw', auth, asyncRoute(async (req, res) => {
    const request = store.data.scoreRequests.find(item => item.id === req.params.id);
    if (!request || !ownsOrAdmin(req, request.userId)) fail(404, '申请不存在', 'NOT_FOUND');
    if (request.status !== 'PENDING') fail(409, '申请已处理，不能撤回', 'INVALID_STATE');
    await store.transaction(data => {
      const target = data.scoreRequests.find(item => item.id === request.id);
      if (target.status !== 'PENDING') fail(409, '申请已被处理，请刷新', 'CONCURRENT_MODIFICATION');
      target.status = 'WITHDRAWN'; target.withdrawnAt = now();
      addAudit(data, req.user.id, 'SCORE_CHANGE_WITHDRAWN', 'SCORE_REQUEST', request.id, '学生撤回申请');
    });
    send(res, { success: true });
  }));
  app.post('/api/score-requests/:id/review', auth, adminOnly, asyncRoute(async (req, res) => {
    const existing = store.data.scoreRequests.find(item => item.id === req.params.id);
    if (!existing) fail(404, '申请不存在', 'NOT_FOUND');
    if (existing.status !== 'PENDING') fail(409, '该申请已被处理，请刷新查看最新结果', 'CONCURRENT_MODIFICATION');
    const decision = req.body.decision === 'APPROVE' ? 'APPROVED' : 'REJECTED';
    if (decision === 'REJECTED' && !text(req.body.reason)) fail(400, '驳回申请必须填写原因', 'MISSING_REASON');
    let assessmentId = null;
    await store.transaction(data => {
      const request = data.scoreRequests.find(item => item.id === existing.id);
      if (request.status !== 'PENDING') fail(409, '该申请已被处理，不能重复审核', 'CONCURRENT_MODIFICATION');
      request.status = decision; request.reviewerId = req.user.id; request.reviewedAt = now(); request.reviewReason = text(req.body.reason, 500);
      if (decision === 'APPROVED') {
        const subject = data.subjects.find(item => item.id === request.subjectId);
        assessmentId = uid('assessment');
        data.assessments.push({ id: assessmentId, userId: request.userId, subjectId: request.subjectId, subjectVersion: subject.version, score: request.requestedScore, fullScore: subject.fullScore, subItemScores: request.subItemScores || distributeSubItemScores(subject, request.requestedScore), source: request.source, kind: 'CURRENT', status: 'EFFECTIVE', occurredAt: new Date(request.occurredAt).toISOString(), createdAt: now(), comparisonGroup: request.comparisonGroup, reviewerId: req.user.id, note: request.note, scoreRequestId: request.id });
      }
      addAudit(data, req.user.id, decision === 'APPROVED' ? 'SCORE_CHANGE_APPROVED' : 'SCORE_CHANGE_REJECTED', 'SCORE_REQUEST', request.id, req.body.reason, { status: 'PENDING' }, { status: decision, assessmentId });
    });
    send(res, { request: store.data.scoreRequests.find(item => item.id === existing.id), assessmentId });
  }));

  const pdfUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024, files: 1 }, fileFilter: (req, file, callback) => callback(file.mimetype === 'application/pdf' ? null : new HttpError(400, '请上传 PDF 格式的试卷文件', 'INVALID_FILE_TYPE'), file.mimetype === 'application/pdf') });
  app.post('/api/questions/parse-pdf', auth, adminOnly, pdfUpload.single('file'), asyncRoute(async (req, res) => {
    const subject = store.data.subjects.find(item => item.id === req.body.subjectId && item.status === 'ENABLED');
    if (!subject) fail(404, '科目不存在', 'NOT_FOUND');
    if (!req.file || req.file.buffer.subarray(0, 5).toString() !== '%PDF-') fail(400, '请上传真实的 PDF 试卷文件', 'INVALID_FILE_SIGNATURE');
    const parsed = await parsePaperPdf(req.file.buffer, { subject, source: text(req.body.source, 120), copyrightStatus: text(req.body.copyrightStatus, 30) || 'PENDING' });
    if (!parsed.questions.length) fail(422, '未能从 PDF 中识别出题号和题干；请确认这是文字版试卷，扫描件需先转成可复制文本', 'PDF_QUESTIONS_NOT_FOUND', { pageCount: parsed.pageCount, textLength: parsed.textLength });
    send(res, { pageCount: parsed.pageCount, textLength: parsed.textLength, questions: parsed.questions });
  }));

  app.get('/api/questions', auth, (req, res) => {
    const privileged = req.user.role === 'ADMIN';
    let questions = store.data.questions.filter(question => privileged || question.qualityStatus === 'PUBLISHED');
    for (const key of ['subjectId', 'subItemId', 'type', 'qualityStatus', 'source']) if (req.query[key]) questions = questions.filter(question => String(question[key]) === String(req.query[key]));
    if (req.query.difficulty) questions = questions.filter(question => String(question.difficulty) === String(req.query.difficulty));
    if (req.query.keyword) { const keyword = text(req.query.keyword).toLowerCase(); questions = questions.filter(question => question.stem.toLowerCase().includes(keyword) || question.knowledge.toLowerCase().includes(keyword)); }
    send(res, questions.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).map(question => publicQuestion(question, privileged)));
  });
  app.post('/api/questions', auth, adminOnly, asyncRoute(async (req, res) => {
    const subject = store.data.subjects.find(item => item.id === req.body.subjectId);
    if (!subject) fail(404, '科目不存在', 'NOT_FOUND');
    const stem = text(req.body.stem, 5000); const answer = text(req.body.answer, 5000);
    if (!stem || !text(req.body.subItemId) || !text(req.body.type)) fail(400, '题干、科目、分项和题型必填', 'MISSING_FIELDS');
    const fullScore = Number(req.body.fullScore);
    if (!Number.isFinite(fullScore) || fullScore <= 0 || fullScore > subject.fullScore) fail(400, '题目分值必须大于 0 且不超过科目满分', 'INVALID_SCORE');
    const contentHash = crypto.createHash('sha256').update(stem.replace(/\s/g, '').toLowerCase()).digest('hex');
    const duplicate = store.data.questions.find(question => question.contentHash === contentHash);
    if (duplicate && !req.body.allowDuplicate) fail(409, '发现相同题干的试题，请合并、设为变式或确认保留', 'POSSIBLE_DUPLICATE', { duplicateId: duplicate.id, canonicalId: duplicate.canonicalId });
    const qualityStatus = req.body.qualityStatus === 'PUBLISHED' ? 'PUBLISHED' : 'DRAFT';
    if (qualityStatus === 'PUBLISHED' && (!answer || !text(req.body.copyrightStatus))) fail(400, '无答案或未确认版权的试题不能上架', 'QUALITY_GATE');
    const id = uid('question');
    await store.transaction(data => {
      data.questions.push({ id, canonicalId: req.body.canonicalId || uid('canon'), variantGroupId: req.body.variantGroupId || null, subjectId: subject.id, subItemId: text(req.body.subItemId), stem, options: Array.isArray(req.body.options) ? req.body.options.map(item => text(item, 500)) : [], answer, analysis: text(req.body.analysis, 5000), rubric: text(req.body.rubric || req.body.analysis, 5000), knowledge: text(req.body.knowledge, 100), type: text(req.body.type, 30), difficulty: Math.min(3, Math.max(1, Number(req.body.difficulty) || 1)), fullScore, source: text(req.body.source, 200), copyrightStatus: text(req.body.copyrightStatus || 'PENDING'), qualityStatus, version: 1, contentHash, reviewerId: qualityStatus === 'PUBLISHED' ? req.user.id : null, reviewedAt: qualityStatus === 'PUBLISHED' ? now() : null, createdAt: now(), updatedAt: now() });
      addAudit(data, req.user.id, 'QUESTION_CREATED', 'QUESTION', id, '管理员录入试题', null, { subjectId: subject.id, qualityStatus, contentHash });
    });
    send(res, store.data.questions.find(item => item.id === id), 201);
  }));
  app.patch('/api/questions/:id', auth, adminOnly, asyncRoute(async (req, res) => {
    const existing = store.data.questions.find(item => item.id === req.params.id);
    if (!existing) fail(404, '试题不存在', 'NOT_FOUND');
    if (req.body.version != null && Number(req.body.version) !== existing.version) fail(409, '试题已被他人修改，请刷新后再保存', 'CONCURRENT_MODIFICATION');
    const nextStatus = req.body.qualityStatus || existing.qualityStatus;
    if (nextStatus === 'PUBLISHED' && (!text(req.body.answer ?? existing.answer) || !Number(req.body.fullScore ?? existing.fullScore) || !text(req.body.copyrightStatus ?? existing.copyrightStatus) || (req.body.copyrightStatus ?? existing.copyrightStatus) === 'PENDING')) fail(400, '上架前必须补齐答案、分值并确认版权状态', 'QUALITY_GATE');
    await store.transaction(data => {
      const question = data.questions.find(item => item.id === existing.id);
      const before = { qualityStatus: question.qualityStatus, version: question.version };
      for (const key of ['stem', 'answer', 'analysis', 'rubric', 'knowledge', 'type', 'source', 'copyrightStatus', 'subItemId']) if (req.body[key] != null) question[key] = text(req.body[key], 5000);
      if (req.body.options != null) question.options = Array.isArray(req.body.options) ? req.body.options : [];
      if (req.body.difficulty != null) question.difficulty = Number(req.body.difficulty);
      if (req.body.fullScore != null) question.fullScore = Number(req.body.fullScore);
      question.qualityStatus = nextStatus;
      question.version += 1; question.updatedAt = now();
      if (nextStatus === 'PUBLISHED') { question.reviewerId = req.user.id; question.reviewedAt = now(); }
      addAudit(data, req.user.id, 'QUESTION_UPDATED', 'QUESTION', existing.id, text(req.body.reason || '试题校对/状态变更'), before, { qualityStatus: question.qualityStatus, version: question.version });
    });
    send(res, store.data.questions.find(item => item.id === existing.id));
  }));

  app.post('/api/practice/available', auth, (req, res) => {
    const userId = req.user.role === 'ADMIN' ? text(req.body.userId || req.user.id) : req.user.id;
    const questions = availableQuestions(store.data, userId, req.body);
    send(res, { count: questions.length, totalScore: questions.reduce((sum, question) => sum + Number(question.fullScore), 0), questions: questions.map(question => publicQuestion(question, req.user.role === 'ADMIN')) });
  });
  app.post('/api/practice/generate', auth, asyncRoute(async (req, res) => {
    const userId = req.user.role === 'ADMIN' ? text(req.body.userId) : req.user.id;
    if (req.user.role === 'ADMIN' && !userId) fail(400, '请选择练习所属学生', 'MISSING_USER');
    const student = store.data.users.find(user => user.id === userId && user.role === 'STUDENT');
    const subject = store.data.subjects.find(item => item.id === req.body.subjectId && item.status === 'ENABLED');
    if (!student || !subject) fail(404, '学生或科目不存在', 'NOT_FOUND');
    const count = Math.min(50, Math.max(1, Number(req.body.count) || 10));
    let batch;
    await store.transaction(data => {
      const candidates = availableQuestions(data, userId, req.body);
      if (candidates.length < count) fail(409, `当前还有 ${candidates.length} 道未导出题，距离所需 ${count} 道差 ${count - candidates.length} 道；可扩大分项或减少题量`, 'INSUFFICIENT_QUESTIONS', { available: candidates.length, requested: count, shortage: count - candidates.length });
      const selected = [...candidates].sort(() => Math.random() - 0.5).slice(0, count);
      batch = { id: uid('batch'), userId, subjectId: subject.id, filters: { subItemIds: req.body.subItemIds || [], type: req.body.type || null, difficulty: req.body.difficulty || null, count }, questionIds: selected.map(question => question.id), status: 'GENERATING', fileHash: null, downloadCount: 0, includeAnswers: false, createdAt: now(), createdBy: req.user.id };
      data.exports.push(batch);
      selected.forEach(question => {
        if (data.exportItems.some(item => item.userId === userId && item.canonicalId === question.canonicalId)) fail(409, '检测到并发导出冲突，请安全重试', 'CONCURRENT_EXPORT');
        data.exportItems.push({ id: uid('export_item'), exportId: batch.id, userId, questionId: question.id, canonicalId: question.canonicalId, variant: Boolean(question.variantGroupId), createdAt: now() });
      });
      addAudit(data, req.user.id, 'PAPER_EXPORT_REQUESTED', 'PAPER_EXPORT', batch.id, '生成不重复专项练习', null, { userId, subjectId: subject.id, count });
    });
    const questions = batch.questionIds.map(id => store.data.questions.find(question => question.id === id));
    const subItems = subject.subItems.filter(item => batch.filters.subItemIds.includes(item.id));
    const filePath = path.join(store.directory, 'exports', `${batch.id}.pdf`);
    try {
      await createPracticePdf({ filePath, student, subject, subItems, questions, batchId: batch.id });
      const fileHash = crypto.createHash('sha256').update(await fsPromises.readFile(filePath)).digest('hex');
      await store.transaction(data => {
        const target = data.exports.find(item => item.id === batch.id);
        target.status = 'SUCCESS'; target.fileHash = fileHash; target.completedAt = now();
        addAudit(data, req.user.id, 'PAPER_EXPORT_SUCCEEDED', 'PAPER_EXPORT', batch.id, 'PDF 生成成功');
      });
    } catch (error) {
      await store.transaction(data => {
        const target = data.exports.find(item => item.id === batch.id);
        target.status = 'FAILED'; target.error = 'PDF 生成失败，可重新生成'; target.completedAt = now();
        data.exportItems = data.exportItems.filter(item => item.exportId !== batch.id);
        addAudit(data, req.user.id, 'PAPER_EXPORT_FAILED', 'PAPER_EXPORT', batch.id, 'PDF 生成失败并释放题目占用');
      });
      fail(500, 'PDF 生成失败，题目占用已释放，请重试', 'PDF_GENERATION_FAILED');
    }
    send(res, { ...store.data.exports.find(item => item.id === batch.id), downloadUrl: `/api/practice/exports/${batch.id}/download` }, 201);
  }));
  app.get('/api/practice/exports', auth, (req, res) => {
    const records = store.data.exports.filter(item => req.user.role === 'ADMIN' || item.userId === req.user.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map(item => ({ ...item, user: publicUser(store.data.users.find(user => user.id === item.userId)), subject: store.data.subjects.find(subject => subject.id === item.subjectId) }));
    send(res, records);
  });
  app.get('/api/practice/exports/:id/download', auth, asyncRoute(async (req, res) => {
    const record = store.data.exports.find(item => item.id === req.params.id);
    if (!record || !ownsOrAdmin(req, record.userId)) fail(404, '导出记录不存在', 'NOT_FOUND');
    if (record.status !== 'SUCCESS') fail(409, '文件尚未生成成功', 'INVALID_STATE');
    const filePath = path.join(store.directory, 'exports', `${record.id}.pdf`);
    if (!fs.existsSync(filePath)) fail(404, '文件不存在，请重新生成', 'FILE_NOT_FOUND');
    await store.transaction(data => { data.exports.find(item => item.id === record.id).downloadCount += 1; });
    const subject = store.data.subjects.find(item => item.id === record.subjectId);
    res.download(filePath, `同窗进阶_${subject.name}_${record.id}.pdf`);
  }));

  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024, files: 12 }, fileFilter: (req, file, callback) => {
    const allowed = ['image/jpeg', 'image/png', 'application/pdf'];
    callback(allowed.includes(file.mimetype) ? null : new HttpError(400, '仅支持 JPG、PNG、PDF 文件', 'INVALID_FILE_TYPE'), allowed.includes(file.mimetype));
  } });
  app.post('/api/exams', auth, upload.array('files', 12), asyncRoute(async (req, res) => {
    const userId = req.user.role === 'ADMIN' ? text(req.body.userId) : req.user.id;
    const student = store.data.users.find(user => user.id === userId && user.role === 'STUDENT');
    const subject = store.data.subjects.find(item => item.id === req.body.subjectId && item.status === 'ENABLED');
    if (!student || !subject) fail(404, '学生或科目不存在', 'NOT_FOUND');
    if (!req.files?.length) fail(400, '请至少上传一页试卷', 'MISSING_FILE');
    if (!text(req.body.source) || !text(req.body.occurredAt)) fail(400, '成绩来源与作答日期必填', 'MISSING_SOURCE');
    for (const file of req.files) {
      const bytes = file.buffer;
      const validSignature = file.mimetype === 'application/pdf'
        ? bytes.subarray(0, 5).toString() === '%PDF-'
        : file.mimetype === 'image/png'
          ? bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex'))
          : bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
      if (!validSignature) fail(400, `「${file.originalname}」的真实文件内容与格式不符`, 'INVALID_FILE_SIGNATURE');
    }
    const id = uid('exam'); const savedFiles = [];
    for (const file of req.files) {
      const extension = file.mimetype === 'application/pdf' ? '.pdf' : file.mimetype === 'image/png' ? '.png' : '.jpg';
      const storedName = `${id}_${crypto.randomUUID()}${extension}`;
      await fsPromises.writeFile(path.join(store.directory, 'uploads', storedName), file.buffer);
      savedFiles.push({ storedName, originalName: file.originalname, size: file.size, mimeType: file.mimetype, sort: savedFiles.length + 1 });
    }
    await store.transaction(data => {
      data.exams.push({ id, userId, subjectId: subject.id, source: text(req.body.source, 40), occurredAt: text(req.body.occurredAt, 30), originalName: savedFiles[0].originalName, files: savedFiles, status: 'AWAITING_CONFIRMATION', version: 1, ocrText: '演示 OCR 已完成：请确认科目与页序。当前为本地模拟识别，不调用第三方模型。', aiModel: 'MOCK-OCR-1.0', promptVersion: 'demo-v1', aiSuggestedTotal: null, reviewedTotal: null, items: [], createdAt: now() });
      addAudit(data, req.user.id, 'PAPER_UPLOADED', 'EXAM', id, '上传试卷并完成模拟 OCR', null, { userId, subjectId: subject.id, fileCount: savedFiles.length });
    });
    send(res, publicExam(store.data.exams.find(item => item.id === id), req.user.role === 'ADMIN'), 201);
  }));
  app.get('/api/exams', auth, (req, res) => {
    const records = store.data.exams.filter(item => req.user.role === 'ADMIN' || item.userId === req.user.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map(exam => ({ ...publicExam(exam), user: publicUser(store.data.users.find(user => user.id === exam.userId)), subject: store.data.subjects.find(subject => subject.id === exam.subjectId) }));
    send(res, records);
  });
  app.get('/api/exams/:id', auth, (req, res) => {
    const exam = store.data.exams.find(item => item.id === req.params.id);
    if (!exam || !ownsOrAdmin(req, exam.userId)) fail(404, '试卷不存在或无权查看', 'NOT_FOUND');
    send(res, { ...publicExam(exam, req.user.role === 'ADMIN'), user: publicUser(store.data.users.find(user => user.id === exam.userId)), subject: store.data.subjects.find(subject => subject.id === exam.subjectId) });
  });
  app.get('/api/exams/:id/files/:fileIndex', auth, (req, res) => {
    const exam = store.data.exams.find(item => item.id === req.params.id);
    if (!exam || !ownsOrAdmin(req, exam.userId)) fail(404, '试卷文件不存在或无权查看', 'NOT_FOUND');
    const file = exam.files?.[Number(req.params.fileIndex)];
    if (!file) fail(404, '试卷页不存在', 'NOT_FOUND');
    res.setHeader('Cache-Control', 'private, no-store');
    res.sendFile(path.join(store.directory, 'uploads', file.storedName));
  });
  app.post('/api/exams/:id/confirm', auth, asyncRoute(async (req, res) => {
    const existing = store.data.exams.find(item => item.id === req.params.id);
    if (!existing || !ownsOrAdmin(req, existing.userId)) fail(404, '试卷不存在', 'NOT_FOUND');
    if (existing.status !== 'AWAITING_CONFIRMATION') fail(409, '当前状态不可重复确认', 'INVALID_STATE');
    await store.transaction(data => {
      const exam = data.exams.find(item => item.id === existing.id);
      const subject = data.subjects.find(item => item.id === exam.subjectId);
      const parts = [0.3, 0.3, 0.4].map(ratio => Math.round(subject.fullScore * ratio));
      parts[2] += subject.fullScore - parts.reduce((sum, value) => sum + value, 0);
      const suggestions = [0.9, 0.8, 0.8];
      exam.items = parts.map((fullScore, index) => ({ id: uid('exam_item'), number: String(index + 1), recognizedText: ['客观题作答已识别', '过程题步骤已识别', '部分字迹模糊，请核对'][index], standardAnswer: '请对照原卷与评分标准复核', fullScore, suggestedScore: Math.round(fullScore * suggestions[index]), reviewedScore: null, confidence: index === 2 ? 'LOW' : index === 1 ? 'MEDIUM' : 'HIGH', rationale: index === 2 ? '低置信结果，仅提供评分建议，须重点人工确认。' : '依据演示评分点生成建议，未复核不计入正式成绩。', reviewReason: '' }));
      exam.aiSuggestedTotal = exam.items.reduce((sum, item) => sum + item.suggestedScore, 0);
      exam.status = 'REVIEW_PENDING'; exam.aiModel = 'MOCK-GRADER-1.0'; exam.aiCompletedAt = now(); exam.version += 1;
      addAudit(data, req.user.id, 'OCR_CONFIRMED_AND_AI_GRADED', 'EXAM', exam.id, '学生确认页序，模拟 AI 初判完成');
    });
    send(res, publicExam(store.data.exams.find(item => item.id === existing.id), req.user.role === 'ADMIN'));
  }));
  app.post('/api/exams/:id/review', auth, adminOnly, asyncRoute(async (req, res) => {
    const existing = store.data.exams.find(item => item.id === req.params.id);
    if (!existing) fail(404, '试卷不存在', 'NOT_FOUND');
    if (existing.status !== 'REVIEW_PENDING') fail(409, '试卷已入账或状态已变化，请刷新', 'CONCURRENT_MODIFICATION');
    if (!Array.isArray(req.body.items) || !req.body.items.length) fail(400, '请逐题确认评分', 'MISSING_REVIEW');
    let assessmentId;
    await store.transaction(data => {
      const exam = data.exams.find(item => item.id === existing.id);
      if (exam.status !== 'REVIEW_PENDING') fail(409, '其他管理员已处理该试卷', 'CONCURRENT_MODIFICATION');
      const subject = data.subjects.find(item => item.id === exam.subjectId);
      const reviewedItems = exam.items.map(item => {
        const input = req.body.items.find(value => value.id === item.id);
        if (!input) fail(400, `请确认第 ${item.number} 题评分`, 'MISSING_REVIEW');
        let reviewedScore;
        try { reviewedScore = clampScore(input.reviewedScore, item.fullScore); } catch (error) { fail(400, `第 ${item.number} 题：${error.message}`, 'INVALID_SCORE'); }
        const changed = reviewedScore !== item.suggestedScore;
        if (changed && !text(input.reviewReason)) fail(400, `第 ${item.number} 题改分须填写理由`, 'MISSING_REASON');
        return { ...item, recognizedText: text(input.recognizedText ?? item.recognizedText, 5000), reviewedScore, reviewReason: text(input.reviewReason, 500), reviewerId: req.user.id, reviewedAt: now() };
      });
      const reviewedTotal = reviewedItems.reduce((sum, item) => sum + item.reviewedScore, 0);
      if (reviewedTotal > subject.fullScore) fail(400, '复核总分超过科目满分', 'INVALID_SCORE');
      assessmentId = uid('assessment');
      exam.items = reviewedItems; exam.reviewedTotal = reviewedTotal; exam.status = 'POSTED'; exam.reviewerId = req.user.id; exam.reviewedAt = now(); exam.reviewReason = text(req.body.reason, 500); exam.assessmentId = assessmentId; exam.version += 1;
      data.assessments.push({ id: assessmentId, userId: exam.userId, subjectId: exam.subjectId, subjectVersion: subject.version, score: reviewedTotal, fullScore: subject.fullScore, source: 'AI_REVIEW', kind: 'CURRENT', status: 'EFFECTIVE', occurredAt: new Date(exam.occurredAt).toISOString(), createdAt: now(), comparisonGroup: exam.source, reviewerId: req.user.id, note: exam.reviewReason || 'AI 建议经人工复核后入账', examId: exam.id });
      reviewedItems.filter(item => item.reviewedScore < item.fullScore).forEach((item, index) => {
        const question = data.questions.find(question => question.subjectId === exam.subjectId && question.qualityStatus === 'PUBLISHED');
        data.wrongQuestions.push({ id: uid('wrong'), userId: exam.userId, questionId: question?.id || null, examId: exam.id, examItemId: item.id, subjectId: exam.subjectId, lostScore: item.fullScore - item.reviewedScore, reason: item.reviewReason || item.rationale, masteryStatus: 'PENDING', createdAt: now() });
      });
      addAudit(data, req.user.id, 'AI_REVIEW_COMPLETED', 'EXAM', exam.id, exam.reviewReason || '逐题复核并原子入账', { aiSuggestedTotal: exam.aiSuggestedTotal }, { reviewedTotal, assessmentId });
    });
    send(res, { exam: publicExam(store.data.exams.find(item => item.id === existing.id), true), assessmentId });
  }));
  app.post('/api/exams/:id/reject', auth, adminOnly, asyncRoute(async (req, res) => {
    const existing = store.data.exams.find(item => item.id === req.params.id);
    if (!existing) fail(404, '试卷不存在', 'NOT_FOUND');
    if (!['REVIEW_PENDING', 'AWAITING_CONFIRMATION'].includes(existing.status)) fail(409, '当前状态不可驳回', 'INVALID_STATE');
    if (!text(req.body.reason)) fail(400, '请填写驳回原因与补图建议', 'MISSING_REASON');
    await store.transaction(data => {
      const exam = data.exams.find(item => item.id === existing.id);
      exam.status = 'REJECTED'; exam.rejectReason = text(req.body.reason, 500); exam.reviewerId = req.user.id; exam.reviewedAt = now(); exam.version += 1;
      addAudit(data, req.user.id, 'EXAM_REJECTED', 'EXAM', exam.id, exam.rejectReason);
    });
    send(res, publicExam(store.data.exams.find(item => item.id === existing.id), true));
  }));

  app.get('/api/wrong-questions', auth, (req, res) => {
    const records = store.data.wrongQuestions.filter(item => req.user.role === 'ADMIN' || item.userId === req.user.id).map(item => ({ ...item, question: publicQuestion(store.data.questions.find(question => question.id === item.questionId), req.user.role === 'ADMIN'), subject: store.data.subjects.find(subject => subject.id === item.subjectId) }));
    send(res, records);
  });
  app.get('/api/peer-wrong-questions', auth, (req, res) => {
    if (req.user.role !== 'STUDENT') fail(403, '请使用学生账号查看同伴错题', 'FORBIDDEN');
    const students = store.data.users.filter(user => user.role === 'STUDENT' && user.status === 'ACTIVE' && user.id !== req.user.id);
    const records = store.data.wrongQuestions
      .filter(item => students.some(student => student.id === item.userId))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map(item => {
        const helps = store.data.wrongHelps?.filter(help => help.wrongQuestionId === item.id) || [];
        return {
          id: item.id,
          ownerId: item.userId,
          owner: publicUser(store.data.users.find(user => user.id === item.userId)),
          subject: store.data.subjects.find(subject => subject.id === item.subjectId),
          question: publicQuestion(store.data.questions.find(question => question.id === item.questionId)),
          lostScore: item.lostScore,
          reason: item.reason,
          masteryStatus: item.masteryStatus,
          createdAt: item.createdAt,
          helpCount: helps.length,
          myHelpCount: helps.filter(help => help.helperId === req.user.id).length,
          recentHelps: helps.sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 3).map(help => ({ id: help.id, helper: publicUser(store.data.users.find(user => user.id === help.helperId)), content: help.content, inputMode: help.inputMode, flowerCount: help.flowers?.length || 0 }))
        };
      });
    send(res, records);
  });
  app.get('/api/wrong-helps', auth, (req, res) => {
    const records = (store.data.wrongHelps || [])
      .filter(help => req.user.role === 'ADMIN' || help.helperId === req.user.id || store.data.wrongQuestions.find(wrong => wrong.id === help.wrongQuestionId)?.userId === req.user.id)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map(help => {
        const wrong = store.data.wrongQuestions.find(item => item.id === help.wrongQuestionId);
        return {
          ...help,
          helper: publicUser(store.data.users.find(user => user.id === help.helperId)),
          wrong: wrong ? { id: wrong.id, ownerId: wrong.userId, owner: publicUser(store.data.users.find(user => user.id === wrong.userId)), subjectId: wrong.subjectId, lostScore: wrong.lostScore, reason: wrong.reason, question: publicQuestion(store.data.questions.find(question => question.id === wrong.questionId)), subject: store.data.subjects.find(subject => subject.id === wrong.subjectId) } : null,
          flowerCount: help.flowers?.length || 0,
          likedByMe: help.flowers?.some(flower => flower.userId === req.user.id) || false
        };
      });
    send(res, records);
  });
  app.post('/api/wrong-questions/:id/helps', auth, asyncRoute(async (req, res) => {
    if (req.user.role !== 'STUDENT') fail(403, '仅学生可帮助同伴', 'FORBIDDEN');
    const wrong = store.data.wrongQuestions.find(item => item.id === req.params.id);
    if (!wrong) fail(404, '错题不存在', 'NOT_FOUND');
    if (wrong.userId === req.user.id) fail(400, '不能给自己的错题提供帮助', 'INVALID_TARGET');
    const content = text(req.body.content, 1200);
    if (!content) fail(400, '请填写思路或解法', 'MISSING_FIELDS');
    const inputMode = req.body.inputMode === 'VOICE' ? 'VOICE' : 'TEXT';
    const id = uid('whelp');
    await store.transaction(data => {
      data.wrongHelps ||= [];
      data.wrongHelps.push({ id, wrongQuestionId: wrong.id, helperId: req.user.id, content, inputMode, flowers: [], createdAt: now() });
      addAudit(data, req.user.id, 'WRONG_HELP_SENT', 'WRONG_QUESTION', wrong.id, '同伴为错题提供思路', null, { inputMode });
    });
    send(res, store.data.wrongHelps.find(item => item.id === id), 201);
  }));
  app.post('/api/wrong-helps/:id/flowers', auth, asyncRoute(async (req, res) => {
    const help = store.data.wrongHelps?.find(item => item.id === req.params.id);
    const wrong = help && store.data.wrongQuestions.find(item => item.id === help.wrongQuestionId);
    if (!help || !wrong) fail(404, '帮助记录不存在', 'NOT_FOUND');
    if (wrong.userId !== req.user.id && req.user.role !== 'ADMIN') fail(403, '只有错题主人可以送小红花', 'FORBIDDEN');
    await store.transaction(data => {
      const target = data.wrongHelps.find(item => item.id === help.id);
      target.flowers ||= [];
      const index = target.flowers.findIndex(flower => flower.userId === req.user.id);
      if (index >= 0) target.flowers.splice(index, 1);
      else target.flowers.push({ userId: req.user.id, createdAt: now() });
      addAudit(data, req.user.id, index >= 0 ? 'WRONG_HELP_FLOWER_REMOVED' : 'WRONG_HELP_FLOWER_SENT', 'WRONG_HELP', target.id, index >= 0 ? '撤回小红花' : '向帮助自己的同伴送小红花');
    });
    const target = store.data.wrongHelps.find(item => item.id === help.id);
    send(res, { id: target.id, flowerCount: target.flowers.length, likedByMe: target.flowers.some(flower => flower.userId === req.user.id) });
  }));
  app.patch('/api/wrong-questions/:id', auth, asyncRoute(async (req, res) => {
    const existing = store.data.wrongQuestions.find(item => item.id === req.params.id);
    if (!existing || !ownsOrAdmin(req, existing.userId)) fail(404, '错题不存在', 'NOT_FOUND');
    await store.transaction(data => {
      const wrong = data.wrongQuestions.find(item => item.id === existing.id);
      if (req.body.reason != null) wrong.reason = text(req.body.reason, 300);
      if (['PENDING', 'RETRAINING', 'MASTERED'].includes(req.body.masteryStatus)) wrong.masteryStatus = req.body.masteryStatus;
      wrong.confirmedAt = now();
      addAudit(data, req.user.id, 'WRONG_QUESTION_CONFIRMED', 'WRONG_QUESTION', wrong.id, '学生确认错因与掌握状态');
    });
    send(res, store.data.wrongQuestions.find(item => item.id === existing.id));
  }));
  app.get('/api/help-requests', auth, (req, res) => {
    const records = store.data.helpRequests.filter(item => req.user.role === 'ADMIN' || item.fromUserId === req.user.id || item.toUserId === req.user.id).map(item => ({ ...item, fromUser: publicUser(store.data.users.find(user => user.id === item.fromUserId)), toUser: publicUser(store.data.users.find(user => user.id === item.toUserId)), subject: store.data.subjects.find(subject => subject.id === item.subjectId) }));
    send(res, records);
  });
  app.post('/api/help-requests', auth, asyncRoute(async (req, res) => {
    if (req.user.role !== 'STUDENT') fail(403, '仅学生可发起同伴互助', 'FORBIDDEN');
    if (!text(req.body.question) || !text(req.body.attempted)) fail(400, '请填写问题和已经尝试的方法', 'MISSING_FIELDS');
    const id = uid('help');
    await store.transaction(data => {
      data.helpRequests.push({ id, fromUserId: req.user.id, toUserId: text(req.body.toUserId), subjectId: text(req.body.subjectId), question: text(req.body.question, 1000), attempted: text(req.body.attempted, 1000), hintWanted: text(req.body.hintWanted, 1000), showQuestion: Boolean(req.body.showQuestion), status: 'OPEN', createdAt: now() });
      addAudit(data, req.user.id, 'HELP_REQUESTED', 'HELP_REQUEST', id, '发起结构化同伴互助');
    });
    send(res, store.data.helpRequests.find(item => item.id === id), 201);
  }));
  app.patch('/api/help-requests/:id', auth, asyncRoute(async (req, res) => {
    const existing = store.data.helpRequests.find(item => item.id === req.params.id);
    if (!existing || (existing.toUserId !== req.user.id && req.user.role !== 'ADMIN')) fail(404, '互助任务不存在或不可处理', 'NOT_FOUND');
    await store.transaction(data => {
      const help = data.helpRequests.find(item => item.id === existing.id);
      help.status = req.body.status === 'COMPLETED' ? 'COMPLETED' : req.body.status === 'IGNORED' ? 'IGNORED' : 'ACCEPTED';
      help.responseHint = text(req.body.responseHint, 1000); help.respondedAt = now();
      addAudit(data, req.user.id, 'HELP_RESPONDED', 'HELP_REQUEST', help.id, '同伴回应互助请求');
    });
    send(res, store.data.helpRequests.find(item => item.id === existing.id));
  }));

  app.get('/api/audit-logs', auth, adminOnly, (req, res) => {
    const logs = [...store.data.auditLogs].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 300).map(log => ({ ...log, actor: publicUser(store.data.users.find(user => user.id === log.actorId)) }));
    send(res, logs);
  });

  const dist = path.resolve(here, '../frontend/dist');
  if (fs.existsSync(dist)) {
    app.use(express.static(dist, {
      maxAge: '1h',
      setHeaders(res, filePath) {
        if (filePath.endsWith('index.html')) res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
      }
    }));
    app.get('*', (req, res, next) => {
      if (req.path.startsWith('/api/')) return next();
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
      return res.sendFile(path.join(dist, 'index.html'));
    });
  } else {
    app.get('/', (req, res) => res.json({ name: '同窗进阶 API', health: '/api/health', frontend: '请先运行 npm run build 或启动 Vite 开发服务' }));
  }

  app.use((req, res, next) => next(new HttpError(404, '请求的接口不存在', 'NOT_FOUND')));
  app.use((error, req, res, next) => {
    const status = error.status || (error instanceof multer.MulterError ? 400 : 500);
    const message = error instanceof multer.MulterError ? (error.code === 'LIMIT_FILE_SIZE' ? '单个文件不能超过 10 MB' : '上传文件不符合限制') : status === 500 ? '系统暂时无法处理，请稍后重试' : error.message;
    if (status === 500) console.error(`[${req.requestId}]`, error);
    res.status(status).json({ error: { code: error.code || 'INTERNAL_ERROR', message, details: error.details || null, requestId: req.requestId } });
  });
  return app;
}
