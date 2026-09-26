"use client";

import React, { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { CivicLogo } from "./CivicLogo";
import { SkylineIllustration } from "./SkylineIllustration";
import { NeedHelpModal } from "./NeedHelpModal";
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
import { apis, ApiError, OtpChannel, saveSession } from "../../lib/apis";

export type AuthScreenStep =
   | "welcome" // Screen 1
   | "mobile_login" // Screen 2
   | "email_login" // Screen 3
   | "otp_mobile" // Screen 4
   | "otp_email" // Screen 5
   | "verifying"; // Screen 6

const COUNTRY_CODES = [
   { code: "+91", name: "India", flag: "🇮🇳" },
   { code: "+1", name: "United States", flag: "🇺🇸" },
   { code: "+44", name: "United Kingdom", flag: "🇬🇧" },
   { code: "+971", name: "UAE", flag: "🇦🇪" },
];

export function LoginFlow() {
   const router = useRouter();

   // Navigation / Step State with lazy URL param check
   const [currentStep, setCurrentStep] = useState<AuthScreenStep>(() => {
      if (typeof window !== "undefined") {
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
      return "welcome";
   });

   const [isHelpOpen, setIsHelpOpen] = useState<boolean>(() => {
      if (typeof window !== "undefined") {
         const params = new URLSearchParams(window.location.search);
         return params.get("help") === "true";
      }
      return false;
   });

 // Form Inputs
 const [countryCode, setCountryCode] = useState("+91");
 const [showCountryPicker, setShowCountryPicker] = useState(false);
 const [mobileNumber, setMobileNumber] = useState("");
 const [emailAddress, setEmailAddress] = useState("");
 // Set when the entered mobile/email is shared by more than one end user; the
 // other identifier is then asked for as well.
 const [needsBoth, setNeedsBoth] = useState(false);
 // Returned by request-otp; identifies the code being verified.
 const [challengeId, setChallengeId] = useState("");
 const [sentTo, setSentTo] = useState("");

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
         (currentStep === "otp_mobile" || currentStep === "otp_email") &&
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
      return `${mins.toString().padStart(2, "0")}:${remainder.toString().padStart(2, "0")}`;
   };

 // Only the chosen method's identifier is sent, plus the other one when the
 // first is shared by more than one end user.
 const requestOtp = async (channel: OtpChannel) => {
 const mobile = `${countryCode}${mobileNumber.replace(/\s+/g, "")}`;
 const email = emailAddress.trim();
 const response = await apis.auth.requestOtp({
 channel,
 ...(channel === "sms" || needsBoth ? { mobile } : {}),
 ...(channel === "email" || needsBoth ? { email } : {}),
 });
 setChallengeId(response.challenge_id);
 setSentTo(response.sent_to);
 setDevOtp(response.dev_otp ||"");
 setOtpDigits(["","","","","",""]);
 startOtpTimer();
 };

 const handleOtpRequest = (channel: OtpChannel) => async (e: React.FormEvent) => {
 e.preventDefault();
 setErrorMessage("");
 setLoading(true);
 try {
 await requestOtp(channel);
 setCurrentStep(channel ==="sms" ?"otp_mobile" :"otp_email");
 } catch (err) {
 if (err instanceof ApiError && err.status === 409) setNeedsBoth(true);
 setErrorMessage((err as Error).message ||"Could not send verification code.");
 } finally {
 setLoading(false);
 }
 };

 // Picking a login method asks for just that identifier again.
 const chooseMethod = (step: AuthScreenStep) => {
 setErrorMessage("");
 setNeedsBoth(false);
 setCurrentStep(step);
 };

 // Resend OTP
 const handleResendOtp = async () => {
 if (!canResend && timerSeconds > 0) return;
 setLoading(true);
 setErrorMessage("");
 try {
 await requestOtp(currentStep ==="otp_email" ?"email" :"sms");
 } catch (err) {
 setErrorMessage((err as Error).message ||"Could not resend code.");
 } finally {
 setLoading(false);
 }
 };

   // Handle individual OTP digit input
   const handleOtpDigitChange = (index: number, value: string) => {
      if (value.length > 1) {
         const pasted = value.replace(/\D/g, "").slice(0, 6);
         if (pasted.length > 0) {
            const nextDigits = [...otpDigits];
            for (let i = 0; i < 6; i++) {
               nextDigits[i] = pasted[i] || "";
            }
            setOtpDigits(nextDigits);
            const nextFocusIndex = Math.min(pasted.length, 5);
            otpInputRefs.current[nextFocusIndex]?.focus();
         }
         return;
      }

      const singleVal = value.replace(/\D/g, "");
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
      if (e.key === "Backspace" && !otpDigits[index] && index > 0) {
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

 try {
 const response = await apis.auth.verifyOtp({
 challenge_id: challengeId,
 otp: code,
 });
 saveSession(response);
 setTimeout(() => {
 router.push("/dashboard");
 }, 1600);
 } catch (err) {
 setTimeout(() => {
 setCurrentStep(
 currentStep ==="otp_email" ?"otp_email" :"otp_mobile",
 );
 setErrorMessage((err as Error).message ||"Invalid verification code.");
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
                  <div className="fixed top-6 left-1/2 -translate-x-1/2 z-[100] w-[90%] max-w-[360px] bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-2xl shadow-lg flex justify-between items-center animate-in fade-in slide-in-from-top-4">
                     <div className="flex items-center gap-2">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 8v4"/><path d="M12 16h.01"/></svg>
                        <span className="text-[14px] font-semibold">{errorMessage}</span>
                     </div>
                     <button
                        type="button"
                        onClick={() => setErrorMessage("")}
                        className="text-red-400 hover:text-red-600 p-1 bg-transparent rounded-full hover:bg-red-100 transition-colors"
                     >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6L6 18M6 6l12 12"/></svg>
                     </button>
                  </div>
               )}

               {/* ========================================================
 SCREEN 1: WELCOME & METHOD SELECTION
 ======================================================== */}
               {currentStep === "welcome" && (
                  <div className="relative w-full h-full min-h-screen bg-[#f0f9ff] font-sans flex flex-col overflow-hidden">
                     {/* Background Image Area */}
                     <div className="absolute top-0 left-0 w-full h-[70vh] z-0 pointer-events-none">
                        <img src="/images/hero_worker_1790310873345.jpg" alt="City worker background" className="w-full h-full object-cover object-bottom" />
                     </div>

                     {/* Top Bar & Content overlay */}
                     <div className="absolute top-0 left-0 w-full z-10 flex flex-col px-6 pb-4">
                        <div className="flex justify-between items-start w-full relative">
                           <div className="flex-1 flex flex-col items-start">
                              <CivicLogo size={80} showText={false} idPrefix="welcome_logo_" />
                              <h1 className="text-[18px] font-bold text-[#0f172a] mt-[-28px] ml-2 tracking-tight">Civic<span className="text-[#0284c7]">Care</span></h1>
                           </div>

                        </div>

                        {/* Text Content */}

                     </div>

                     {/* Spacer to push card to bottom */}
                     <div className="flex-1" />

                     {/* Bottom Login Card */}
                     <div className="relative z-20 w-full bg-white rounded-t-[32px] px-6 pt-12 pb-32 shadow-[0_-4px_24px_rgba(0,0,0,0.06)] mt-auto flex-shrink-0 flex flex-col items-center">
                        <div className="w-full max-w-[400px]">
                           <h3 className="text-[18px] font-bold text-[#0f172a] mb-5">Login with</h3>

                           <div className="flex flex-col gap-4">
                              <button
                                 type="button"
                                 className="w-full flex items-center justify-between bg-white border border-[#bae6fd] hover:bg-[#f0f9ff] rounded-full p-2 pr-5 transition-transform active:scale-[0.98] h-[64px]"
                                 onClick={() => chooseMethod("mobile_login")}
                              >
                                 <div className="flex items-center gap-2 overflow-hidden pl-1">
                                    <div className="w-12 h-12 shrink-0 rounded-full bg-[#e0f2fe] flex items-center justify-center">
                                       <SmartphoneIcon size={20} color="#0284c7" />
                                    </div>
                                    <span className="text-[#0f172a] text-[14px] font-semibold whitespace-nowrap truncate">Continue with Mobile Number</span>
                                 </div>
                                 <ChevronRightIcon size={18} color="#0284c7" className="shrink-0" />
                              </button>

                              <button
                                 type="button"
                                 className="w-full flex items-center justify-between bg-white border border-[#e9d5ff] hover:bg-[#faf5ff] rounded-full p-2 pr-5 transition-transform active:scale-[0.98] h-[64px]"
                                 onClick={() => chooseMethod("email_login")}
                              >
                                 <div className="flex items-center gap-2 overflow-hidden pl-1">
                                    <div className="w-12 h-12 shrink-0 rounded-full bg-[#f3e8ff] flex items-center justify-center">
                                       <MailEnvelopeIcon size={20} color="#9333ea" />
                                    </div>
                                    <span className="text-[#0f172a] text-[14px] font-semibold whitespace-nowrap truncate">Continue with Email Address</span>
                                 </div>
                                 <ChevronRightIcon size={18} color="#9333ea" className="shrink-0" />
                              </button>
                           </div>
                        </div>
                     </div>
                  </div>
               )}

               {/* ========================================================
 SCREEN 2: LOGIN WITH MOBILE NUMBER
 ======================================================== */}
               {currentStep === "mobile_login" && (
                  <div className="relative w-full h-full min-h-screen bg-[#f4f7f9] font-sans flex flex-col items-center">
                     {/* Decorative background wavy wave */}
                     <div className="absolute bottom-0 left-0 w-full z-0 overflow-hidden pointer-events-none">
                        <svg viewBox="0 0 375 140" className="w-full h-auto block" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg">
                           <path fill="#e0f2fe" d="M0,80 Q90,10 190,60 T375,40 L375,140 L0,140 Z" />
                           <path fill="#bae6fd" opacity="0.4" d="M0,110 Q140,50 250,100 T375,80 L375,140 L0,140 Z" />
                        </svg>
                     </div>

                     <div className="w-full max-w-[400px] flex flex-col px-6 pt-6 pb-4 relative z-10 flex-1">
                        
                        {/* Top Navigation */}
                        <div className="w-full flex justify-start mb-2">
                           <button
                              type="button"
                              onClick={() => chooseMethod("welcome")}
                              className="w-[42px] h-[42px] bg-white rounded-full flex items-center justify-center shadow-[0_2px_8px_rgba(0,0,0,0.06)] transition-transform active:scale-95"
                           >
                              <ChevronLeftIcon size={20} color="#0f172a" />
                           </button>
                        </div>

                        {/* Illustration */}
                        <div className="flex justify-center -mt-2 mb-2">
                           <img src="/images/mobile_icon_cloud_1790310888070.jpg" alt="Mobile illustration" className="w-[180px] h-[180px] object-cover mix-blend-multiply [mask-image:radial-gradient(circle,black_50%,transparent_70%)]" />
                        </div>

 {/* Screen Title & Subtitle */}
 <div className="auth-header-block centered">
 <h3 className="auth-title">Login with Mobile Number</h3>
 <p className="auth-subtitle">
 Enter your registered mobile number.
 We&apos;ll text you a verification code.
 </p>
 </div>

 {/* Mobile Input Form */}
 <form onSubmit={handleOtpRequest("sms")} className="auth-form">
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

 {/* Only asked for when this number is shared by more than one end user */}
 {needsBoth && (
 <div className="email-input-wrapper">
 <span className="input-prefix-icon">
 <MailEnvelopeIcon size={18} color="#64748b" />
 </span>
 <input
 type="email"
 className="auth-text-input with-prefix"
 value={emailAddress}
 onChange={(e) => setEmailAddress(e.target.value)}
 placeholder="Registered email address"
 required
 />
 </div>
 )}

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

                        {/* Divider */}
                        <div className="flex items-center w-full my-5">
                           <div className="flex-1 h-[1px] bg-[#cbd5e1]"></div>
                           <span className="px-4 text-[14px] font-bold text-[#0f172a]">or</span>
                           <div className="flex-1 h-[1px] bg-[#cbd5e1]"></div>
                        </div>

 {/* Switch to Email Button */}
 <button
 type="button"
 className="secondary-action-btn"
 onClick={() => chooseMethod("email_login")}
 >
 <MailEnvelopeIcon size={18} color="#059669" />
 <span>Get the code by email instead</span>
 </button>

                     </div>
                  </div>
               )}

               {/* ========================================================
 SCREEN 3: LOGIN WITH EMAIL ADDRESS
 ======================================================== */}
               {currentStep === "email_login" && (
                  <div className="relative w-full h-full min-h-screen bg-[#f4f7f9] font-sans flex flex-col items-center">
                     {/* Decorative background wavy wave */}
                     <div className="absolute bottom-0 left-0 w-full z-0 overflow-hidden pointer-events-none">
                        <svg viewBox="0 0 375 140" className="w-full h-auto block" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg">
                           <path fill="#e0f2fe" d="M0,80 Q90,10 190,60 T375,40 L375,140 L0,140 Z" />
                           <path fill="#bae6fd" opacity="0.4" d="M0,110 Q140,50 250,100 T375,80 L375,140 L0,140 Z" />
                        </svg>
                     </div>

                     <div className="w-full max-w-[400px] flex flex-col px-6 pt-6 pb-4 relative z-10 flex-1">
                        
                        {/* Top Navigation */}
                        <div className="w-full flex justify-start mb-2">
                           <button
                              type="button"
                              onClick={() => chooseMethod("welcome")}
                              className="w-[40px] h-[40px] bg-white rounded-full flex items-center justify-center shadow-[0_2px_8px_rgba(0,0,0,0.06)] transition-transform active:scale-95"
                           >
                              <ChevronLeftIcon size={20} color="#0f172a" />
                           </button>
                        </div>

                        {/* Illustration */}
                        <div className="flex justify-center -mt-2 mb-2">
                           <img src="/images/email_icon_cloud_1790310901967.jpg" alt="Email illustration" className="w-[180px] h-[180px] object-cover mix-blend-multiply [mask-image:radial-gradient(circle,black_50%,transparent_70%)]" />
                        </div>

 {/* Screen Title & Subtitle */}
 <div className="auth-header-block centered">
 <h3 className="auth-title">Login with Email Address</h3>
 <p className="auth-subtitle">
 Enter your registered email address.
 We&apos;ll email you a verification code.
 </p>
 </div>

 {/* Email Form */}
 <form onSubmit={handleOtpRequest("email")} className="auth-form">
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

 {/* Only asked for when this email is shared by more than one end user */}
 {needsBoth && (
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
 )}

                           {/* Submit Button */}
                           <button 
                              type="submit" 
                              disabled={loading}
                              className="w-full h-[56px] bg-[#1877f2] text-white rounded-2xl flex items-center justify-center gap-2 font-semibold text-[16px] hover:bg-[#166fe5] transition-all active:scale-[0.98] disabled:opacity-70 shadow-sm"
                           >
                              {loading ? "Sending..." : "Send OTP"}
                              <ArrowRightIcon size={18} color="#ffffff" />
                           </button>
                        </form>

                        {/* Divider */}
                        <div className="flex items-center w-full my-5">
                           <div className="flex-1 h-[1px] bg-[#cbd5e1]"></div>
                           <span className="px-4 text-[14px] font-bold text-[#0f172a]">or</span>
                           <div className="flex-1 h-[1px] bg-[#cbd5e1]"></div>
                        </div>

 {/* Switch to Mobile Button */}
 <button
 type="button"
 className="secondary-action-btn"
 onClick={() => chooseMethod("mobile_login")}
 >
 <SmartphoneIcon size={18} color="#3b82f6" />
 <span>Get the code by SMS instead</span>
 </button>

                     </div>
                  </div>
               )}

               {/* ========================================================
 SCREEN 4 & 5: OTP VERIFICATION (MOBILE & EMAIL)
 ======================================================== */}
               {(currentStep === "otp_mobile" || currentStep === "otp_email") && (
                  <div className="relative w-full h-full min-h-screen bg-[#f4f7f9] font-sans flex flex-col items-center">
                     {/* Decorative background wavy wave */}
                     <div className="absolute bottom-0 left-0 w-full z-0 overflow-hidden pointer-events-none">
                        <svg viewBox="0 0 375 140" className="w-full h-auto block" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg">
                           <path fill="#e0f2fe" d="M0,80 Q90,10 190,60 T375,40 L375,140 L0,140 Z" />
                           <path fill="#bae6fd" opacity="0.4" d="M0,110 Q140,50 250,100 T375,80 L375,140 L0,140 Z" />
                        </svg>
                     </div>

                     <div className="w-full max-w-[400px] flex flex-col px-6 pt-6 pb-4 relative z-10 flex-1">
                        {/* Top Navigation */}
                        <div className="w-full flex justify-start mb-6">
                           <button
                              type="button"
                              onClick={() => {
                                 setErrorMessage("");
                                 setCurrentStep(
                                    currentStep === "otp_email"
                                       ? "email_login"
                                       : "mobile_login",
                                 );
                              }}
                              className="w-[40px] h-[40px] bg-white rounded-full flex items-center justify-center shadow-[0_2px_8px_rgba(0,0,0,0.06)] transition-transform active:scale-95"
                           >
                              <ChevronLeftIcon size={20} color="#0f172a" />
                           </button>
                        </div>

                        {/* Illustration */}
                        <div className="flex justify-center -mt-6 mb-2">
                           <img 
                              src={currentStep === "otp_email" ? "/images/email_icon_cloud_1790310901967.jpg" : "/images/mobile_icon_cloud_1790310888070.jpg"} 
                              alt="OTP illustration" 
                              className="w-[160px] h-[160px] object-cover mix-blend-multiply [mask-image:radial-gradient(circle,black_50%,transparent_70%)]" 
                           />
                        </div>

 {/* Screen Title & Subtitle */}
 <div className="auth-header-block centered">
 <h3 className="auth-title">Verify OTP</h3>
 <p className="auth-subtitle">
 We have sent a 6-digit code to{""}
 <strong className="highlight-target">
 {sentTo}
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
                        <form onSubmit={handleVerifyOtp} className="flex flex-col flex-1">
                           {/* 6 Digit Inputs */}
                           <div className="flex justify-between items-center w-full mb-8 gap-2 px-2">
                              {otpDigits.map((digit, index) => (
                                 <input
                                    key={`otp-box-${index}`}
                                    ref={(el) => {
                                       otpInputRefs.current[index] = el;
                                    }}
                                    type="text"
                                    inputMode="numeric"
                                    maxLength={1}
                                    className="flex-1 min-w-0 max-w-[50px] h-[56px] text-center text-[22px] font-bold text-[#0f172a] bg-white border border-[#bae6fd] rounded-xl outline-none focus:border-[#1877f2] focus:ring-2 focus:ring-[#1877f2]/20 transition-all shadow-sm p-0"
                                    value={digit}
                                    onChange={(e) =>
                                       handleOtpDigitChange(index, e.target.value)
                                    }
                                    onKeyDown={(e) => handleOtpKeyDown(index, e)}
                                 />
                              ))}
                           </div>

                           {/* Resend OTP Row */}
                           <div className="flex justify-center items-center w-full mb-8 text-[14px]">
                              <span className="text-[#475569] mr-1">
                                 Didn't receive the code?
                              </span>
                              {timerSeconds > 0 ? (
                                 <div className="flex items-center gap-1">
                                    <span className="text-[#1877f2] font-bold">Resend OTP</span>
                                    <span className="text-[#64748b]">({formatTimer(timerSeconds)})</span>
                                 </div>
                              ) : (
                                 <button
                                    type="button"
                                    className="text-[#1877f2] font-bold hover:underline"
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
                              className="w-full h-[56px] bg-[#1877f2] text-white rounded-2xl flex items-center justify-center gap-2 font-semibold text-[16px] hover:bg-[#166fe5] transition-all active:scale-[0.98] disabled:opacity-70 shadow-sm"
                              disabled={loading}
                           >
                              <span>{loading ? "Checking..." : "Verify & Login"}</span>
                              <ArrowRightIcon size={18} color="#ffffff" />
                           </button>

                           {/* Spacer */}
                           <div className="flex-1"></div>

                           {/* Footer text */}
                           <div className="flex justify-center items-center gap-2 mt-6 pb-2">
                              <ShieldCheckIcon size={18} color="#2563eb" />
                              <span className="text-[13px] text-[#475569] font-medium">Your information is secure with us</span>
                           </div>
                        </form>
                     </div>
                  </div>
               )}

               {/* ========================================================
 SCREEN 6: VERIFYING DETAILS LOADER
 ======================================================== */}
               {currentStep === "verifying" && (
                  <div className="relative w-full h-full min-h-screen bg-[#f4f7f9] font-sans flex flex-col items-center">
                     {/* Decorative background wavy wave */}
                     <div className="absolute bottom-0 left-0 w-full z-0 overflow-hidden pointer-events-none">
                        <svg viewBox="0 0 375 140" className="w-full h-auto block" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg">
                           <path fill="#e0f2fe" d="M0,80 Q90,10 190,60 T375,40 L375,140 L0,140 Z" />
                           <path fill="#bae6fd" opacity="0.4" d="M0,110 Q140,50 250,100 T375,80 L375,140 L0,140 Z" />
                        </svg>
                     </div>

                     <div className="w-full max-w-[400px] flex flex-col px-6 pt-6 pb-4 relative z-10 flex-1">
                        {/* Top Navigation */}
                        <div className="w-full flex justify-start mb-12">
                           <button
                              type="button"
                              onClick={() => {
                                 setCurrentStep(emailAddress ? "otp_email" : "otp_mobile");
                              }}
                              className="w-[40px] h-[40px] bg-white rounded-full flex items-center justify-center shadow-[0_2px_8px_rgba(0,0,0,0.06)] transition-transform active:scale-95"
                           >
                              <ChevronLeftIcon size={20} color="#0f172a" />
                           </button>
                        </div>

                        {/* Center Content */}
                        <div className="flex-1 flex flex-col items-center pt-8">
                           {/* Custom Gradient Spinner */}
                           <svg className="animate-spin w-[110px] h-[110px] mb-10" viewBox="0 0 100 100">
                              <defs>
                                 <linearGradient id="spin-grad" x1="0%" y1="0%" x2="100%" y2="100%">
                                    <stop offset="0%" stopColor="#1877f2" />
                                    <stop offset="100%" stopColor="#bae6fd" />
                                 </linearGradient>
                              </defs>
                              <circle cx="50" cy="50" r="42" stroke="#e0f2fe" strokeWidth="10" fill="none" />
                              <circle cx="50" cy="50" r="42" stroke="url(#spin-grad)" strokeWidth="10" fill="none" strokeLinecap="round" strokeDasharray="160 264" />
                           </svg>

                           <h2 className="text-[26px] font-bold text-[#1e293b] mb-4 tracking-tight text-center">Verifying your details...</h2>
                           
                           <p className="text-[17px] text-[#3b82f6] text-center max-w-[260px] leading-relaxed mb-12 font-medium">
                              Please wait while we securely<br/>log you in.
                           </p>

                           {/* Security Card */}
                           <div className="w-full bg-[#e0f2fe] rounded-[24px] p-6 flex items-center justify-center gap-4">
                              <svg width="28" height="28" viewBox="0 0 24 24" fill="#1877f2" xmlns="http://www.w3.org/2000/svg" className="flex-shrink-0">
                                 <path d="M12 22C12 22 20 18 20 12V5L12 2L4 5V12C4 18 12 22 12 22Z" />
                                 <path d="M9 12L11 14L15 10" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>
                              </svg>
                              <div className="flex flex-col text-left">
                                 <span className="text-[15px] font-semibold text-[#0369a1] mb-0.5">This won't take long.</span>
                                 <span className="text-[14px] text-[#0369a1]">Your data is safe with us.</span>
                              </div>
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
