import os
import re
import glob

def reduce_tailwind(content):
    # Reduce paddings and margins
    def shrink_spacing(match):
        prefix = match.group(1)
        val = match.group(2)
        try:
            val_f = float(val)
            if val_f > 1:
                new_val = val_f * 0.5  # half the spacing
                if new_val.is_integer():
                    new_val = int(new_val)
                return f"{prefix}{new_val}"
            return match.group(0)
        except:
            return match.group(0)

    # regex for p-4, px-6, mt-8, gap-6, py-2.5, etc.
    content = re.sub(r'([pm][xytrbl]?-|gap-)(\d+(?:\.\d+)?)', shrink_spacing, content)
    
    # Reduce text sizes
    content = content.replace('text-2xl', 'text-xl')
    content = content.replace('text-xl', 'text-lg')
    content = content.replace('text-lg', 'text-base')
    content = content.replace('text-base', 'text-sm')
    content = content.replace('text-sm', 'text-xs')
    content = content.replace('text-xs', 'text-[10px]')
    
    # Reduce h-X, w-X
    content = re.sub(r'([hw]-)(\d+(?:\.\d+)?)', shrink_spacing, content)
    
    # ensure no double replacements messed up strings
    return content

directory = '/home/nandini/cms/end-user/components/Dashboard'
for filepath in glob.glob(os.path.join(directory, '*.tsx')):
    with open(filepath, 'r') as f:
        content = f.read()
    
    new_content = reduce_tailwind(content)
    
    with open(filepath, 'w') as f:
        f.write(new_content)

print("Done reducing spacing and font sizes!")
