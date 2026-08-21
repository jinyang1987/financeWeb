# -*- coding: utf-8 -*-
"""Extract tool_use calls (name + input) from a session jsonl."""
import json, sys, io

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

path = sys.argv[1]
lines = open(path, encoding='utf-8').readlines()
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
                name = c.get('name', '')
                inp = c.get('input', {})
                s = json.dumps(inp, ensure_ascii=False)
                print(f'[{i}] TOOL {name}: {s[:400]}')
