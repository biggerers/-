"""将内置演示评估的当前分同步为期中基准，不改写其他历史评估。"""
import json
import pathlib

path = pathlib.Path(__file__).resolve().parents[1] / 'data' / 'db.json'
with path.open(encoding='utf-8') as file:
    data = json.load(file)
targets = {(item['userId'], item['subjectId']): item['baselineScore'] for item in data['targets'] if item['status'] == 'ACTIVE'}
changed = []
for assessment in data['assessments']:
    if not assessment['id'].startswith('assessment_current_'):
        continue
    key = (assessment['userId'], assessment['subjectId'])
    if key in targets:
        assessment['score'] = targets[key]
        changed.append(assessment['id'])
temporary = path.with_suffix('.tmp')
with temporary.open('w', encoding='utf-8') as file:
    json.dump(data, file, ensure_ascii=False, indent=2)
temporary.replace(path)
print(f'已同步 {len(changed)} 条当前成绩记录')
