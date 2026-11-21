import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import { distributeSubItemScores } from './domain.js';

const passwordHash = password => bcrypt.hashSync(password, 10);
const hash = value => crypto.createHash('sha256').update(value).digest('hex');

const subjectSeed = [
  { id: 'sub_chinese', code: 'CHINESE', name: '语文', fullScore: 120, color: '#e98765', icon: 'BookOpen', subItems: [['基础', 20], ['名著', 10], ['文言文', 20], ['现代文 1', 20], ['现代文 2', 20], ['作文', 30]] },
  { id: 'sub_math', code: 'MATH', name: '数学', fullScore: 100, color: '#4d83cf', icon: 'Sigma', subItems: [['数与代数', 40], ['几何', 30], ['综合与实践', 30]] },
  { id: 'sub_english', code: 'ENGLISH', name: '英语', fullScore: 100, color: '#9a7bd0', icon: 'Languages', subItems: [['词汇与语法', 30], ['阅读', 40], ['写作', 30]] },
  { id: 'sub_physics', code: 'PHYSICS', name: '物理', fullScore: 70, color: '#24a397', icon: 'Atom', subItems: [['选择题', 20], ['实验探究', 20], ['计算与综合', 30]] }
].map((subject, subjectIndex) => ({
  ...subject,
  version: 1,
  status: 'ENABLED',
  sort: subjectIndex + 1,
  createdAt: '2026-09-01T08:00:00.000Z',
  subItems: subject.subItems.map(([name, fullScore], index) => ({ id: `${subject.id}_item_${index + 1}`, name, fullScore, sort: index + 1, status: 'ENABLED' }))
}));

