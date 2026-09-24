import os
import re

for root, _, files in os.walk('.'):
    if 'node_modules' in root or '.next' in root or '.git' in root:
        continue
    for file in files:
        if file.endswith(('.tsx', '.ts', '.jsx', '.js')):
            path = os.path.join(root, file)
            with open(path, 'r', encoding='utf-8') as f:
                content = f.read()
            
            new_content = re.sub(r'\brounded-(?:[23]xl|xl|lg|md|sm|none)\b', '', content)
            new_content = re.sub(r'\brounded\b(?!-)', '', new_content)
            
            # Clean up double spaces created by removal
            new_content = re.sub(r'  +', ' ', new_content)
            # Clean up space before closing quote
            new_content = re.sub(r' "', '"', new_content)
            
            if new_content != content:
                with open(path, 'w', encoding='utf-8') as f:
                    f.write(new_content)
                print(f"Fixed {path}")
