import os
import re

directory = '.'

for root, _, files in os.walk(directory):
    for file in files:
        if file.endswith(('.tsx', '.ts', '.jsx', '.js')):
            path = os.path.join(root, file)
            with open(path, 'r', encoding='utf-8') as f:
                content = f.read()
            
            # replace space followed by -2xl with rounded-2xl, etc
            new_content = re.sub(r'(\s)-2xl\b', r'\1rounded-2xl', content)
            new_content = re.sub(r'(\s)-xl\b', r'\1rounded-xl', new_content)
            new_content = re.sub(r'(\s)-lg\b', r'\1rounded-lg', new_content)
            new_content = re.sub(r'(\s)-md\b', r'\1rounded-md', new_content)
            new_content = re.sub(r'(\s)-sm\b', r'\1rounded-sm', new_content)
            new_content = re.sub(r'(\s)-full\b', r'\1rounded-full', new_content)
            
            if new_content != content:
                with open(path, 'w', encoding='utf-8') as f:
                    f.write(new_content)
                print(f"Fixed {path}")
