# -*- coding: utf-8 -*-
"""Dump tool_use + following tool_result (truncated) in order from a session jsonl."""
import json, sys, io

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

path = sys.argv[1]
limit = int(sys.argv[2]) if len(sys.argv) > 2 else 900
lines = open(path, encoding='utf-8').readlines()
pending = {}  # tool_use_id -> (line_idx, name, input)
for i, line in enumerate(lines):
    try:
        obj = json.loads(line)
    except Exception:
        continue
    t = obj.get('type', '')
    msg = obj.get('message', {})
    content = msg.get('content')
    if t == 'assistant' and isinstance(content, list):
        for c in content:
            if isinstance(c, dict) and c.get('type') == 'tool_use':
                pending[c.get('id')] = (i, c.get('name', ''), json.dumps(c.get('input', {}), ensure_ascii=False))
    elif t == 'user' and isinstance(content, list):
        for c in content:
            if isinstance(c, dict) and c.get('type') == 'tool_result':
                tid = c.get('tool_use_id')
                if tid in pending:
                    li, name, inp = pending.pop(tid)
                    rc = c.get('content')
                    if isinstance(rc, list):
                        rc = ''.join(x.get('text', '') for x in rc if isinstance(x, dict))
                    rc = str(rc)
                    print(f'### [{li}] {name} INPUT: {inp[:300]}')
                    print(f'### [{li}] RESULT:')
                    print(rc[:limit])
                    print()
