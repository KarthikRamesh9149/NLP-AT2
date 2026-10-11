"""Verify retained review inputs and recompute counts without provider calls."""
from pathlib import Path
import hashlib
import json
import re

ROOT = Path(__file__).resolve().parent
REPO = ROOT.parents[1] / 'formbridge'
if not REPO.exists():
    REPO = ROOT.parents[1]
audit = json.loads((ROOT / 'feature-audit.json').read_text())
prediction_path = REPO / audit['predictionFile']
assert hashlib.sha256(prediction_path.read_bytes()).hexdigest() == audit['predictionSha256']
predictions = {r['id']: r['predictions']['formbridge']['brief']['fields']
               for r in json.loads(prediction_path.read_text())['results']}
browser = {r['id']: r for r in json.loads((REPO / 'evaluation/results/browser-use-35-final.json').read_text())['cases']}
cases = {r['id']: r for r in json.loads((REPO / 'evaluation/browser-cases-35.json').read_text())['cases']}
fields = []
for row in audit['sourceReviews']:
    prefix = {m['id']: m for m in row['visibleMessages']}
    for f in row['fields']:
        original = predictions[row['id']][f['field']]
        assert f['value'] == original['value'] and f['evidenceIds'] == original['evidenceIds']
        assert f['status'] == original['status']
        assert f['citedMessages'] == [prefix[id] for id in f['evidenceIds']]
        assert bool(f['rationale']) and f['label'] in ['supported', 'ambiguous', 'unsupported', 'omitted']
        assert (f['label'] == 'omitted') == (f['value'] is None)
        if f['value'] is not None:
            assert f['evidenceIds']
        if f['field'] == 'date' and f['value'] is not None:
            assert not re.search(r'\b\d{4}\b', f['value']) and f['status'] == 'needs_clarification'
        fields.append(f)
questions = audit['clarificationReviews']
for q in questions:
    assert q['transcript'] == cases[q['id']]['transcript']
    assert q['actualQuestion'] == browser[q['id']]['actual']['clarification']
counts = {
    'dialogues': len(audit['sourceReviews']), 'fieldPositions': len(fields),
    'nonemptyValues': sum(f['value'] is not None for f in fields),
    'supportedValues': sum(f['label'] == 'supported' for f in fields),
    'ambiguousSupport': sum(f['label'] == 'ambiguous' for f in fields),
    'omissions': sum(f['label'] == 'omitted' for f in fields),
    'clearlyUnsupportedValues': sum(f['label'] == 'unsupported' for f in fields),
    'citationReferences': sum(len(f['evidenceIds']) for f in fields),
    'yearMissingDatesRetainedAsUnresolved': sum(f['field'] == 'date' and f['value'] is not None and f['status'] == 'needs_clarification' for f in fields),
    'questionsReviewed': len(questions), 'appropriateQuestions': sum(q['appropriate'] for q in questions),
}
assert counts == audit['summary'], (counts, audit['summary'])
print(json.dumps(counts, indent=2))
print('Inputs and counts verified. Semantic review labels require independent reassessment; this script does not establish their truth.')