const bank = {
  CHINESE: [
    ['下列词语中，书写完全正确的一项是？', ['A. 嘹亮  静密', 'B. 酝酿  吝啬', 'C. 决别  徘徊', 'D. 分岐  憔悴'], 'B', '“静谧、诀别、分歧”为正确书写。', '选择题'],
    ['下列句子没有语病的一项是？', ['A. 通过阅读，使我开阔了视野。', 'B. 我们要养成边读边思考。', 'C. 他的写作水平明显提高了。', 'D. 能否坚持，是成功的关键。'], 'C', 'A 缺主语，B 缺宾语，D 两面对一面。', '选择题'],
    ['《朝花夕拾》中，哪一篇回忆了童年时的保姆？', ['A.《从百草园到三味书屋》', 'B.《阿长与〈山海经〉》', 'C.《藤野先生》', 'D.《范爱农》'], 'B', '文章记叙了阿长为“我”买来《山海经》等往事。', '选择题'],
    ['解释“温故而知新”中“故”的意思，并写出这句话给你的学习启示。', [], '故：学过的知识。启示：复习旧知识可以获得新的理解与体会。', '解释词语 2 分，结合学习实际谈启示 2 分。', '简答题'],
    ['把“有朋自远方来，不亦乐乎？”翻译成现代汉语。', [], '有志同道合的朋友从远方来，不也很快乐吗？', '“朋”“自”“乐”翻译准确，语句通顺。', '翻译题'],
    ['阅读一段写人叙事文本后，概括主人公的品质，并找出两处依据。', [], '品质概括准确，文本依据与品质对应。', '品质 2 分，每处有效依据 2 分。', '阅读理解'],
    ['文章标题“那盏深夜的灯”有什么含义和作用？', [], '既指具体的灯，也象征关怀或希望；点明线索，寄托情感。', '表层含义、深层含义、结构作用各 2 分。', '阅读理解'],
    ['以“原来，答案在这里”为题，列出记叙文写作提纲，标出详写部分。', [], '中心明确，事件完整，详略得当，有真实细节。', '按立意、结构、细节和语言表达综合评分。', '作文'],
    ['补写：夕阳西下，________。（要求使用一种修辞，不少于 20 字）', [], '示例：夕阳西下，天边铺开一幅橘红色的油画，晚归的鸟鸣成了画中的音符。', '修辞恰当、语意连贯、符合字数要求。', '表达题'],
    ['简述事实论据与道理论据的区别，并各举一个学习主题的例子。', [], '事实论据用事实，道理论据用公认道理；例子与观点匹配。', '概念各 2 分，例子各 2 分。', '简答题'],
    ['同学练习失利，你会怎样安慰并鼓励他？写一段得体的话。', [], '先共情，再聚焦具体改进，不比较、不贴标签。', '语气得体、内容具体、表达清晰。', '表达题'],
    ['将“调查—发现—分析—建议”的研究性学习过程压缩为一句 40 字以内的说明。', [], '包含四个步骤，语言准确简洁。', '信息完整 3 分，语言简洁 2 分。', '简答题']
  ],
  MATH: [
    ['计算：(-3)² - 2 × |-4|。', ['A. 1', 'B. -1', 'C. 17', 'D. -17'], 'A', '9 - 8 = 1，注意乘方与绝对值的运算顺序。', '选择题'],
    ['若 x + 2y = 7，2x - y = 4，求 x、y。', [], 'x = 3，y = 2', '第一式乘 2 后相减得 5y=10，再回代。', '解答题'],
    ['一个等腰三角形的顶角为 40°，求两个底角。', [], '均为 70°', '三角形内角和 180°，底角=(180°-40°)/2。', '解答题'],
    ['化简：3(a - 2b) - 2(a + b)。', [], 'a - 8b', '去括号得 3a-6b-2a-2b，合并同类项。', '解答题'],
    ['在平面直角坐标系中，点 A(-2, 3) 关于 y 轴对称的点坐标是？', ['A. (2,3)', 'B. (-2,-3)', 'C. (2,-3)', 'D. (3,-2)'], 'A', '关于 y 轴对称，横坐标变号，纵坐标不变。', '选择题'],
    ['某商品原价 200 元，先降价 10%，再涨价 10%，现价为多少？', [], '198 元', '200×0.9×1.1=198，单位“1”发生变化。', '解答题'],
    ['已知直角三角形两直角边为 6 和 8，求斜边及面积。', [], '斜边 10，面积 24', '勾股定理求斜边，面积=6×8÷2。', '解答题'],
    ['一组数据 3、5、5、7、10 的平均数、中位数和众数分别是多少？', [], '平均数 6，中位数 5，众数 5', '总和 30 除以 5；排序后中间值为 5；5 出现最多。', '解答题'],
    ['解不等式 2x - 3 > 5，并在数轴上表示解集。', [], 'x > 4', '移项得 2x>8，系数为正，不等号方向不变。', '解答题'],
    ['如图类问题：两条平行线被第三条直线所截，一对同旁内角中一个为 65°，另一个为多少？', [], '115°', '两直线平行，同旁内角互补。', '填空题'],
    ['用配方法解方程 x² - 6x + 5 = 0。', [], 'x₁=1，x₂=5', '配方为 (x-3)²=4，或直接因式分解。', '解答题'],
    ['设计一个方案，测量教室旗杆的高度，说明所需数据和计算依据。', [], '可利用同一时间物体高度与影长成比例。', '方案可操作，数据明确，比例关系正确。', '综合题']
  ],
  ENGLISH: [
    ['Choose the correct form: Neither Tom nor his friends ____ interested in physics.', ['A. is', 'B. are', 'C. was', 'D. be'], 'B', 'neither…nor…遵循就近原则，friends 为复数。', '选择题'],
    ['Complete: I look forward to ____ from you soon.', ['A. hear', 'B. heard', 'C. hearing', 'D. hears'], 'C', 'look forward to 中 to 为介词，后接动名词。', '选择题'],
    ['Rewrite in passive voice: Students should protect old trees.', [], 'Old trees should be protected (by students).', '情态动词被动结构：should be + 过去分词。', '改写题'],
    ['Complete with a proper word: The more carefully you read, the ____ mistakes you will make.', [], 'fewer', 'mistakes 是可数名词复数，“the+比较级…the+比较级”。', '填空题'],
    ['Choose the best title for a passage about repairing old bikes for neighbours.', ['A. A Busy Shop', 'B. Small Repairs, Warm Hearts', 'C. How to Ride Fast', 'D. Buying a New Bike'], 'B', '标题同时概括修理行为与社区互助主旨。', '选择题'],
    ['Translate: 直到亲眼看见，他才意识到团队合作的重要性。', [], 'He didn’t realize the importance of teamwork until he saw it with his own eyes.', '使用 not…until…，时态一致。', '翻译题'],
    ['Write five sentences about a skill you learned from a friend.', [], '内容完整，时态准确，衔接自然，突出同伴帮助。', '内容 2 分，语言 2 分，结构 1 分。', '写作题'],
    ['Correct the sentence: She suggested to go to the museum by bus.', [], 'She suggested going to the museum by bus.', 'suggest 后接 doing，不接 to do。', '改错题'],
    ['Choose: Could you tell me ____?', ['A. where is the library', 'B. where the library is', 'C. the library is where', 'D. where does the library'], 'B', '宾语从句使用陈述语序。', '选择题'],
    ['Complete: The bridge ____ (build) two years ago.', [], 'was built', 'two years ago 用一般过去时，桥与建造是被动关系。', '填空题'],
    ['Read an advertisement and list two details you should check before joining an activity.', [], '可从时间、地点、费用、年龄要求、携带物品中任选两项。', '信息定位准确，每项 2 分。', '阅读理解'],
    ['Write a polite message asking a classmate for a hint instead of the final answer.', [], '示例：Could you give me a hint about the second step? I have tried… but…', '语气礼貌，说明已尝试的方法，明确只需要提示。', '写作题']
  ],
  PHYSICS: [
    ['下列现象中，属于光的反射的是？', ['A. 小孔成像', 'B. 水中倒影', 'C. 海市蜃楼', 'D. 筷子水中弯折'], 'B', '水中倒影由平面镜成像原理产生，属于反射。', '选择题'],
    ['一辆自行车 10 s 内匀速行驶 50 m，速度是多少？', [], '5 m/s', 'v=s/t=50m/10s=5m/s。', '计算题'],
    ['测量物体质量时，天平指针偏右，应怎样调节平衡螺母？', [], '测量前指针偏右，平衡螺母向左调；称量中不能调平衡螺母。', '调节方向正确，并区分测量前与称量中。', '实验题'],
    ['为什么冬天戴眼镜从室外进入室内，镜片会出现小水珠？', [], '室内水蒸气遇到较冷镜片液化放热，形成小水珠。', '指出水蒸气来源、液化和放热。', '简答题'],
    ['同种物质的质量与体积有什么关系？写出对应公式。', [], '质量与体积成正比，ρ=m/V。', '控制物质种类与状态，公式和物理量意义正确。', '填空题'],
    ['画出静止在水平桌面上茶杯所受力的示意图，并说明关系。', [], '重力与支持力大小相等、方向相反、作用在同一直线上。', '作用点、方向正确，二力平衡说明完整。', '作图题'],
    ['一个 2 kg 的物体体积为 0.002 m³，求密度。', [], '1.0×10³ kg/m³', 'ρ=m/V=2/0.002=1000 kg/m³。', '计算题'],
    ['探究凸透镜成像时，为什么要使烛焰、透镜和光屏中心大致等高？', [], '使像能成在光屏中央，便于观察与测量。', '回答围绕像的位置和实验操作。', '实验题'],
    ['用久了的白炽灯灯丝变细，从物态变化角度解释原因。', [], '钨丝在高温下升华，由固态直接变为气态。', '说明升华及初始、最终状态。', '简答题'],
    ['在“探究滑动摩擦力影响因素”实验中，为什么要匀速拉动木块？', [], '匀速时拉力与滑动摩擦力是一对平衡力，大小相等。', '二力平衡条件和测量原理完整。', '实验题'],
    ['声音不能在真空中传播。设计一个实验现象支持这一结论。', [], '真空铃实验：抽走罩内空气，铃声逐渐减弱。', '实验装置、操作和现象对应。', '实验题'],
    ['家中同时使用的用电器越多，干路电流通常如何变化？说明原因。', [], '用电器并联，数量增多时总电阻减小，电压不变，干路电流增大。', '连接方式、电阻和电流关系正确。', '简答题']
  ]
};

