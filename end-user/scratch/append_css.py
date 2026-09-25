
# Append CSS cleanly to globals.css

css_append = """
/* ==========================================================================
   MOBILE AUTH OVERRIDES - EXACT BLUE SCREENS
   ========================================================================== */
@media (max-width: 768px) {
  /* Make buttons and inputs pill-shaped */
  .auth-method-card,
  .primary-action-btn,
  .secondary-action-btn,
  .country-picker-btn,
  .auth-text-input {
    border-radius: 9999px !important;
  }
  
  /* Auth Inputs need specific border radii (pill shape logic) */
  .country-picker-btn {
    border-radius: 9999px 0 0 9999px !important;
  }
  .phone-number-field .auth-text-input {
    border-radius: 0 9999px 9999px 0 !important;
  }
  
  .auth-text-input.with-prefix {
    border-radius: 9999px !important;
  }

  /* OTP Boxes are rounded squares, not pills */
  .otp-digit-input {
    border-radius: 12px !important;
  }

  /* Screen 1 Welcome card logic */
  .welcome-screen {
    background: linear-gradient(180deg, #f0f9ff 0%, #e0f2fe 100%) !important;
  }
  .screen-content-bottom {
    background: #ffffff !important;
    border-top-left-radius: 30px !important;
    border-top-right-radius: 30px !important;
    padding: 24px 20px 30px !important;
    box-shadow: 0 -10px 25px rgba(37,99,235,0.05) !important;
    position: relative;
    z-index: 20;
  }

  /* Make sure content floats above the absolute leaves */
  .form-screen-body, .screen-top-bar, .form-screen-footer, .screen-content-top {
    position: relative;
    z-index: 20;
  }

  /* Method icon backgrounds */
  .method-icon-box.phone-box {
    background: #eff6ff !important;
    border: none !important;
    border-radius: 50% !important;
  }
  .method-icon-box.email-box {
    background: #fdf4ff !important;
    border: none !important;
    border-radius: 50% !important;
  }
  .method-icon-box svg {
    width: 20px !important;
    height: 20px !important;
  }

  .screen-header-icon {
    border-radius: 20px !important;
  }
}
"""

with open('/home/nandini/cms/end-user/app/globals.css', 'a') as f:
    f.write(css_append)
