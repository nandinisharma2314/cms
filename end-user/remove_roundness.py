import os
import re

directory = '.'

patterns = [
    r'\brounded-3xl\b',
    r'\brounded-2xl\b',
    r'\brounded-xl\b',
    r'\brounded-lg\b',
    r'\brounded-md\b',
    r'\brounded-sm\b',
    r'\brounded\b(?!-)'
]

for root, _, files in os.walk(directory):
    for file in files:
        if file.endswith(('.tsx', '.ts', '.jsx', '.js')):
            path = os.path.join(root, file)
            with open(path, 'r', encoding='utf-8') as f:
                content = f.read()
            
            new_content = content
            for p in patterns:
                new_content = re.sub(p, '', new_content)
                
            # Clean up double spaces created by removal
            new_content = re.sub(r'  +', ' ', new_content)
            # Clean up space before closing quote
            new_content = re.sub(r' "', '"', new_content)
            
            if new_content != content:
                with open(path, 'w', encoding='utf-8') as f:
                    f.write(new_content)
                print(f"Fixed {path}")
