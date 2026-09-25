import re

with open('/home/nandini/cms/end-user/app/globals.css', 'r') as f:
    content = f.read()

# Make buttons pill shaped
content = re.sub(r'(\.primary-action-btn\s*\{[^}]*?)border-radius:\s*0;', r'\1border-radius: 9999px;', content)
content = re.sub(r'(\.secondary-action-btn\s*\{[^}]*?)border-radius:\s*0;', r'\1border-radius: 9999px;', content)
content = re.sub(r'(\.auth-method-card\s*\{[^}]*?)border-radius:\s*0;', r'\1border-radius: 9999px;', content)

# Make inputs rounded
content = re.sub(r'(\.country-picker-btn\s*\{[^}]*?)border-radius:\s*0;', r'\1border-radius: 12px 0 0 12px;', content)
content = re.sub(r'(\.auth-text-input\s*\{[^}]*?)border-radius:\s*0;', r'\1border-radius: 12px;', content)
content = content.replace('border-radius: 12px;\n    border: 1.5px solid #dbeafe;\n    background: #ffffff;\n    width: 100%;', 'border-radius: 0 12px 12px 0;\n    border: 1.5px solid #dbeafe;\n    border-left: none;\n    background: #ffffff;\n    width: 100%;')

# Fix auth-text-input.with-prefix
content = content.replace('.auth-text-input.with-prefix {\n    padding-left: 44px;\n  }', '.auth-text-input.with-prefix {\n    padding-left: 44px;\n    border-radius: 12px;\n    border-left: 1.5px solid #dbeafe;\n  }')

# Make OTP boxes rounded
content = re.sub(r'(\.otp-digit-input\s*\{[^}]*?)border-radius:\s*0;', r'\1border-radius: 12px;', content)

# Remove the box-shadows on buttons/inputs to match the clean look of the image
# Actually, the image has very subtle shadow, keep it.

# Update screen icons
content = re.sub(r'(\.screen-header-icon\s*\{[^}]*?)border-radius:\s*0;', r'\1border-radius: 20px;', content)

# Make auth-screen relative and fix z-index for content
content = content.replace('.form-screen-body {\n    width: 100%;', '.form-screen-body {\n    position: relative;\n    z-index: 10;\n    width: 100%;')
content = content.replace('.screen-top-bar {\n    width: 100%;', '.screen-top-bar {\n    position: relative;\n    z-index: 10;\n    width: 100%;')
content = content.replace('.form-screen-footer {\n    width: 100%;', '.form-screen-footer {\n    position: relative;\n    z-index: 10;\n    width: 100%;')

# Fix auth-methods-group z-index
content = content.replace('.screen-content-bottom {\n    width: 100%;', '.screen-content-bottom {\n    position: relative;\n    z-index: 10;\n    width: 100%;')

# Make the welcome screen top part relative so it sits above leaves
content = content.replace('.screen-content-top {\n    width: 100%;', '.screen-content-top {\n    position: relative;\n    z-index: 10;\n    width: 100%;')

# Update "Login with Email Instead" colors
# It already has .secondary-action-btn with background #f0f7ff and color #2563eb

# Update Welcome Screen Illustration wrapper
content = content.replace('.mobile-illustration-box {\n    width: 100%;', '.mobile-illustration-box {\n    position: relative;\n    z-index: 10;\n    width: 100%;')

with open('/home/nandini/cms/end-user/app/globals.css', 'w') as f:
    f.write(content)

print("CSS updated successfully.")
