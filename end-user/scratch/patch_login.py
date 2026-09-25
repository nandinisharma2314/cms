import re

file_path = '/home/nandini/cms/end-user/components/Login/LoginFlow.tsx'
with open(file_path, 'r') as f:
    content = f.read()

# 1. Update AuthScreenStep
if '"success"' not in content:
    content = content.replace(
        '  | "verifying"; // Screen 6',
        '  | "verifying" // Screen 6\n  | "success"; // Screen 8'
    )

# 2. Add MobileLeaves import
if 'MobileLeaves' not in content:
    content = content.replace(
        'import { apis } from "../../lib/apis";',
        'import { apis } from "../../lib/apis";\nimport { MobileLeaves } from "./MobileLeaves";'
    )

# 3. Update verify otp success logic
old_verify_success = '''        if (response.access_token) {
          localStorage.setItem("access_token", response.access_token);
        }
        setTimeout(() => {
          router.push("/dashboard");
        }, 1600);'''

new_verify_success = '''        if (response.access_token) {
          localStorage.setItem("access_token", response.access_token);
        }
        setTimeout(() => {
          setCurrentStep("success");
        }, 1600);'''

content = content.replace(old_verify_success, new_verify_success)

# 4. Add MobileLeaves to screens

# For mobile_login
content = re.sub(
    r'(\{currentStep === "mobile_login" && \(\s*<div className="auth-screen form-screen">)',
    r'\1\n          <MobileLeaves color="blue" />',
    content
)

# For email_login
content = re.sub(
    r'(\{currentStep === "email_login" && \(\s*<div className="auth-screen form-screen">)',
    r'\1\n          <MobileLeaves color="pink" />',
    content
)

# For OTP screens
content = re.sub(
    r'(\{\(currentStep === "otp_mobile" \|\| currentStep === "otp_email"\) && \(\s*<div className="auth-screen otp-screen form-screen">)',
    r'\1\n          <MobileLeaves color={currentStep === "otp_email" ? "pink" : "blue"} />',
    content
)

# For verifying screen
content = re.sub(
    r'(\{currentStep === "verifying" && \(\s*<div className="auth-screen verifying-screen form-screen">)',
    r'\1\n          <MobileLeaves color={currentStep.includes("email") ? "pink" : "blue"} />',
    content
)

# For welcome screen
content = re.sub(
    r'(\{currentStep === "welcome" && \(\s*<div className="auth-screen welcome-screen">)',
    r'\1\n          <MobileLeaves color="blue" />',
    content
)

# 5. Append Success Screen
success_screen = '''        {/* ========================================================
        SCREEN 8: SUCCESS
        ======================================================== */}
        {currentStep === "success" && (
          <div className="auth-screen form-screen success-screen">
            <MobileLeaves color="blue" />
            <div className="form-screen-body">
              <div className="screen-icon-header">
                <div style={{ width: "72px", height: "72px", borderRadius: "50%", background: "#10b981", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 4px 14px rgba(16, 185, 129, 0.2)" }}>
                  <svg width="40" height="40" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M5 13L9 17L19 7" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </div>
              </div>
              <div className="auth-header-block centered">
                <div className="mobile-illustration-box" style={{ minHeight: "150px" }}>
                  <SkylineIllustration idPrefix="succ_" />
                </div>
                <h3 className="auth-title">Welcome Back!</h3>
                <p className="auth-subtitle">
                  You have successfully logged in to ShramSetu.
                </p>
              </div>
              <button
                type="button"
                className="primary-action-btn"
                onClick={() => router.push("/dashboard")}
                style={{ width: "100%", marginTop: "20px" }}
              >
                <span>Continue</span>
                <ArrowRightIcon size={18} />
              </button>
            </div>
          </div>
        )}
      </main>'''

if 'success-screen' not in content:
    content = content.replace('      </main>', success_screen)

with open(file_path, 'w') as f:
    f.write(content)
