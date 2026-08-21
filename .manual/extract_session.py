# -*- coding: utf-8 -*-
"""Extract user messages and assistant text from a session jsonl for analysis."""
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
    if t == 'user':
        if isinstance(content, str):
            s = content.strip()
            if s and not s.startswith('<'):
                print(f'===== [{i}] USER =====')
                print(s[:2000])
        elif isinstance(content, list):
            for c in content:
                if isinstance(c, dict) and c.get('type') == 'text':
                    s = c['text'].strip()
                    if s and not s.startswith('<'):
                        print(f'===== [{i}] USER =====')
                        print(s[:2000])
    elif t == 'assistant' and isinstance(content, list):
        for c in content:
            if isinstance(c, dict) and c.get('type') == 'text':
                s = c['text'].strip()
                if s:
                    print(f'----- [{i}] ASSISTANT -----')
                    print(s[:3000])
