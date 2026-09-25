import re

with open('/home/nandini/cms/end-user/components/Login/LoginFlow.tsx', 'r') as f:
    content = f.read()

new_content = """        {currentStep === "welcome" && (
          <div className="relative flex flex-col items-center w-full h-full min-h-screen bg-white font-sans overflow-x-hidden pb-4">
            {/* iOS Status Bar */}
            <div className="w-full flex justify-between items-center px-6 py-3 text-black z-10 bg-transparent">
              <span className="text-[15px] font-semibold tracking-tight">9:41</span>
              <div className="flex items-center gap-2">
                {/* Cellular */}
                <svg width="17" height="11" viewBox="0 0 17 11" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M1 8.5H2.5V10.5H1V8.5ZM4.5 6.5H6V10.5H4.5V6.5ZM8 4.5H9.5V10.5H8V4.5ZM11.5 2.5H13V10.5H11.5V2.5ZM15 0.5H16.5V10.5H15V0.5Z" fill="black"/>
                </svg>
                {/* Wifi */}
                <svg width="16" height="12" viewBox="0 0 16 12" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M8 2.5C5.5 2.5 3.2 3.4 1.4 4.9L8 11.5L14.6 4.9C12.8 3.4 10.5 2.5 8 2.5ZM8 0C11.3 0 14.3 1.2 16.6 3.1L8 11.5L-0.6 3.1C1.7 1.2 4.7 0 8 0Z" fill="black"/>
                </svg>
                {/* Battery */}
                <svg width="25" height="12" viewBox="0 0 25 12" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <rect x="0.5" y="0.5" width="21" height="11" rx="3.5" stroke="black"/>
                  <rect x="2" y="2" width="15" height="8" rx="2" fill="black"/>
                  <path d="M23 4V8C23.6 8 24 7.6 24 7V5C24 4.4 23.6 4 23 4Z" fill="black"/>
                </svg>
              </div>
            </div>

            {/* Logo Area */}
            <div className="mt-2 flex flex-col items-center z-10">
              <CivicLogo size={46} showText={false} idPrefix="welcome_logo_" />
              <h1 className="text-[22px] font-bold text-[#0f172a] mt-2 tracking-tight">CivicCare</h1>
              <p className="text-[12px] text-gray-500 font-medium">Complaint Management System</p>
            </div>

            {/* Worker Illustration */}
            <div className="w-full max-w-[340px] mt-4 flex justify-center z-10 relative">
              <img src="/worker_illustration.jpg" alt="City worker illustration" className="w-full h-auto object-contain" />
            </div>

            {/* Text Content */}
            <div className="text-center px-6 mt-4 z-10">
              <h2 className="text-[28px] font-bold text-[#1e293b] mb-3 leading-tight tracking-tight">Your Voice Matters</h2>
              <p className="text-[15px] text-gray-600 px-2 leading-relaxed">
                Report issues, track progress, help build a better community.
              </p>
            </div>

            {/* Login Card */}
            <div className="w-full px-5 mt-6 z-10 flex flex-col items-center">
              <div className="bg-white rounded-2xl border border-gray-100 shadow-[0_8px_30px_rgba(0,0,0,0.06)] p-5 w-full max-w-[400px]">
                <h3 className="text-[16px] font-semibold text-gray-800 mb-4 ml-1">Login with</h3>
                
                <div className="flex flex-col gap-3">
                  <button
                    type="button"
                    className="w-full flex items-center justify-between bg-[#1d5fb9] rounded-full p-2 pr-5 transition-transform active:scale-[0.98]"
                    onClick={() => {
                      setErrorMessage("");
                      setCurrentStep("mobile_login");
                    }}
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-[#dbeafe] flex items-center justify-center shadow-sm">
                        <SmartphoneIcon size={20} color="#1d5fb9" />
                      </div>
                      <span className="text-white text-[15px] font-medium tracking-wide">Continue with Mobile Number</span>
                    </div>
                    <ArrowRightIcon size={16} color="white" />
                  </button>

                  <button
                    type="button"
                    className="w-full flex items-center justify-between bg-[#1d5fb9] rounded-full p-2 pr-5 transition-transform active:scale-[0.98]"
                    onClick={() => {
                      setErrorMessage("");
                      setCurrentStep("email_login");
                    }}
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-[#f3e8ff] flex items-center justify-center shadow-sm">
                        <MailEnvelopeIcon size={20} color="#7e22ce" />
                      </div>
                      <span className="text-white text-[15px] font-medium tracking-wide">Continue with Email Address</span>
                    </div>
                    <ArrowRightIcon size={16} color="white" />
                  </button>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="flex flex-col items-center mt-auto pb-10 pt-6 z-10 px-6 text-center w-full max-w-[400px]">
              <p className="text-[14px] text-gray-500 mb-5">
                New here? Contact your administrator<br/>for access.
              </p>
              <div className="flex items-center justify-center w-full gap-3 text-gray-400 text-[12px] tracking-wider">
                <div className="h-[1px] flex-1 bg-gray-200"></div>
                <span className="whitespace-nowrap">A Cleaner &bull; Safer &bull; Brighter Tomorrow</span>
                <div className="h-[1px] flex-1 bg-gray-200"></div>
              </div>
            </div>

            {/* Bottom Waves */}
            <div className="absolute bottom-0 left-0 w-full z-0 h-[140px] overflow-hidden pointer-events-none">
              <svg viewBox="0 0 1440 320" className="absolute bottom-0 w-full h-[140px]" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg">
                <path fill="#f0f9ff" fillOpacity="1" d="M0,256L48,250.7C96,245,192,235,288,234.7C384,235,480,245,576,234.7C672,224,768,192,864,197.3C960,203,1056,245,1152,256C1248,267,1344,245,1392,234.7L1440,224L1440,320L1392,320C1344,320,1248,320,1152,320C1056,320,960,320,864,320C768,320,672,320,576,320C480,320,384,320,288,320C192,320,96,320,48,320L0,320Z"></path>
                <path fill="#e0f2fe" fillOpacity="0.8" d="M0,192L48,197.3C96,203,192,213,288,208C384,203,480,181,576,176C672,171,768,181,864,202.7C960,224,1056,256,1152,261.3C1248,267,1344,245,1392,234.7L1440,224L1440,320L1392,320C1344,320,1248,320,1152,320C1056,320,960,320,864,320C768,320,672,320,576,320C480,320,384,320,288,320C192,320,96,320,48,320L0,320Z"></path>
              </svg>
            </div>
          </div>
        )}"""

pattern = r'\s*\{currentStep === "welcome" && \(\s*<div className="auth-screen welcome-screen">.*?</div>\s*</div>\s*\)\}'

replaced = re.sub(pattern, new_content, content, flags=re.DOTALL)

with open('/home/nandini/cms/end-user/components/Login/LoginFlow.tsx', 'w') as f:
    f.write(replaced)

