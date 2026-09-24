import os
import re

def process_tsx_file(filepath):
    with open(filepath, 'r') as f:
        content = f.read()

    # Regex to match tailwind rounded classes like rounded, rounded-sm, rounded-md, rounded-lg, rounded-xl, rounded-2xl, rounded-3xl, rounded-full
    # Also rounded-t-lg, rounded-b-md, rounded-tr-xl, etc.
    # Basically rounded(-[a-z]+(-[a-z0-9]+)?)?
    # Actually, we can just replace them with an empty string.
    new_content = re.sub(r'\brounded(-[a-z]+)*\b', '', content)

    # Clean up multiple spaces that might have been created
    new_content = re.sub(r'className=" +', 'className="', new_content)
    new_content = re.sub(r' +', ' ', new_content)
    new_content = re.sub(r' +"', '"', new_content)

    if new_content != content:
        with open(filepath, 'w') as f:
            f.write(new_content)
        print(f"Updated {filepath}")

def process_css_file(filepath):
    with open(filepath, 'r') as f:
        content = f.read()

    # Regex to match border-radius: <anything>;
    new_content = re.sub(r'border-radius:\s*[^;]+;', 'border-radius: 0;', content)
    
    if new_content != content:
        with open(filepath, 'w') as f:
            f.write(new_content)
        print(f"Updated {filepath}")

def main():
    dirs_to_scan = ['app', 'components']
    for d in dirs_to_scan:
        for root, _, files in os.walk(d):
            for file in files:
                filepath = os.path.join(root, file)
                if file.endswith('.tsx'):
                    process_tsx_file(filepath)
                elif file.endswith('.css'):
                    process_css_file(filepath)

if __name__ == '__main__':
    main()
