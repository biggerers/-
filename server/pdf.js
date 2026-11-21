import fs from 'node:fs';
import path from 'node:path';
import PDFDocument from 'pdfkit';

function findChineseFont() {
  const candidates = [
    process.env.PDF_FONT,
    'C:/Windows/Fonts/msyh.ttc',
    'C:/Windows/Fonts/simhei.ttf',
    'C:/Windows/Fonts/simsun.ttc',
    '/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc',
    '/usr/share/fonts/truetype/wqy/wqy-microhei.ttc'
  ].filter(Boolean);
  return candidates.find(candidate => fs.existsSync(candidate));
}

export function createPracticePdf({ filePath, student, subject, subItems, questions, batchId, includeAnswers = false }) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margins: { top: 52, bottom: 56, left: 52, right: 52 }, info: { Title: `同窗进阶 · ${subject.name}专项练习`, Author: '同窗进阶' } });
    const stream = fs.createWriteStream(filePath);
    stream.on('finish', () => resolve(filePath));
    stream.on('error', reject);
    doc.on('error', reject);
    doc.pipe(stream);
    const font = findChineseFont();
    if (font) {
      try { doc.font(font); } catch { doc.font('Helvetica'); }
    }

    doc.fillColor('#0b8f87').fontSize(11).text('UP·03  同窗进阶', { continued: false });
    doc.moveDown(0.5).fillColor('#132c4c').fontSize(23).text(`${subject.name} · 个性化专项练习`);
    doc.moveDown(0.35).fillColor('#66758a').fontSize(10).text(`学生：${student.displayName}    批次：${batchId}`);
    doc.text(`范围：${subItems?.length ? subItems.map(item => item.name).join('、') : '整科综合'}    生成时间：${new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}`);
    const total = questions.reduce((sum, question) => sum + Number(question.fullScore), 0);
    doc.text(`题量：${questions.length} 道    总分：${total} 分    建议用时：${Math.max(20, questions.length * 5)} 分钟`);
    doc.moveDown(0.8).strokeColor('#dfe6ed').lineWidth(1).moveTo(52, doc.y).lineTo(543, doc.y).stroke();
    doc.moveDown(0.8).fillColor('#66758a').fontSize(9).text('请独立完成，写出必要过程。AI 评分建议须经管理员复核后才会更新正式成绩。');
    doc.moveDown(1.2);

    questions.forEach((question, index) => {
      if (doc.y > 690) doc.addPage();
      const startY = doc.y;
      doc.fillColor('#132c4c').fontSize(12).text(`${index + 1}. ${question.stem}  （${question.fullScore} 分）`, { width: 490, lineGap: 4 });
      if (question.options?.length) {
        doc.moveDown(0.3).fillColor('#1c2b3f').fontSize(10).text(question.options.join('    '), { indent: 14, width: 475, lineGap: 4 });
      }
      const answerLines = question.type === '解答题' || question.type === '作文' ? 5 : 2;
      doc.moveDown(0.6);
      for (let line = 0; line < answerLines; line += 1) {
        if (doc.y > 735) doc.addPage();
        doc.strokeColor('#e7edf1').moveTo(66, doc.y + 11).lineTo(530, doc.y + 11).stroke();
        doc.moveDown(0.85);
      }
      doc.moveDown(0.55);
      if (doc.y === startY) doc.moveDown(1);
    });

    if (includeAnswers) {
      doc.addPage();
      doc.fillColor('#132c4c').fontSize(20).text('参考答案与解析 · 管理员版');
      doc.moveDown(0.5).fillColor('#c65353').fontSize(9).text('此页包含答案，请勿与学生版练习同时发放。');
      doc.moveDown(1);
      questions.forEach((question, index) => {
        if (doc.y > 680) doc.addPage();
        doc.fillColor('#0b8f87').fontSize(11).text(`${index + 1}. 答案：${question.answer}`);
        doc.moveDown(0.25).fillColor('#1c2b3f').fontSize(9).text(`解析：${question.analysis || question.rubric || '请按评分标准复核。'}`, { lineGap: 3 });
        doc.moveDown(0.8);
      });
    }

    const pageRange = doc.bufferedPageRange();
    for (let index = pageRange.start; index < pageRange.start + pageRange.count; index += 1) {
      doc.switchToPage(index);
      doc.fillColor('#84909e').fontSize(8).text(`同窗进阶 · 仅供小组学习使用`, 52, 810, { width: 250, lineBreak: false });
      doc.text(`${index + 1} / ${pageRange.count}`, 470, 810, { width: 70, align: 'right', lineBreak: false });
    }
    doc.end();
  });
}
