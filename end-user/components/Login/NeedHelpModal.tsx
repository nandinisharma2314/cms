import React from"react";
import { CloseIcon, ShieldCheckIcon } from"./AuthIcons";

interface NeedHelpModalProps {
 isOpen: boolean;
 onClose: () => void;
}

export function NeedHelpModal({ isOpen, onClose }: NeedHelpModalProps) {
 if (!isOpen) return null;

 return (
 <div className="modal-backdrop" onClick={onClose}>
 <div className="modal-card" onClick={(e) => e.stopPropagation()}>
 <div className="modal-header">
 <div className="modal-title-row">
 <div className="modal-icon-badge">
 <ShieldCheckIcon size={20} color="#2563eb" />
 </div>
 <h3 className="modal-title">Help & Support</h3>
 </div>
 <button
 type="button"
 className="modal-close-btn"
 onClick={onClose}
 aria-label="Close"
 >
 <CloseIcon size={18} />
 </button>
 </div>

 <div className="modal-body">
 <p className="modal-text">
 Welcome to the{""}
 <strong>CivicCare Complaint Management Portal</strong>. Here is how
 you can access or report issues:
 </p>

 <div className="help-section">
 <h4 className="help-section-title">First Time Here?</h4>
 <p className="help-section-desc">
 Your mobile number or email must be pre-registered by your
 municipal administrative authority to receive OTP verification.
 </p>
 </div>

 <div className="help-section">
 <h4 className="help-section-title">
 Municipal Administrator Contact
 </h4>
 <ul className="help-contact-list">
 <li>
 <span className="contact-label">Email:</span>
 {""}
 <a href="mailto:admin@civiccare.org" className="contact-link">
 admin@civiccare.org
 </a>
 </li>
 <li>
 <span className="contact-label">Citizen Helpline:</span>
 {""}
 <span className="contact-value">
 1800-112-345 (Toll Free, 24/7)
 </span>
 </li>
 <li>
 <span className="contact-label">Working Hours:</span>
 {""}
 <span className="contact-value">
 Mon - Sat: 9:00 AM - 6:00 PM
 </span>
 </li>
 </ul>
 </div>

 <div className="help-tip-box">
 <p>
 💡 <strong>Tip:</strong> In development mode, the verification OTP
 is displayed directly in your server terminal logs.
 </p>
 </div>
 </div>

 <div className="modal-footer">
 <button
 type="button"
 className="primary-cta-btn"
 style={{
 width:"auto",
 padding:"10px 24px",
 height:"42px",
 fontSize:"14px",
 }}
 onClick={onClose}
 >
 Understood
 </button>
 </div>
 </div>
 </div>
 );
}