function makeQuestions() {
  return subjectSeed.flatMap(subject => bank[subject.code].map((entry, index) => {
    const isChoice = entry[3] === '选择题';
    const stem = entry[0]; const options = entry[1]; const answer = entry[2]; const analysis = entry[3];
    const type = isChoice ? '选择题' : (entry.length > 4 ? entry[4] : '解答题');
    return {
      id: `q_${subject.code.toLowerCase()}_${String(index + 1).padStart(2, '0')}`,
      canonicalId: `canon_${subject.code.toLowerCase()}_${String(index + 1).padStart(2, '0')}`,
      variantGroupId: null,
      subjectId: subject.id,
      subItemId: subject.subItems[index % subject.subItems.length].id,
      stem, options, answer, analysis, rubric: analysis,
      knowledge: subject.subItems[index % subject.subItems.length].name,
      type,
      difficulty: index % 3 + 1,
      fullScore: isChoice ? 3 : (type === '作文' ? 30 : 6),
      source: '小组原创演示题',
      copyrightStatus: 'ORIGINAL',
      qualityStatus: 'PUBLISHED',
      version: 1,
      contentHash: hash(stem),
      reviewerId: 'user_admin',
      reviewedAt: '2026-11-15T08:00:00.000Z',
      createdAt: '2026-11-10T08:00:00.000Z',
      updatedAt: '2026-11-15T08:00:00.000Z'
    };
  }));
}

