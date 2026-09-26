import os
from dotenv import load_dotenv

load_dotenv()

# ENVIRONMENT is the older name for the same setting.
APP_ENV = os.getenv("APP_ENV") or os.getenv("ENVIRONMENT") or "development"
IS_DEVELOPMENT = APP_ENV == "development"

JWT_SECRET_KEY = os.getenv("JWT_SECRET_KEY")
if not JWT_SECRET_KEY:
    if not IS_DEVELOPMENT:
        raise RuntimeError("JWT_SECRET_KEY must be set outside development")
    JWT_SECRET_KEY = "dev-only-insecure-jwt-secret-do-not-deploy"

JWT_ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRES_MINUTES = int(os.getenv("JWT_ACCESS_TOKEN_EXPIRES_MINUTES", "60"))
REFRESH_TOKEN_EXPIRES_DAYS = int(os.getenv("JWT_REFRESH_TOKEN_EXPIRES_DAYS", "7"))

OTP_TTL_MINUTES = int(os.getenv("OTP_TTL_MINUTES", "10"))
OTP_MAX_ATTEMPTS = int(os.getenv("OTP_MAX_ATTEMPTS", "5"))
OTP_RESEND_COOLDOWN_SECONDS = int(os.getenv("OTP_RESEND_COOLDOWN_SECONDS", "30"))
# In development the OTP is printed to the console and returned in the API
# response instead of being sent. Elsewhere it goes out by SMS (Twilio) or email (SMTP).
EXPOSE_DEV_OTP = IS_DEVELOPMENT
TWILIO_ACCOUNT_SID = os.getenv("TWILIO_ACCOUNT_SID")
TWILIO_AUTH_TOKEN = os.getenv("TWILIO_AUTH_TOKEN")
TWILIO_PHONE_NUMBER = os.getenv("TWILIO_PHONE_NUMBER")
SMS_COUNTRY_CODE = os.getenv("SMS_COUNTRY_CODE", "+91")  # mobiles are stored as 10 digits
SMTP_SERVER = os.getenv("SMTP_SERVER")
SMTP_PORT = int(os.getenv("SMTP_PORT", "587"))
SMTP_USERNAME = os.getenv("SMTP_USERNAME")
SMTP_PASSWORD = os.getenv("SMTP_PASSWORD")

MAX_CSV_UPLOAD_BYTES = int(os.getenv("MAX_CSV_UPLOAD_BYTES", str(5 * 1024 * 1024)))

# End users may reopen a resolved complaint within this many days, at most MAX_REOPENS times.
REOPEN_WINDOW_DAYS = int(os.getenv("REOPEN_WINDOW_DAYS", "7"))

# How often the in-process SLA checker runs (warnings, breaches, escalations).
# 0 disables it, e.g. when running sla_worker.py as a separate process instead.
SLA_CHECK_INTERVAL_SECONDS = int(os.getenv("SLA_CHECK_INTERVAL_SECONDS", "60"))
MAX_REOPENS = int(os.getenv("MAX_REOPENS", "3"))
