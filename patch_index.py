import re
def process(path):
    with open(path, 'r') as f:
        content = f.read()

    orig = content
    content = re.sub(r'(\w+)\[(\w+|[0-9]+|\w+\.\w+|lines\.length - 1)\]!', r'\1.at(\2)!', content)
    content = re.sub(r'([a-zA-Z0-9_]+)\[([a-zA-Z0-9_]+)\]\?', r'\1.at(\2)?', content)

    if content != orig:
        with open(path, 'w') as f:
            f.write(content)

process('src/log-update.ts')
process('src/measure-element.ts')
process('src/measure-text.ts')
process('src/output.ts')