function makeLearningData() {
  const students = [
    { id: 'user_wang', name: '王声与', baseline: [76.5, 91, 59.5, 55], current: [82, 94, 65, 58], target: [92.5, 100, 75.1, 65], previousGap: 50.6 },
    { id: 'user_zhang', name: '张轩翊', baseline: [77.5, 87, 83.9, 59], current: [84, 91, 87, 63], target: [95, 100, 92, 70], previousGap: 49.6 },
    { id: 'user_zhu', name: '朱墨', baseline: [93.5, 93, 87.25, 67], current: [96, 96, 88, 68], target: [100, 100, 90, 67], previousGap: 16.3 }
  ];
  const assessments = []; const targets = []; const snapshots = [];
  students.forEach(student => {
    subjectSeed.forEach((subject, index) => {
      assessments.push({
        id: `assessment_mid_${student.id}_${subject.code}`,
        userId: student.id, subjectId: subject.id, subjectVersion: 1,
        score: student.baseline[index], fullScore: subject.fullScore,
        subItemScores: distributeSubItemScores(subject, student.baseline[index]),
        source: 'MIDTERM', kind: 'BASELINE', status: 'EFFECTIVE',
        occurredAt: '2026-11-03T08:00:00.000Z', createdAt: '2026-11-04T08:00:00.000Z',
        comparisonGroup: '2026-autumn-midterm', reviewerId: 'user_admin', note: '期中复盘表转录，演示数据'
      });
      assessments.push({
        id: `assessment_current_${student.id}_${subject.code}`,
        userId: student.id, subjectId: subject.id, subjectVersion: 1,
        score: student.baseline[index], fullScore: subject.fullScore,
        subItemScores: distributeSubItemScores(subject, student.current[index] ?? student.baseline[index]),
        source: 'STAGE_EXAM', kind: 'CURRENT', status: 'EFFECTIVE',
        occurredAt: '2026-11-17T08:00:00.000Z', createdAt: '2026-11-18T08:00:00.000Z',
        comparisonGroup: '2026-autumn-stage', reviewerId: 'user_admin', note: '阶段练习，演示数据'
      });
      targets.push({
        id: `target_${student.id}_${subject.code}_v1`, userId: student.id, subjectId: subject.id,
        baselineAssessmentId: `assessment_mid_${student.id}_${subject.code}`,
        baselineScore: student.baseline[index], targetScore: student.target[index],
        subItemTargets: distributeSubItemScores(subject, student.target[index]),
        version: 1, effectiveAt: '2026-11-05T08:00:00.000Z', createdAt: '2026-11-05T08:00:00.000Z',
        reason: '2026—2027 学年第一学期期末目标', status: 'ACTIVE'
      });
    });
    const subjectGaps = Object.fromEntries(subjectSeed.map((subject, index) => [subject.id, Math.max(0, student.target[index] - student.baseline[index])]));
    snapshots.push({ id: `snapshot_${student.id}_last`, userId: student.id, weekStart: '2026-11-09', gap: student.previousGap, subjectGaps, closureCount: student.id === 'user_wang' ? 2 : 1, sealed: true, createdAt: '2026-11-15T13:00:00.000Z' });
  });
  return { assessments, targets, snapshots };
}

