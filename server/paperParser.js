import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const standardFontDataUrl = path.join(here, '../node_modules/pdfjs-dist/standard_fonts/') + path.sep;

const normalize = value => String(value ?? '').replace(/\s+/g, ' ').trim();
const num = value => Number(String(value ?? '').match(/\d+(?:\.\d+)?/)?.[0] ?? NaN);

export async function extractPdfText(buffer) {
  const document = await pdfjs.getDocument({
    data: new Uint8Array(buffer),
    isEvalSupported: false,
    useSystemFonts: false,
    disableFontFace: true,
    standardFontDataUrl
  }).promise;
  const pageLines = [];
  for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
    const page = await document.getPage(pageNumber);
    const content = await page.getTextContent();
    const words = [];
    for (const item of content.items) {
      if (!item.str?.trim()) continue;
      words.push({ x: Number(item.transform[4] || 0), y: Number(item.transform[5] || 0), value: item.str });
    }
    words.sort((a, b) => b.y - a.y || a.x - b.x);
    let line = []; let baseline = null;
    const flush = () => {
      const value = line.map(item => item.value.trim()).filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
      if (value && !/^(?:第\s*\d+\s*页(?:\s*\/\s*\d+\s*页)?|Page\s*\d+(?:\s*\/\s*\d+)?)$/i.test(value)) pageLines.push(value);
      line = []; baseline = null;
    };
    for (const word of words) {
      if (baseline !== null && Math.abs(word.y - baseline) > 3) flush();
      line.push(word); baseline = baseline === null ? word.y : baseline;
    }
    flush();
    page.cleanup();
  }
  const result = { text: pageLines.join('\n'), pageCount: document.numPages };
  document.destroy();
  return result;
}

function detectType(value) {
  const content = normalize(value);
  if (/作文|书面表达|写作/.test(content)) return '作文';
  if (/阅读理解|阅读下面|阅读下列|完形填空/.test(content)) return '阅读理解';
  if (/实验|探究/.test(content)) return '实验题';
  if (/选择题|单项选择|多项选择|选择/.test(content)) return '选择题';
  if (/填空题|填空/.test(content)) return '填空题';
  if (/简答题|简述|说明理由/.test(content)) return '简答题';
  if (/解答题|计算题|应用题|综合题|解答|计算/.test(content)) return '解答题';
  return '解答题';
}

function subItemMatchers(subject) {
  const byName = subject.subItems.map(item => ({ id: item.id, name: item.name }));
  const direct = key => byName.find(item => normalize(item.name).includes(key) || key.includes(normalize(item.name)));
  const from = patterns => patterns.map(([key, matcher]) => {
    const found = direct(key);
    return found && { id: found.id, matcher };
  }).filter(Boolean);
  if (subject.code === 'CHINESE') return from([['基础', /基础|积累|语言运用|运用/], ['名著', /名著|文学常识/], ['文言文', /文言|古诗文|古诗词|默写/], ['现代文 2', /现代文\s*2/], ['现代文 1', /现代文|阅读/], ['作文', /作文|写作/]]);
  if (subject.code === 'MATH') return from([['数与代数', /数与代数|代数|方程|不等式|函数|概率|统计/], ['几何', /几何|图形|三角形|四边形|圆|相似|对称/], ['综合与实践', /综合|实践|应用|方案/]]);
  if (subject.code === 'ENGLISH') return from([['词汇与语法', /词汇|语法|完形|单项选择|选择/], ['阅读', /阅读理解|阅读/], ['写作', /书面表达|作文|写作/]]);
  if (subject.code === 'PHYSICS') return from([['选择题', /选择题|单项选择|选择/], ['实验探究', /实验|探究/], ['计算与综合', /计算|综合|应用|解答/]]);
  return [];
}

function classifySubItem(subject, sectionTitle, questionText) {
  const matchers = subItemMatchers(subject);
  const match = value => matchers.find(({ matcher }) => matcher.test(normalize(value)))?.id;
  return match(sectionTitle) || match(questionText) || subject.subItems[0]?.id || '';
}

