from markitdown import MarkItDown
import sys
import io

if len(sys.argv) > 1:
    filename = sys.argv[1]
else:
    filename = '会计档案管理系统操作手册.docx'

# Set stdout to UTF-8
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

try:
    md = MarkItDown()
    result = md.convert(filename)
    output = result.text_content if hasattr(result, 'text_content') else result.markdown
    print(output)
except Exception as e:
    print(f"Error: {e}", file=sys.stderr)
    sys.exit(1)
