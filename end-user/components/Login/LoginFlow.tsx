"use client";

import React, { useState, useEffect, useRef } from"react";
import { useRouter } from"next/navigation";
import { CivicLogo } from"./CivicLogo";
import { SkylineIllustration } from"./SkylineIllustration";
import { NeedHelpModal } from"./NeedHelpModal";
import {
 SmartphoneIcon,
 MailEnvelopeIcon,
 ChevronLeftIcon,
 ChevronRightIcon,
 ChevronDownIcon,
 ArrowRightIcon,
 ShieldCheckIcon,
 LockPrivacyIcon,
 MunicipalCheckBadge,
 BoltIcon,
 PadlockIcon,
 QuestionCircleIcon,
 IndiaFlagIcon,
} from"./AuthIcons";
import { apis } from"../../lib/apis";

export type AuthScreenStep =
 |"welcome" // Screen 1
 |"mobile_login" // Screen 2
 |"email_login" // Screen 3
 |"otp_mobile" // Screen 4
 |"otp_email" // Screen 5
 |"verifying"; // Screen 6

const COUNTRY_CODES = [
 { code:"+91", name:"India", flag:"🇮🇳" },
 { code:"+1", name:"United States", flag:"🇺🇸" },
 { code:"+44", name:"United Kingdom", flag:"🇬🇧" },
 { code:"+971", name:"UAE", flag:"🇦🇪" },
];

