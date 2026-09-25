import re

with open('/home/nandini/cms/end-user/app/globals.css', 'r') as f:
    content = f.read()

# The welcome screen needs a light blue top and white bottom.
new_welcome_css = '''
  .welcome-screen {
    background: linear-gradient(180deg, #f0f9ff 0%, #e0f2fe 100%) !important;
  }
  
  /* The white card at the bottom */
  .screen-content-bottom {
    background: #ffffff !important;
    border-top-left-radius: 30px !important;
    border-top-right-radius: 30px !important;
    padding: 24px 20px 30px !important;
    box-shadow: 0 -10px 25px rgba(37,99,235,0.05) !important;
    position: relative;
    z-index: 10;
  }
  
  .auth-method-card {
    border-radius: 9999px !important;
    border: 1.5px solid #e2e8f0 !important;
    padding: 12px 16px !important;
    display: flex !important;
    align-items: center !important;
    margin-bottom: 12px !important;
  }
  
  .mobile-hero-title {
    font-size: 26px !important;
    color: #1e3a8a !important;
    font-weight: 800 !important;
    margin-bottom: 8px !important;
  }
'''

content += new_welcome_css

with open('/home/nandini/cms/end-user/app/globals.css', 'w') as f:
    f.write(content)

