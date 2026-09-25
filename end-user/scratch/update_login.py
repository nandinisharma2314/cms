import re

with open('/home/nandini/cms/end-user/components/Login/LoginFlow.tsx', 'r') as f:
    content = f.read()

# 1. Update AuthScreenStep
content = content.replace(
    '  | "verifying"; // Screen 6',
    '  | "verifying" // Screen 6\n  | "success"; // Screen 8'
)

# 2. Add MobileLeaves import
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

# 4. Add MobileLeaves to screens (mobile_login, email_login, otp_mobile, otp_email, verifying, success)
# Screen 2: mobile_login
# Screen 3: email_login
# Screen 4 & 5: otp_mobile, otp_email
# Screen 6: verifying
# I will append the MobileLeaves and Success screen at the end of the auth-interactive-panel.

success_screen = '''        {/* ========================================================
        SCREEN 8: SUCCESS
        ======================================================== */}
        {currentStep === "success" && (
          <div className="auth-screen form-screen success-screen">
            <MobileLeaves color="blue" />
            <div className="screen-top-bar" style={{ minHeight: "28px" }} />
            <div className="form-screen-body" style={{ zIndex: 1, marginTop: "auto", marginBottom: "auto" }}>
              <div className="screen-icon-header">
                <div style={{ width: "90px", height: "90px", borderRadius: "50%", background: "#10b981", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: "16px", boxShadow: "0 8px 20px rgba(16, 185, 129, 0.2)" }}>
                  <svg width="48" height="48" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M5 13L9 17L19 7" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </div>
              </div>
              <div className="auth-header-block centered" style={{ marginBottom: "0" }}>
                <div className="mobile-illustration-box" style={{ minHeight: "150px", marginBottom: "20px" }}>
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
                style={{ width: "100%", marginTop: "30px" }}
              >
                <span>Continue</span>
                <ArrowRightIcon size={18} />
              </button>
            </div>
          </div>
        )}
      </main>'''

content = content.replace('      </main>', success_screen)

# We also need to add MobileLeaves to other screens.
# We can just add it inside each auth-screen div right at the top so it sits behind things.

# For mobile_login
content = content.replace(
    '''{currentStep === "mobile_login" && (
        <div className="auth-screen form-screen">''',
    '''{currentStep === "mobile_login" && (
        <div className="auth-screen form-screen">
          <MobileLeaves color="blue" />'''
)

# For email_login
content = content.replace(
    '''{currentStep === "email_login" && (
        <div className="auth-screen form-screen">''',
    '''{currentStep === "email_login" && (
        <div className="auth-screen form-screen">
          <MobileLeaves color="pink" />'''
)

# For OTP screens
content = content.replace(
    '''{(currentStep === "otp_mobile" || currentStep === "otp_email") && (
        <div className="auth-screen otp-screen form-screen">''',
    '''{(currentStep === "otp_mobile" || currentStep === "otp_email") && (
        <div className="auth-screen otp-screen form-screen">
          <MobileLeaves color={currentStep === "otp_email" ? "pink" : "blue"} />'''
)

# For verifying screen
content = content.replace(
    '''{currentStep === "verifying" && (
        <div className="auth-screen verifying-screen form-screen">''',
    '''{currentStep === "verifying" && (
        <div className="auth-screen verifying-screen form-screen">
          <MobileLeaves color={currentStep.includes("email") ? "pink" : "blue"} />'''
)

# For welcome screen
content = content.replace(
    '''{currentStep === "welcome" && (
        <div className="auth-screen welcome-screen">''',
    '''{currentStep === "welcome" && (
        <div className="auth-screen welcome-screen">
          <MobileLeaves color="blue" />'''
)

# Fix email verifying color check - currentStep is "verifying", so currentStep.includes("email") is always false. Let's fix that. Wait, we don't know if we came from email or mobile. But we can just use blue for now, or check emailAddress. The image shows pink and blue. Let's just use blue.
content = content.replace('color={currentStep.includes("email") ? "pink" : "blue"}', 'color="blue"')

with open('/home/nandini/cms/end-user/components/Login/LoginFlow.tsx', 'w') as f:
    f.write(content)
