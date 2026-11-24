import bcrypt from 'bcryptjs';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createSeedData } from './seed.js';
import { round1, distributeSubItemScores } from './domain.js';

const here = path.dirname(fileURLToPath(import.meta.url));
export const uid = prefix => `${prefix}_${crypto.randomUUID().replaceAll('-', '').slice(0, 16)}`;
export const now = () => new Date().toISOString();

export class Store {
  constructor(directory) {
    this.directory = directory || process.env.DATA_DIR || path.resolve(here, '../data');
    this.file = path.join(this.directory, 'db.json');
    this.data = null;
    this.queue = Promise.resolve();
  }

  async init() {
    await fs.mkdir(this.directory, { recursive: true });
    await fs.mkdir(path.join(this.directory, 'uploads'), { recursive: true });
    await fs.mkdir(path.join(this.directory, 'exports'), { recursive: true });
    try {
      this.data = JSON.parse(await fs.readFile(this.file, 'utf8'));
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      this.data = createSeedData();
      await this.persist(this.data);
    }
    if (!this.data.group.examWeekEnd) {
      this.data.group.examWeekEnd = '2027-01-17';
      await this.persist(this.data);
    }
    if (!this.data.group.gapPlanStart || !this.data.group.gapPlanWeeks) {
      this.data.group.gapPlanStart = this.data.group.gapPlanStart || '2026-11-20';
      this.data.group.gapPlanWeeks = this.data.group.gapPlanWeeks || 9;
      await this.persist(this.data);
    }
    if (!this.data.migrations?.weeklyPointsCollections) {
      this.data.weeklyPlans ||= [];
      this.data.pointRequests ||= [];
      this.data.migrations = { ...(this.data.migrations || {}), weeklyPointsCollections: '2026-11-21' };
      await this.persist(this.data);
    }
    if (!this.data.migrations?.tasksCollections) {
      this.data.tasks ||= [];
      this.data.taskStatuses ||= [];
      this.data.migrations = { ...(this.data.migrations || {}), tasksCollections: '2026-11-22' };
      await this.persist(this.data);
    }
    if (!this.data.migrations?.weeklyGapBaseline) {
      const targets = new Map(this.data.targets.filter(item => item.status === 'ACTIVE').map(item => [`${item.userId}:${item.subjectId}`, item]));
      const currentScores = new Map();
      this.data.assessments
        .filter(item => item.status === 'EFFECTIVE' && item.kind !== 'BASELINE')
        .sort((a, b) => new Date(b.occurredAt) - new Date(a.occurredAt) || new Date(b.createdAt) - new Date(a.createdAt))
        .forEach(item => { const key = `${item.userId}:${item.subjectId}`; if (!currentScores.has(key)) currentScores.set(key, item); });
      this.data.snapshots
        .filter(snapshot => snapshot.id?.startsWith('snapshot_') && snapshot.weekStart === '2026-11-09')
        .forEach(snapshot => {
          const subjectGaps = {}; let gap = 0;
          this.data.subjects.forEach(subject => {
            const target = targets.get(`${snapshot.userId}:${subject.id}`);
            const current = currentScores.get(`${snapshot.userId}:${subject.id}`);
            if (!target || !current) return;
            const subjectGap = Math.max(0, Number(target.targetScore) - Number(current.score));
            subjectGaps[subject.id] = round1(subjectGap);
            gap += subjectGap;
          });
          snapshot.subjectGaps = subjectGaps;
          snapshot.gap = round1(gap);
        });
      this.data.migrations = { ...(this.data.migrations || {}), weeklyGapBaseline: '2026-11-20' };
      await this.persist(this.data);
    }
    if (!this.data.migrations?.wangEnglishBaseline59p5) {
      const target = this.data.targets.find(item => item.userId === 'user_wang' && item.subjectId === 'sub_english' && item.status === 'ACTIVE');
      if (target && Number(target.baselineScore) === 59.1) {
        target.baselineScore = 59.5;
        const assessment = this.data.assessments.find(item => item.id === target.baselineAssessmentId);
        if (assessment) assessment.score = 59.5;
        await this.persist(this.data);
      }
      this.data.migrations = { ...(this.data.migrations || {}), wangEnglishBaseline59p5: '2026-11-20' };
      await this.persist(this.data);
    }
    if (!this.data.migrations?.zhangChineseBaseline77p5) {
      const target = this.data.targets.find(item => item.userId === 'user_zhang' && item.subjectId === 'sub_chinese' && item.status === 'ACTIVE');
      if (target && Number(target.baselineScore) === 77) {
        target.baselineScore = 77.5;
        const assessment = this.data.assessments.find(item => item.id === target.baselineAssessmentId);
        if (assessment) assessment.score = 77.5;
      }
      this.data.migrations = { ...(this.data.migrations || {}), zhangChineseBaseline77p5: '2026-11-20' };
      await this.persist(this.data);
    }
    if (!this.data.migrations?.subItemScoresInitialized) {
      const subjectMap = new Map(this.data.subjects.map(subject => [subject.id, subject]));
      this.data.assessments.forEach(assessment => {
        if (assessment.subItemScores) return;
        const subject = subjectMap.get(assessment.subjectId);
        if (!subject || assessment.score == null) return;
        assessment.subItemScores = distributeSubItemScores(subject, assessment.score);
      });
      this.data.targets.forEach(target => {
        if (target.subItemTargets) return;
        const subject = subjectMap.get(target.subjectId);
        if (!subject || target.targetScore == null) return;
        target.subItemTargets = distributeSubItemScores(subject, target.targetScore);
      });
      this.data.migrations = { ...(this.data.migrations || {}), subItemScoresInitialized: '2026-11-20' };
      await this.persist(this.data);
    }
    if (!this.data.migrations?.studentPasswordsReset1) {
      const hash = bcrypt.hashSync('1', 10);
      this.data.users.filter(user => user.role === 'STUDENT' && user.status === 'ACTIVE').forEach(user => { user.passwordHash = hash; });
      this.data.migrations = { ...(this.data.migrations || {}), studentPasswordsReset1: '2026-11-20' };
      await this.persist(this.data);
    }
    if (!this.data.migrations?.baselineAdjustedSnapshotSync20261120) {
      const targets = new Map(this.data.targets.filter(item => item.status === 'ACTIVE').map(item => [`${item.userId}:${item.subjectId}`, item]));
      const currentScores = new Map();
      this.data.assessments
        .filter(item => item.status === 'EFFECTIVE' && item.kind !== 'BASELINE')
        .sort((a, b) => new Date(b.occurredAt) - new Date(a.occurredAt) || new Date(b.createdAt) - new Date(a.createdAt))
        .forEach(item => { const key = `${item.userId}:${item.subjectId}`; if (!currentScores.has(key)) currentScores.set(key, item); });
      this.data.snapshots
        .filter(snapshot => snapshot.id?.startsWith('snapshot_') && snapshot.weekStart === '2026-11-09')
        .forEach(snapshot => {
          const subjectGaps = {}; let gap = 0;
          this.data.subjects.forEach(subject => {
            const target = targets.get(`${snapshot.userId}:${subject.id}`);
            const current = currentScores.get(`${snapshot.userId}:${subject.id}`);
            if (!target || !current) return;
            const subjectGap = Math.max(0, Number(target.targetScore) - Number(current.score));
            subjectGaps[subject.id] = round1(subjectGap);
            gap += subjectGap;
          });
          snapshot.subjectGaps = subjectGaps;
          snapshot.gap = round1(gap);
        });
      this.data.migrations = { ...(this.data.migrations || {}), baselineAdjustedSnapshotSync20261120: '2026-11-20' };
      await this.persist(this.data);
    }
    return this;
  }

  async persist(data) {
    const temporary = `${this.file}.${process.pid}.tmp`;
    await fs.writeFile(temporary, JSON.stringify(data, null, 2), 'utf8');
    await fs.rename(temporary, this.file);
  }

  async transaction(mutator) {
    const operation = this.queue.catch(() => {}).then(async () => {
      const draft = structuredClone(this.data);
      const result = await mutator(draft);
      await this.persist(draft);
      this.data = draft;
      return result;
    });
    this.queue = operation;
    return operation;
  }
}