function detectScore(sectionTitle, questionText, subject) {
  const candidates = [
    questionText.match(/(?:^|[\s（(])\(?(\d+(?:\.\d+)?)\s*分\)?(?=$|[\s，,。])/),
    questionText.match(/(?:本题|该题)[满分：:]*\s*(\d+(?:\.\d+)?)/),
    sectionTitle.match(/每小题|每题|每空[^\n]*?(\d+(?:\.\d+)?)\s*分/),
    sectionTitle.match(/每小题|每题|每空[^。]*?(\d+(?:\.\d+)?)\s*分/),
    sectionTitle.match(/满分[：:]?\s*(\d+(?:\.\d+)?)/)
  ].map(item => num(item?.[1])).filter(Number.isFinite);
  const value = candidates.find(item => item > 0) || 3;
  return Math.min(subject.fullScore, Math.max(0.5, value));
}

function parseOptions(value) {
  const content = normalize(value);
  const positions = [...content.matchAll(/(?:^|\s)([A-F])\s*[．.、)）]\s*/g)];
  if (positions.length < 2 || positions[0][1] !== 'A') return { stem: content, options: [] };
  const stem = content.slice(0, positions[0].index).trim();
  const options = positions.map((match, index) => {
    const start = match.index + match[0].length;
    const end = index + 1 < positions.length ? positions[index + 1].index : content.length;
    return `${match[1]}. ${content.slice(start, end).trim()}`;
  }).filter(item => item.length > 3);
  return { stem: stem || content, options: options.length >= 2 ? options : [] };
}

function parseAnswerKey(text) {
  const boundary = text.match(/(^|\n)\s*(?:参考答案|试题答案|答案\s*[:：]|Answer\s*key\s*[:：])/i);
  if (!boundary) return { text: text, answers: new Map() };
  const keyText = text.slice(boundary.index + boundary[0].length);
  const answers = new Map();
  const pattern = /(\d{1,3})\s*[．.、)）]\s*([\s\S]*?)(?=\s*\d{1,3}\s*[．.、)）]|$)/g;
  for (const [, number, value] of keyText.matchAll(pattern)) {
    const content = normalize(value).slice(0, 3000);
    if (content) answers.set(Number(number), content);
  }
  return { text: text.slice(0, boundary.index), answers };
}

const sectionRegex = /^\s*(?:([一二三四五六七八九十]{1,2}|\d{1,2})\s*[、.．]\s*)?([^。：:]{0,28}?(?:选择题|填空题|解答题|简答题|阅读理解|现代文阅读|文言文阅读|古诗文阅读|名著阅读|实验探究|实验题|计算题|综合题|综合与实践|书面表达|作文|语言运用|积累与运用|词汇与语法))[^。]{0,35}$/;
const questionRegex = /^\s*(\d{1,3})\s*[．.、)）]\s*/;

export function splitPaperQuestions(text) {
  const lines = text.split(/\n+/).map(normalize).filter(Boolean);
  const blocks = []; let sectionTitle = ''; let current = null;
  const flush = () => { if (current) blocks.push(current); current = null; };
  for (const line of lines) {
    const section = line.match(sectionRegex);
    if (section) {
      flush(); sectionTitle = line; continue;
    }
    const question = line.match(questionRegex);
    if (question) {
      flush(); current = { number: Number(question[1]), sectionTitle, text: line.replace(questionRegex, '').trim() };
      continue;
    }
    if (current) current.text += `\n${line}`;
    else if (/^[一二三四五六七八九十]\s*[、.．]/.test(line) || /^(?:第\s*[IⅡ二一二三四五六七八九十]+\s*卷|注意事项)/.test(line)) sectionTitle = line;
  }
  flush();
  return blocks.filter(block => normalize(block.text).length >= 4);
}

export function classifyPaperQuestions({ text, subject, source, copyrightStatus = 'PENDING' }) {
  const { text: paperText, answers } = parseAnswerKey(text);
  const blocks = splitPaperQuestions(paperText);
  const title = normalize(paperText.split(/\n+/)[0] || source || 'PDF 试卷').slice(0, 80);
  const defaultSource = normalize(source || title || 'PDF 试卷').slice(0, 120);
  return blocks.map(block => {
    const content = normalize(block.text);
    const optionsResult = parseOptions(content);
    const type = detectType(`${block.sectionTitle} ${content}`);
    return {
      subjectId: subject.id,
      subItemId: classifySubItem(subject, block.sectionTitle, content),
      stem: optionsResult.stem.slice(0, 5000),
      options: optionsResult.options,
      answer: answers.get(block.number) || '',
      analysis: '',
      knowledge: '',
      type,
      difficulty: type === '解答题' || type === '作文' ? 2 : 1,
      fullScore: detectScore(block.sectionTitle, content, subject),
      source: defaultSource,
      copyrightStatus
    };
  });
}

export async function parsePaperPdf(buffer, { subject, source, copyrightStatus } = {}) {
  const { text, pageCount } = await extractPdfText(buffer);
  const questions = classifyPaperQuestions({ text, subject, source, copyrightStatus });
  return { pageCount, textLength: text.replace(/\s/g, '').length, questions };
}