export function LoginFlow() {
 const router = useRouter();

 // Navigation / Step State with lazy URL param check
 const [currentStep, setCurrentStep] = useState<AuthScreenStep>(() => {
 if (typeof window !=="undefined") {
 const params = new URLSearchParams(window.location.search);
 const stepParam = params.get("step") as AuthScreenStep;
 if (
 stepParam &&
 [
"welcome",
"mobile_login",
"email_login",
"otp_mobile",
"otp_email",
"verifying",
 ].includes(stepParam)
 ) {
 return stepParam;
 }
 }
 return"welcome";
 });

 const [isHelpOpen, setIsHelpOpen] = useState<boolean>(() => {
 if (typeof window !=="undefined") {
 const params = new URLSearchParams(window.location.search);
 return params.get("help") ==="true";
 }
 return false;
 });

 // Form Inputs
 const [countryCode, setCountryCode] = useState("+91");
 const [showCountryPicker, setShowCountryPicker] = useState(false);
 const [mobileNumber, setMobileNumber] = useState("98765 43210");
 const [emailAddress, setEmailAddress] = useState("rahul.sharma@example.com");

 // 6-digit OTP State
 const [devOtp, setDevOtp] = useState<string>("");
 const [otpDigits, setOtpDigits] = useState<string[]>([
"",
"",
"",
"",
"",
"",
 ]);
 const otpInputRefs = useRef<(HTMLInputElement | null)[]>([]);

 // Timer State (25 seconds initial countdown matching image"00:25")
 const [timerSeconds, setTimerSeconds] = useState(25);
 const [canResend, setCanResend] = useState(false);

 // Loading & Feedback State
 const [loading, setLoading] = useState(false);
 const [errorMessage, setErrorMessage] = useState("");

 // Countdown timer effect for OTP screens
 useEffect(() => {
 let interval: NodeJS.Timeout;
 if (
 (currentStep ==="otp_mobile" || currentStep ==="otp_email") &&
 timerSeconds > 0
 ) {
 interval = setInterval(() => {
 setTimerSeconds((prev) => {
 if (prev <= 1) {
 setCanResend(true);
 return 0;
 }
 return prev - 1;
 });
 }, 1000);
 }
 return () => clearInterval(interval);
 }, [currentStep, timerSeconds]);

 // Reset timer on entering OTP screen
 const startOtpTimer = () => {
 setTimerSeconds(25);
 setCanResend(false);
 };

 // Format seconds as MM:SS
 const formatTimer = (secs: number) => {
 const mins = Math.floor(secs / 60);
 const remainder = secs % 60;
 return `${mins.toString().padStart(2,"0")}:${remainder.toString().padStart(2,"0")}`;
 };

 // Send OTP for Mobile
 const handleMobileSubmit = async (e: React.FormEvent) => {
 e.preventDefault();
 setErrorMessage("");
 setLoading(true);

 const cleanNumber = mobileNumber.replace(/\s+/g,"");
 const fullTarget = `${countryCode} ${cleanNumber}`;

 try {
 const response = await apis.auth.sendOtp({
 mobile: fullTarget,
 method:"mobile",
 });

 if (response.success) {
 if (response.dev_otp) setDevOtp(response.dev_otp);
 startOtpTimer();
 setCurrentStep("otp_mobile");
 } else {
 setErrorMessage(response.error ||"Could not send verification code.");
 }
 } catch (err: any) {
 setErrorMessage(err.message ||"Could not send verification code.");
 } finally {
 setLoading(false);
 }
 };

 // Send OTP for Email
 const handleEmailSubmit = async (e: React.FormEvent) => {
 e.preventDefault();
 setErrorMessage("");
 setLoading(true);

 try {
 const response = await apis.auth.sendOtp({
 email: emailAddress,
 method:"email",
 });

 if (response.success) {
 if (response.dev_otp) setDevOtp(response.dev_otp);
 startOtpTimer();
 setCurrentStep("otp_email");
 } else {
 setErrorMessage(response.error ||"Could not send verification code.");
 }
 } catch (err: any) {
 setErrorMessage(err.message ||"Could not send verification code.");
 } finally {
 setLoading(false);
 }
 };

 // Resend OTP
 const handleResendOtp = async () => {
 if (!canResend && timerSeconds > 0) return;
 setLoading(true);
 setErrorMessage("");

 try {
 const isEmail = currentStep ==="otp_email";
 const payload = isEmail
 ? { email: emailAddress, method:"email" as const }
 : {
 mobile: `${countryCode} ${mobileNumber.replace(/\s+/g,"")}`,
 method:"mobile" as const,
 };

 const response = await apis.auth.sendOtp(payload);
 if (response.success) {
 startOtpTimer();
 } else {
 setErrorMessage(response.error ||"Could not resend code.");
 }
 } catch {
 startOtpTimer();
 } finally {
 setLoading(false);
 }
 };

 // Handle individual OTP digit input
 const handleOtpDigitChange = (index: number, value: string) => {
 if (value.length > 1) {
 const pasted = value.replace(/\D/g,"").slice(0, 6);
 if (pasted.length > 0) {
 const nextDigits = [...otpDigits];
 for (let i = 0; i < 6; i++) {
 nextDigits[i] = pasted[i] ||"";
 }
 setOtpDigits(nextDigits);
 const nextFocusIndex = Math.min(pasted.length, 5);
 otpInputRefs.current[nextFocusIndex]?.focus();
 }
 return;
 }

 const singleVal = value.replace(/\D/g,"");
 const next = [...otpDigits];
 next[index] = singleVal;
 setOtpDigits(next);

 if (singleVal && index < 5) {
 otpInputRefs.current[index + 1]?.focus();
 }
 };

 // Handle OTP key down for backspace
 const handleOtpKeyDown = (
 index: number,
 e: React.KeyboardEvent<HTMLInputElement>,
 ) => {
 if (e.key ==="Backspace" && !otpDigits[index] && index > 0) {
 otpInputRefs.current[index - 1]?.focus();
 }
 };

 // Verify OTP submission
 const handleVerifyOtp = async (e: React.FormEvent) => {
 e.preventDefault();
 const code = otpDigits.join("");
 if (code.length < 6) {
 setErrorMessage("Please enter all 6 digits of your verification code.");
 return;
 }

 setErrorMessage("");
 setCurrentStep("verifying");

 const target =
 currentStep ==="otp_email"
 ? emailAddress
 : `${countryCode} ${mobileNumber.replace(/\s+/g,"")}`;

 try {
 const response = await apis.auth.verifyOtp({
 target,
 otp: code,
 });

 if (response.success) {
 if (response.access_token) {
 localStorage.setItem("access_token", response.access_token);
 }
 setTimeout(() => {
 router.push("/dashboard");
 }, 1600);
 } else {
 setTimeout(() => {
 setCurrentStep(
 currentStep ==="otp_email" ?"otp_email" :"otp_mobile",
 );
 setErrorMessage(response.error ||"Invalid verification code.");
 }, 1000);
 }
 } catch (err: any) {
 setTimeout(() => {
 setCurrentStep(
 currentStep ==="otp_email" ?"otp_email" :"otp_mobile",
 );
 setErrorMessage(err.message ||"Invalid verification code.");
 }, 1000);
 }
 };

 return (
 <div className="civic-auth-page">
 {/* ========================================================
 BACKGROUND FLUID ORGANIC WAVES & FLOATING 3D GLOW SPHERES
 Matching the reference image background exactly
 ======================================================== */}
 <div className="auth-background-decorations" aria-hidden="true">
 {/* Soft Organic SVG Waves spanning full background */}
 <svg
 className="bg-fluid-waves-svg"
 viewBox="0 0 1440 900"
 fill="none"
 xmlns="http://www.w3.org/2000/svg"
 preserveAspectRatio="none"
 >
 {/* Left sweeping pastel blue wave */}
 <path
 d="M -50 -50 C 220 180, 260 480, 90 700 C 0 820, -50 880, -50 950 L -50 -50 Z"
 fill="url(#leftWaveGrad)"
 />
 {/* Right sweeping pastel blue wave */}
 <path
 d="M 1490 -50 C 1260 180, 1200 480, 1370 720 C 1450 830, 1490 890, 1490 950 L 1490 -50 Z"
 fill="url(#rightWaveGrad)"
 />
 <defs>
 <linearGradient
 id="leftWaveGrad"
 x1="0"
 y1="0"
 x2="260"
 y2="900"
 gradientUnits="userSpaceOnUse"
 >
 <stop offset="0%" stopColor="#e0f2fe" stopOpacity="0.85" />
 <stop offset="50%" stopColor="#ebf5fd" stopOpacity="0.6" />
 <stop offset="100%" stopColor="#f0f9ff" stopOpacity="0.9" />
 </linearGradient>
 <linearGradient
 id="rightWaveGrad"
 x1="1440"
 y1="0"
 x2="1200"
 y2="900"
 gradientUnits="userSpaceOnUse"
 >
 <stop offset="0%" stopColor="#dbeafe" stopOpacity="0.8" />
 <stop offset="60%" stopColor="#e0f2fe" stopOpacity="0.6" />
 <stop offset="100%" stopColor="#eff6ff" stopOpacity="0.85" />
 </linearGradient>
 </defs>
 </svg>

 {/* Ambient Top Glow */}
 <div className="ambient-glow ambient-glow-top" />

 {/* Ambient Bottom-Right Nebula Glow */}
 <div className="ambient-glow ambient-glow-bottom-right" />

 {/* 3D Sphere 1: Mid-Left Intense Glowing Cyan Orb */}
 <div className="floating-orb orb-cyan-glow" />

 {/* 3D Sphere 2: Upper-Left Glossy Purple/Violet Orb */}
 <div className="floating-orb orb-purple" />

 {/* 3D Sphere 3: Bottom-Left Teal Sphere */}
 <div className="floating-orb orb-teal-bottom" />

 {/* 3D Sphere 4: Top-Right Emerald/Teal Sphere */}
 <div className="floating-orb orb-teal-top-right" />

 {/* 3D Sphere 5: Mid-Right Royal Blue Sphere */}
 <div className="floating-orb orb-blue-mid-right" />
 </div>

 {/* ========================================================
 CENTRALIZED DUAL-COLUMN AUTHENTICATION CARD
 ======================================================== */}
 <div className="civic-auth-desktop-card">
 {/* ========================================================
 LEFT COLUMN: BRAND & CIVIC SHOWCASE (Visible on Desktop)
 ======================================================== */}
 <aside className="auth-desktop-showcase">
 {/* Top Brand Block */}
 <div className="showcase-top">
 <CivicLogo size={52} showText={true} idPrefix="desk_logo_" />
 <div className="showcase-heading-group">
 <h2 className="showcase-headline">
 Your voice. Your city.
 <br />
 <span className="headline-accent">Your impact.</span>
 </h2>
 <p className="showcase-subtitle">
 Report municipal issues, track resolution progress in real time,
 and help build a cleaner, safer and better community.
 </p>
 </div>
 </div>

 {/* Civic Skyline Vector Artwork with Waterfront & Connected Badges */}
 <div className="showcase-illustration-container">
 <SkylineIllustration idPrefix="desk_" />
 </div>

 {/* Bottom Trust Highlights */}
 <div className="showcase-bottom">
 <div className="showcase-features-row">
 <div className="showcase-feature-pill feature-portal-pill">
 <MunicipalCheckBadge size={16} />
 <span>Municipal Portal</span>
 </div>
 <div className="showcase-feature-pill">
 <BoltIcon size={14} color="#0284c7" />
 <span>Fast & Secure</span>
 </div>
 <div className="showcase-feature-pill">
 <PadlockIcon size={14} color="#10b981" />
 <span>Safe & Encrypted</span>
 </div>
 </div>
 <div className="showcase-tagline">
 <span>— A Cleaner • Safer • Brighter Tomorrow —</span>
 </div>
 </div>
 </aside>

 {/* ========================================================
 RIGHT COLUMN: INTERACTIVE AUTH FLOW
 ======================================================== */}
 <main className="auth-interactive-panel">
 {/* Global Error Banner */}
 {errorMessage && (
 <div className="auth-error-banner" role="alert">
 <span>{errorMessage}</span>
 <button
 type="button"
 className="error-dismiss-btn"
 onClick={() => setErrorMessage("")}
 >
 ×
 </button>
 </div>
 )}

 {/* ========================================================
 SCREEN 1: WELCOME & METHOD SELECTION
 ======================================================== */}
 {currentStep ==="welcome" && (
 <div className="auth-screen welcome-screen">
 <div className="screen-content-top">
 {/* Top Bar with"(?) Need Help?" */}
 <div className="screen-top-bar">
 <div className="top-bar-placeholder" />
 <button
 type="button"
 className="need-help-link"
 onClick={() => setIsHelpOpen(true)}
 >
 <QuestionCircleIcon size={18} color="#2563eb" />
 <span>Need Help?</span>
 </button>
 </div>

 {/* Mobile Hero Illustration & Brand (Visible on mobile viewports only) */}
 <div className="mobile-only-hero">
 <CivicLogo size={42} showText={true} idPrefix="mob_logo_" />
 <h2 className="mobile-hero-title">
 Your voice. Your city.
 <br />
 <span className="headline-accent">Your impact.</span>
 </h2>
 <p className="mobile-hero-desc">
 Report municipal issues, track resolution progress in real
 time, and help build a cleaner, safer and better community.
 </p>
 <div className="mobile-illustration-box">
 <SkylineIllustration idPrefix="mob_" />
 </div>
 </div>

 {/* Header Texts (Shown on Desktop) */}
 <div className="auth-header-block desktop-only-header">
 <span className="welcome-tag">Welcome back</span>
 <h3 className="auth-title">Sign in to CivicCare</h3>
 <p className="auth-subtitle">
 Select your preferred login method to access the Citizen
 complaint system.
 </p>
 </div>
 </div>

 <div className="screen-content-bottom">
 {/* Mobile-only section label */}
 <div className="mobile-section-label">
 <span>Login with</span>
 </div>

 {/* Action Method Cards */}
 <div className="auth-methods-group">
 {/* Method 1: Mobile Number */}
 <button
 type="button"
 className="auth-method-card"
 onClick={() => {
 setErrorMessage("");
 setCurrentStep("mobile_login");
 }}
 >
 <div className="method-icon-box phone-box">
 <SmartphoneIcon size={24} color="#3b82f6" />
 </div>
 <div className="method-text-stack">
 <span className="method-label">Continue with</span>
 <span className="method-title">Mobile Number</span>
 </div>
 <div className="method-arrow">
 <ChevronRightIcon size={18} color="#3b82f6" />
 </div>
 </button>

 {/* Method 2: Email Address */}
 <button
 type="button"
 className="auth-method-card"
 onClick={() => {
 setErrorMessage("");
 setCurrentStep("email_login");
 }}
 >
 <div className="method-icon-box email-box">
 <MailEnvelopeIcon size={24} color="#059669" />
 </div>
 <div className="method-text-stack">
 <span className="method-label">Continue with</span>
 <span className="method-title">Email Address</span>
 </div>
 <div className="method-arrow">
 <ChevronRightIcon size={18} color="#3b82f6" />
 </div>
 </button>
 </div>

 {/* Security Divider */}
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
 </div>
 </div>
 </div>
 )}

 {/* ========================================================
 SCREEN 2: LOGIN WITH MOBILE NUMBER
 ======================================================== */}
 {currentStep ==="mobile_login" && (
 <div className="auth-screen form-screen">
 {/* Top Navigation Bar */}
 <div className="screen-top-bar">
 <button
 type="button"
 className="back-icon-btn"
 onClick={() => {
 setErrorMessage("");
 setCurrentStep("welcome");
 }}
 aria-label="Back to login methods"
 >
 <ChevronLeftIcon size={18} color="#334155" />
 </button>
 <button
 type="button"
 className="need-help-link"
 onClick={() => setIsHelpOpen(true)}
 >
 <QuestionCircleIcon size={18} color="#2563eb" />
 <span>Need Help?</span>
 </button>
 </div>

 {/* Form Body - Centered Vertically */}
 <div className="form-screen-body">
 {/* Screen Icon */}
 <div className="screen-icon-header">
 <div className="screen-header-icon phone-box">
 <SmartphoneIcon size={32} color="#2563eb" />
 </div>
 </div>

 {/* Screen Title & Subtitle */}
 <div className="auth-header-block centered">
 <h3 className="auth-title">Login with Mobile Number</h3>
 <p className="auth-subtitle">
 Enter your registered mobile number to receive a
 verification code.
 </p>
 </div>

 {/* Mobile Input Form */}
 <form onSubmit={handleMobileSubmit} className="auth-form">
 <div className="phone-input-row">
 {/* Country Selector */}
 <div className="country-selector-wrapper">
 <button
 type="button"
 className="country-picker-btn"
 onClick={() => setShowCountryPicker(!showCountryPicker)}
 >
 <IndiaFlagIcon size={20} />
 <span className="country-code-text">{countryCode}</span>
 <ChevronDownIcon size={12} color="#64748b" />
 </button>

 {showCountryPicker && (
 <div className="country-dropdown-menu">
 {COUNTRY_CODES.map((item) => (
 <button
 key={item.code}
 type="button"
 className="country-dropdown-item"
 onClick={() => {
 setCountryCode(item.code);
 setShowCountryPicker(false);
 }}
 >
 <span>{item.flag}</span>
 <span className="country-item-name">
 {item.name}
 </span>
 <span className="country-item-code">
 {item.code}
 </span>
 </button>
 ))}
 </div>
 )}
 </div>

 {/* Number Input Field */}
 <div className="phone-number-field">
 <input
 type="tel"
 className="auth-text-input"
 value={mobileNumber}
 onChange={(e) => setMobileNumber(e.target.value)}
 placeholder="98765 43210"
 required
 />
 </div>
 </div>

 {/* Primary Submit Button */}
 <button
 type="submit"
 className="primary-action-btn"
 disabled={loading}
 >
 <span>{loading ?"Sending..." :"Send OTP"}</span>
 <ArrowRightIcon size={18} />
 </button>
 </form>

 {/* Or Divider */}
 <div className="or-divider">
 <span className="divider-text">or</span>
 </div>

 {/* Switch to Email Button */}
 <button
 type="button"
 className="secondary-action-btn"
 onClick={() => {
 setErrorMessage("");
 setCurrentStep("email_login");
 }}
 >
 <MailEnvelopeIcon size={18} color="#059669" />
 <span>Login with Email Instead</span>
 </button>
 </div>

 {/* Footer Trust Indicator */}
 <div className="form-screen-footer">
 <div className="mobile-trust-note">
 <ShieldCheckIcon size={16} color="#2563eb" />
 <span>Your information is secure with us</span>
 </div>
 <div className="privacy-callout-banner desktop-only-privacy">
 <div className="privacy-icon-box">
 <LockPrivacyIcon size={19} color="#059669" />
 </div>
 <div className="privacy-text-stack">
 <span className="privacy-title">We value your privacy</span>
 <span className="privacy-desc">
 Your data is protected and used only for civic services.
 </span>
 </div>
 </div>
 </div>
 </div>
 )}

 {/* ========================================================
 SCREEN 3: LOGIN WITH EMAIL ADDRESS
 ======================================================== */}
 {currentStep ==="email_login" && (
 <div className="auth-screen form-screen">
 {/* Top Navigation Bar */}
 <div className="screen-top-bar">
 <button
 type="button"
 className="back-icon-btn"
 onClick={() => {
 setErrorMessage("");
 setCurrentStep("welcome");
 }}
 aria-label="Back to login methods"
 >
 <ChevronLeftIcon size={18} color="#334155" />
 </button>
 <button
 type="button"
 className="need-help-link"
 onClick={() => setIsHelpOpen(true)}
 >
 <QuestionCircleIcon size={18} color="#2563eb" />
 <span>Need Help?</span>
 </button>
 </div>

 {/* Form Body - Centered Vertically */}
 <div className="form-screen-body">
 {/* Screen Icon */}
 <div className="screen-icon-header">
 <div className="screen-header-icon email-box">
 <MailEnvelopeIcon size={32} color="#059669" />
 </div>
 </div>

 {/* Screen Title & Subtitle */}
 <div className="auth-header-block centered">
 <h3 className="auth-title">Login with Email Address</h3>
 <p className="auth-subtitle">
 Enter your registered email address to receive a
 verification code.
 </p>
 </div>

 {/* Email Form */}
 <form onSubmit={handleEmailSubmit} className="auth-form">
 <div className="email-input-wrapper">
 <span className="input-prefix-icon">
 <MailEnvelopeIcon size={18} color="#64748b" />
 </span>
 <input
 type="email"
 className="auth-text-input with-prefix"
 value={emailAddress}
 onChange={(e) => setEmailAddress(e.target.value)}
 placeholder="rahul.sharma@example.com"
 required
 />
 </div>

 {/* Primary Submit Button */}
 <button
 type="submit"
 className="primary-action-btn"
 disabled={loading}
 >
 <span>{loading ?"Sending..." :"Send OTP"}</span>
 <ArrowRightIcon size={18} />
 </button>
 </form>

 {/* Or Divider */}
 <div className="or-divider">
 <span className="divider-text">or</span>
 </div>

 {/* Switch to Mobile Button */}
 <button
 type="button"
 className="secondary-action-btn"
 onClick={() => {
 setErrorMessage("");
 setCurrentStep("mobile_login");
 }}
 >
 <SmartphoneIcon size={18} color="#3b82f6" />
 <span>Login with Mobile Number Instead</span>
 </button>
 </div>

 {/* Footer Trust Indicator */}
 <div className="form-screen-footer">
 <div className="mobile-trust-note">
 <ShieldCheckIcon size={16} color="#2563eb" />
 <span>Your information is secure with us</span>
 </div>
 <div className="privacy-callout-banner desktop-only-privacy">
 <div className="privacy-icon-box">
 <LockPrivacyIcon size={19} color="#059669" />
 </div>
 <div className="privacy-text-stack">
 <span className="privacy-title">We value your privacy</span>
 <span className="privacy-desc">
 Your data is protected and used only for civic services.
 </span>
 </div>
 </div>
 </div>
 </div>
 )}

 {/* ========================================================
 SCREEN 4 & 5: OTP VERIFICATION (MOBILE & EMAIL)
 ======================================================== */}
 {(currentStep ==="otp_mobile" || currentStep ==="otp_email") && (
 <div className="auth-screen otp-screen form-screen">
 {/* Top Navigation Bar */}
 <div className="screen-top-bar">
 <button
 type="button"
 className="back-icon-btn"
 onClick={() => {
 setErrorMessage("");
 setCurrentStep(
 currentStep ==="otp_email"
 ?"email_login"
 :"mobile_login",
 );
 }}
 aria-label="Back to input"
 >
 <ChevronLeftIcon size={18} color="#334155" />
 </button>
 <button
 type="button"
 className="need-help-link"
 onClick={() => setIsHelpOpen(true)}
 >
 <QuestionCircleIcon size={18} color="#2563eb" />
 <span>Need Help?</span>
 </button>
 </div>

 {/* Form Body - Centered Vertically */}
 <div className="form-screen-body">
 {/* Screen Icon */}
 <div className="screen-icon-header">
 <div
 className={`screen-header-icon ${currentStep ==="otp_email" ?"email-box" :"phone-box"}`}
 >
 {currentStep ==="otp_email" ? (
 <MailEnvelopeIcon size={32} color="#059669" />
 ) : (
 <SmartphoneIcon size={32} color="#2563eb" />
 )}
 </div>
 </div>

 {/* Screen Title & Subtitle */}
 <div className="auth-header-block centered">
 <h3 className="auth-title">Verify OTP</h3>
 <p className="auth-subtitle">
 We have sent a 6-digit code to{""}
 <strong className="highlight-target">
 {currentStep ==="otp_email"
 ? emailAddress
 : `${countryCode} ${mobileNumber}`}
 </strong>
 </p>
 {devOtp && (
 <div style={{ marginTop:"10px", textAlign:"center" }}>
 <button
 type="button"
 onClick={() => {
 const digits = devOtp.split("").slice(0, 6);
 setOtpDigits(digits);
 }}
 style={{
 display:"inline-flex",
 alignItems:"center",
 gap:"6px",
 padding:"6px 14px",
 background:"#fef3c7",
 border:"1px solid #fde68a",
 color:"#92400e",
 borderRadius:"9999px",
 fontSize:"12px",
 fontFamily:"monospace",
 fontWeight:"bold",
 cursor:"pointer",
 }}
 >
 ⚡ Dev Code: {devOtp} (Click to fill)
 </button>
 </div>
 )}
 </div>

 {/* OTP Form */}
 <form onSubmit={handleVerifyOtp} className="auth-form">
 {/* 6 Digit Inputs */}
 <div className="otp-inputs-grid">
 {otpDigits.map((digit, index) => (
 <input
 key={`otp-box-${index}`}
 ref={(el) => {
 otpInputRefs.current[index] = el;
 }}
 type="text"
 inputMode="numeric"
 maxLength={1}
 className="otp-digit-input"
 value={digit}
 onChange={(e) =>
 handleOtpDigitChange(index, e.target.value)
 }
 onKeyDown={(e) => handleOtpKeyDown(index, e)}
 />
 ))}
 </div>

 {/* Resend OTP Row with Live Countdown */}
 <div className="resend-countdown-row">
 <span className="resend-label">
 Didn&apos;t receive the code?{""}
 </span>
 {timerSeconds > 0 ? (
 <span className="resend-timer-active">
 Resend OTP ({formatTimer(timerSeconds)})
 </span>
 ) : (
 <button
 type="button"
 className="resend-trigger-btn"
 onClick={handleResendOtp}
 disabled={loading}
 >
 Resend OTP
 </button>
 )}
 </div>

 {/* Primary Verify Button */}
 <button
 type="submit"
 className="primary-action-btn"
 disabled={loading}
 >
 <span>{loading ?"Checking..." :"Verify & Login"}</span>
 <ArrowRightIcon size={18} />
 </button>
 </form>
 </div>

 {/* Footer Trust Indicator */}
 <div className="form-screen-footer">
 <div className="mobile-trust-note">
 <ShieldCheckIcon size={16} color="#2563eb" />
 <span>Your information is secure with us</span>
 </div>
 <div className="privacy-callout-banner desktop-only-privacy">
 <div className="privacy-icon-box">
 <LockPrivacyIcon size={19} color="#059669" />
 </div>
 <div className="privacy-text-stack">
 <span className="privacy-title">We value your privacy</span>
 <span className="privacy-desc">
 Your data is protected and used only for civic services.
 </span>
 </div>
 </div>
 </div>
 </div>
 )}

 {/* ========================================================
 SCREEN 6: VERIFYING DETAILS LOADER
 ======================================================== */}
 {currentStep ==="verifying" && (
 <div className="auth-screen verifying-screen form-screen">
 <div className="verifying-container">
 {/* Circular Pulsing Spinner matching image */}
 <div className="verifying-spinner-wrapper">
 <div className="verifying-spinner-circle" />
 </div>

 <h3 className="auth-title">Verifying your details...</h3>
 <p className="auth-subtitle">
 Please wait while we securely log you in.
 </p>

 {/* Security Reassurance Card */}
 <div className="verifying-security-card">
 <ShieldCheckIcon size={22} color="#2563eb" />
 <div className="verifying-card-text">
 <span className="card-bold-text">
 This won&apos;t take long.
 </span>
 <span className="card-light-text">
 Your data is safe with us.
 </span>
 </div>
 </div>
 </div>
 </div>
 )}
 </main>
 </div>

 {/* Need Help Modal */}
 <NeedHelpModal isOpen={isHelpOpen} onClose={() => setIsHelpOpen(false)} />
 </div>
 );
}
