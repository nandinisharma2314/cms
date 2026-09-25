import re

with open('/home/nandini/cms/end-user/components/Login/LoginFlow.tsx', 'r') as f:
    content = f.read()

# 1. Update Welcome text
content = content.replace(
    '''  <h2 className="mobile-hero-title">
  Your voice. Your city.
  <br />
  <span className="headline-accent">Your impact.</span>
  </h2>
  <p className="mobile-hero-desc">
  Report municipal issues, track resolution progress in real
  time, and help build a cleaner, safer and better community.
  </p>''',
    '''  <h2 className="mobile-hero-title">
  Your Voice Matters
  </h2>
  <p className="mobile-hero-desc">
  Report issues, track progress,<br/>help build a better community.
  </p>'''
)

# 2. Add the bottom text in the welcome screen
# The auth-security-divider is replaced with the new text.
old_bottom = '''  {/* Security Divider */}
  <div className="auth-security-divider">
  <div className="divider-line" />
  <div className="security-guarantee-pill">
  <ShieldCheckIcon size={16} color="#0d9488" />
  <span>Your information is secure with us</span>
  </div>
  <div className="divider-line" />
  </div>

  {/* Bottom Privacy Callout Banner */}
  <div className="privacy-callout-banner">
  <div className="privacy-icon-box">
  <LockPrivacyIcon size={19} color="#059669" />
  </div>
  <div className="privacy-text-stack">
  <span className="privacy-title">We value your privacy</span>
  <span className="privacy-desc">
  Your data is protected and used only for civic services.
  </span>
  </div>
  </div>'''

new_bottom = '''  <div className="welcome-bottom-text">
  <p className="new-here-text">New here? Contact your administrator<br/>for access.</p>
  <div className="welcome-footer-tagline">
    <span>— A Cleaner • Safer • Brighter Tomorrow —</span>
  </div>
  </div>'''

content = content.replace(old_bottom, new_bottom)

with open('/home/nandini/cms/end-user/components/Login/LoginFlow.tsx', 'w') as f:
    f.write(content)

# Update globals.css
with open('/home/nandini/cms/end-user/app/globals.css', 'r') as f:
    css = f.read()

# Make welcome screen buttons match exactly
# .auth-method-card is currently a button.
new_css = '''
  .welcome-bottom-text {
    text-align: center;
    margin-top: 15px;
  }
  .new-here-text {
    font-size: 11px;
    color: #64748b;
    margin-bottom: 20px;
    line-height: 1.4;
  }
  .welcome-footer-tagline {
    font-size: 10px;
    color: #94a3b8;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }
  .auth-method-card {
    border-radius: 9999px !important;
    border: 1px solid #e2e8f0 !important;
    padding: 10px 16px !important;
    box-shadow: 0 4px 10px rgba(0,0,0,0.02) !important;
  }
  .method-icon-box.phone-box {
    background: #eff6ff !important;
    border: none !important;
    border-radius: 50% !important;
    width: 36px !important;
    height: 36px !important;
  }
  .method-icon-box.email-box {
    background: #fdf4ff !important;
    border: none !important;
    border-radius: 50% !important;
    width: 36px !important;
    height: 36px !important;
  }
  .mobile-hero-title {
    font-size: 28px !important;
    color: #1e3a8a !important;
    font-weight: 800 !important;
    letter-spacing: -0.5px !important;
    margin-bottom: 8px !important;
  }
  .mobile-hero-desc {
    font-size: 13px !important;
    color: #64748b !important;
    max-width: 280px !important;
  }
  .screen-content-bottom {
    padding-bottom: 30px !important;
  }
  /* Fix the icon size in buttons */
  .method-icon-box svg {
    width: 18px !important;
    height: 18px !important;
  }
'''

css += new_css

with open('/home/nandini/cms/end-user/app/globals.css', 'w') as f:
    f.write(css)

