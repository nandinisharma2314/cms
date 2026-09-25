import re

with open('/home/nandini/cms/end-user/app/globals.css', 'r') as f:
    css = f.read()

# Remove the old auth styles by replacing everything from .civic-auth-page to right before .civic-dashboard-root
# Let's find the indices.
start_idx = css.find('.civic-auth-page {')
end_idx = css.find('.civic-dashboard-root {')

if start_idx != -1 and end_idx != -1:
    css = css[:start_idx] + css[end_idx:]

# Let's write the new styles
new_css = '''
/* MOBILE AUTHENTICATION FLOW UI (EXACT MATCH) */
.mobile-only-app-container {
  width: 100vw;
  height: 100vh;
  height: 100dvh;
  overflow: hidden;
  background: #ffffff;
  font-family: var(--font-geist-sans), sans-serif;
  position: relative;
  display: flex;
  justify-content: center;
  align-items: center;
}

.m-screen {
  width: 100%;
  max-width: 480px;
  height: 100%;
  position: relative;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  box-shadow: 0 0 40px rgba(0,0,0,0.05);
}

.welcome-bg {
  background: linear-gradient(180deg, #e0f2fe 0%, #f0f9ff 100%);
}

.form-bg {
  background: #ffffff;
}

/* Welcome Screen Specifics */
.m-welcome-top {
  flex: 1;
  display: flex;
  flex-direction: column;
  padding: 20px 24px 0;
  position: relative;
  z-index: 10;
}

.m-top-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  width: 100%;
}

.m-need-help {
  color: #2563eb;
  font-size: 14px;
  font-weight: 600;
  background: transparent;
  border: none;
  cursor: pointer;
}

.m-welcome-hero {
  text-align: center;
  margin-top: 30px;
  display: flex;
  flex-direction: column;
  align-items: center;
  flex: 1;
}

.m-hero-title {
  font-size: 28px;
  font-weight: 800;
  color: #0f172a;
  line-height: 1.15;
  margin-bottom: 12px;
  letter-spacing: -0.5px;
}

.m-hero-subtitle {
  font-size: 13.5px;
  color: #64748b;
  line-height: 1.5;
  margin-bottom: 20px;
}

.m-hero-img-wrap {
  width: 100%;
  max-width: 280px;
  flex: 1;
  display: flex;
  align-items: flex-end;
  justify-content: center;
}

.m-hero-img {
  width: 100%;
  object-fit: contain;
  max-height: 250px;
}

.m-welcome-bottom-card {
  background: #ffffff;
  border-top-left-radius: 32px;
  border-top-right-radius: 32px;
  padding: 24px 24px 30px;
  display: flex;
  flex-direction: column;
  align-items: center;
  position: relative;
  z-index: 10;
  box-shadow: 0 -4px 20px rgba(37,99,235,0.06);
}

.m-login-label {
  font-size: 15px;
  font-weight: 700;
  color: #0f172a;
  width: 100%;
  text-align: left;
  margin-bottom: 16px;
}

.m-new-here {
  margin-top: 16px;
  font-size: 12px;
  color: #64748b;
  text-align: center;
  line-height: 1.4;
}

.m-tagline {
  margin-top: 24px;
  font-size: 10px;
  color: #94a3b8;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

/* Button & Forms */
.m-pill-btn {
  width: 100%;
  border-radius: 9999px;
  height: 56px;
  display: flex;
  align-items: center;
  padding: 0 20px;
  margin-bottom: 12px;
  font-size: 15px;
  font-weight: 600;
  cursor: pointer;
  border: none;
  transition: opacity 0.2s;
}

.m-btn-outline {
  background: #ffffff;
  border: 1.5px solid #f1f5f9;
  box-shadow: 0 4px 10px rgba(0,0,0,0.02);
  justify-content: flex-start;
  gap: 16px;
}

.m-btn-solid {
  justify-content: center;
  gap: 8px;
  color: #ffffff;
  box-shadow: 0 8px 16px rgba(0,0,0,0.1);
}

.blue-btn { background: #2563eb; }
.pink-btn { background: #e83e8c; }

.m-btn-light {
  justify-content: center;
  gap: 10px;
}

.blue-light { background: #eff6ff; color: #2563eb; border: 1.5px solid #dbeafe; }
.pink-light { background: #fdf2f8; color: #e83e8c; border: 1.5px solid #fce7f3; }

.m-btn-icon-circle {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
}

.blue-circle { background: #eff6ff; }
.pink-circle { background: #fdf2f8; }

.m-btn-text {
  flex: 1;
  text-align: left;
  color: #0f172a;
}

/* Form Layout */
.m-form-container {
  flex: 1;
  display: flex;
  flex-direction: column;
  padding: 20px 24px;
  position: relative;
  z-index: 10;
}

.m-center-content {
  justify-content: center;
}

.m-top-bar-nav {
  display: flex;
  margin-bottom: 24px;
}

.m-back-btn {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  background: transparent;
  border: none;
  display: flex;
  align-items: center;
  justify-content: flex-start;
  cursor: pointer;
  margin-left: -10px;
}

.m-form-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  flex: 1;
}

.m-big-icon {
  margin-bottom: 24px;
}

.blue-cloud {
  background: url('data:image/svg+xml;utf8,<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg"><path fill="%23eff6ff" d="M30 35c0-11 9-20 20-20s20 9 20 20c11 0 20 9 20 20s-9 20-20 20H30C19 75 10 66 10 55s9-20 20-20z"/></svg>') no-repeat center;
  background-size: contain;
  width: 100px;
  height: 80px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.pink-cloud {
  background: url('data:image/svg+xml;utf8,<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg"><path fill="%23fdf2f8" d="M30 35c0-11 9-20 20-20s20 9 20 20c11 0 20 9 20 20s-9 20-20 20H30C19 75 10 66 10 55s9-20 20-20z"/></svg>') no-repeat center;
  background-size: contain;
  width: 100px;
  height: 80px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.m-form-title {
  font-size: 24px;
  font-weight: 800;
  color: #0f172a;
  margin-bottom: 12px;
}

.m-form-subtitle {
  font-size: 14px;
  color: #64748b;
  line-height: 1.5;
  margin-bottom: 30px;
  padding: 0 10px;
}

.blue-text { color: #2563eb; font-weight: 600; }
.pink-text { color: #e83e8c; font-weight: 600; }

.m-form {
  width: 100%;
}

.m-input-group {
  display: flex;
  margin-bottom: 16px;
  position: relative;
}

.m-country-picker {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 56px;
  padding: 0 16px;
  border-radius: 9999px 0 0 9999px;
  border: 1.5px solid #e2e8f0;
  border-right: none;
  background: #ffffff;
  font-weight: 600;
  color: #0f172a;
}

.m-input {
  height: 56px;
  border: 1.5px solid #e2e8f0;
  background: #ffffff;
  font-size: 16px;
  font-weight: 600;
  color: #0f172a;
}

.m-input-right {
  flex: 1;
  border-radius: 0 9999px 9999px 0;
  padding: 0 20px;
}

.m-input-full {
  flex: 1;
  border-radius: 9999px;
  width: 100%;
  padding: 0 20px;
}

.with-icon {
  padding-left: 48px;
}

.m-input-icon {
  position: absolute;
  left: 20px;
  top: 50%;
  transform: translateY(-50%);
}

.m-divider {
  display: flex;
  align-items: center;
  text-align: center;
  margin: 24px 0;
  color: #94a3b8;
  font-size: 14px;
}

.m-divider::before, .m-divider::after {
  content: "";
  flex: 1;
  border-bottom: 1px solid #e2e8f0;
}
.m-divider span {
  padding: 0 10px;
}

.m-security-note {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  font-size: 12px;
  color: #64748b;
  margin-top: auto;
  margin-bottom: 100px;
}

/* OTP Specifics */
.m-otp-grid {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 24px;
}

.m-otp-box {
  width: calc(100% / 6 - 5px);
  height: 56px;
  border-radius: 12px;
  text-align: center;
  font-size: 24px;
  font-weight: 800;
  color: #0f172a;
  background: #ffffff;
  border: 1.5px solid #e2e8f0;
}

.m-otp-box:focus {
  outline: none;
}

.blue-border:focus { border-color: #2563eb; }
.pink-border:focus { border-color: #e83e8c; }

.m-resend-text {
  font-size: 13px;
  color: #64748b;
  margin-bottom: 24px;
}
.resend-btn {
  background: transparent;
  border: none;
  font-weight: 700;
  cursor: pointer;
  padding: 0;
}

/* Verifying Loader */
.m-spinner {
  width: 60px;
  height: 60px;
  border-radius: 50%;
  border-width: 4px;
  border-style: solid;
  border-right-color: transparent;
  animation: spin 1s linear infinite;
  margin-bottom: 30px;
}
.blue-spinner { border-color: #2563eb; border-right-color: transparent; }
.pink-spinner { border-color: #e83e8c; border-right-color: transparent; }

@keyframes spin {
  100% { transform: rotate(360deg); }
}

.m-security-card {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 16px 20px;
  border-radius: 16px;
  margin-top: 40px;
  text-align: left;
}
.blue-bg { background: #eff6ff; }
.pink-bg { background: #fdf2f8; }

.m-security-card-text {
  display: flex;
  flex-direction: column;
}
.m-security-card-text strong {
  font-size: 14px;
  color: #0f172a;
}
.m-security-card-text span {
  font-size: 13px;
  color: #64748b;
}

/* Country Dropdown Mobile */
.m-country-dropdown {
  position: absolute;
  top: 60px;
  left: 0;
  width: 250px;
  z-index: 50;
  background: #fff;
  border-radius: 12px;
  box-shadow: 0 4px 20px rgba(0,0,0,0.1);
  max-height: 200px;
  overflow-y: auto;
}
'''

# Insert the new css before .civic-dashboard-root
css = css[:start_idx] + new_css + css[start_idx:]

with open('/home/nandini/cms/end-user/app/globals.css', 'w') as f:
    f.write(css)