export function createSeedData() {
  const learning = makeLearningData();
  const questions = makeQuestions();
  return {
    schemaVersion: 1,
    group: { id: 'group_up03', name: 'UP·03 三人共学共同体', term: '2026—2027 学年第一学期', showAbsoluteScores: true, comparisonWindowDays: 31, snapshotTime: '周日 21:00', examWeekEnd: '2027-01-17', gapPlanStart: '2026-11-20', gapPlanWeeks: 9 },
    users: [
      { id: 'user_admin', groupId: 'group_up03', account: 'admin', displayName: '小组管理员', role: 'ADMIN', status: 'ACTIVE', passwordHash: passwordHash('Admin@2026'), avatarColor: '#173f5f', createdAt: '2026-09-01T08:00:00.000Z', lastLoginAt: null },
      { id: 'user_wang', groupId: 'group_up03', account: 'wangsy', displayName: '王声与', role: 'STUDENT', status: 'ACTIVE', passwordHash: passwordHash('1'), avatarColor: '#e88c65', createdAt: '2026-09-01T08:00:00.000Z', lastLoginAt: null, showAbsoluteScores: true },
      { id: 'user_zhang', groupId: 'group_up03', account: 'zhangxy', displayName: '张轩翊', role: 'STUDENT', status: 'ACTIVE', passwordHash: passwordHash('1'), avatarColor: '#4b83c9', createdAt: '2026-09-01T08:00:00.000Z', lastLoginAt: null, showAbsoluteScores: true },
      { id: 'user_zhu', groupId: 'group_up03', account: 'zhumo', displayName: '朱墨', role: 'STUDENT', status: 'ACTIVE', passwordHash: passwordHash('1'), avatarColor: '#24a397', createdAt: '2026-09-01T08:00:00.000Z', lastLoginAt: null, showAbsoluteScores: true }
    ],
    subjects: subjectSeed,
    ...learning,
    scoreRequests: [
      { id: 'request_demo_1', userId: 'user_zhang', subjectId: 'sub_english', requestedScore: 89, source: 'STAGE_EXAM', occurredAt: '2026-11-18', note: '阶段练习复核后申请更新', status: 'PENDING', version: 1, createdAt: '2026-11-18T10:00:00.000Z' }
    ],
    questions,
    exports: [],
    exportItems: [],
    exams: [
      {
        id: 'exam_demo_1', userId: 'user_wang', subjectId: 'sub_math', source: 'PRACTICE', occurredAt: '2026-11-18',
        originalName: '数学阶段练习_演示.pdf', files: [], status: 'REVIEW_PENDING', version: 1,
        ocrText: '演示 OCR：已识别 4 个题块，页序 1-2。', aiModel: 'MOCK-GRADER-1.0', promptVersion: 'demo-v1',
        aiSuggestedTotal: 86, reviewedTotal: null, createdAt: '2026-11-18T09:00:00.000Z',
        items: [
          { id: 'exam_item_1', number: '1', recognizedText: '计算准确，步骤完整', standardAnswer: '见评分标准', fullScore: 20, suggestedScore: 18, reviewedScore: null, confidence: 'HIGH', rationale: '结果正确，第二步书写不完整，建议扣 2 分。', reviewReason: '' },
          { id: 'exam_item_2', number: '2', recognizedText: 'x=3，y=2', standardAnswer: 'x=3，y=2', fullScore: 20, suggestedScore: 20, reviewedScore: null, confidence: 'HIGH', rationale: '答案与关键步骤一致。', reviewReason: '' },
          { id: 'exam_item_3', number: '3', recognizedText: '利用勾股定理求得斜边', standardAnswer: '斜边 10，面积 24', fullScore: 30, suggestedScore: 24, reviewedScore: null, confidence: 'MEDIUM', rationale: '斜边正确，面积过程缺失。', reviewReason: '' },
          { id: 'exam_item_4', number: '4', recognizedText: '解法可辨认，部分字迹模糊', standardAnswer: 'x₁=1，x₂=5', fullScore: 30, suggestedScore: 24, reviewedScore: null, confidence: 'LOW', rationale: '低置信识别，请重点核对原卷。', reviewReason: '' }
        ]
      }
    ],
    wrongQuestions: [
      { id: 'wrong_demo_1', userId: 'user_wang', questionId: 'q_math_07', subjectId: 'sub_math', lostScore: 6, reason: '过程表达不完整', masteryStatus: 'PENDING', createdAt: '2026-11-17T08:00:00.000Z' },
      { id: 'wrong_demo_2', userId: 'user_wang', questionId: 'q_chinese_06', subjectId: 'sub_chinese', lostScore: 4, reason: '文本依据不充分', masteryStatus: 'RETRAINING', createdAt: '2026-11-16T08:00:00.000Z' },
      { id: 'wrong_demo_3', userId: 'user_zhang', questionId: 'q_english_04', subjectId: 'sub_english', lostScore: 3, reason: '比较级用法混淆', masteryStatus: 'PENDING', createdAt: '2026-11-17T08:00:00.000Z' }
    ],
    wrongHelps: [
      { id: 'whelp_demo_1', wrongQuestionId: 'wrong_demo_1', helperId: 'user_zhang', content: '先把已知边和垂直关系都标出来，再找“公共边”或“中点”，从能证明的两个小三角形入手。', inputMode: 'TEXT', flowers: [{ userId: 'user_wang', createdAt: '2026-11-18T09:00:00.000Z' }], createdAt: '2026-11-18T09:00:00.000Z' },
      { id: 'whelp_demo_2', wrongQuestionId: 'wrong_demo_2', helperId: 'user_zhu', content: '先回到原文找关键词，不要凭印象补结论；答案最好带上段落依据。', inputMode: 'VOICE', flowers: [], createdAt: '2026-11-18T10:00:00.000Z' }
    ],
    helpRequests: [
      { id: 'help_demo_1', fromUserId: 'user_wang', toUserId: 'user_zhu', subjectId: 'sub_math', question: '几何综合题怎样找到辅助线？', attempted: '已经标出已知边和角，并尝试连接两个中点。', hintWanted: '希望得到一个观察方向的提示，不需要完整答案。', showQuestion: true, status: 'OPEN', createdAt: '2026-11-18T08:00:00.000Z' }
    ],
    auditLogs: [
      { id: 'audit_seed', actorId: 'user_admin', action: 'SYSTEM_INITIALIZED', entityType: 'GROUP', entityId: 'group_up03', reason: '初始化演示环境', createdAt: '2026-11-19T08:00:00.000Z' }
    ]
  };
}
