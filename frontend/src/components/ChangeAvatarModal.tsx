/* eslint-disable @next/next/no-img-element */
"use client";

import React, { useRef, useState } from "react";
import { Camera, Loader2, Trash2, Upload } from "lucide-react";
import { api, resolveAvatarUrl } from "@/lib/api";
import { initials } from "@/lib/format";
import { useSession } from "@/lib/session";
import { ErrorBanner, Modal, primaryButtonClass, secondaryButtonClass, dangerButtonClass } from "./ui";

const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];

export function ChangeAvatarModal({ onClose }: { onClose: () => void }) {
  const { me, setMe } = useSession();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFile = (file: File) => {
    if (!ALLOWED_TYPES.includes(file.type)) {
      setError("Please select a valid image file (PNG, JPEG, or WebP).");
      return;
    }
    if (file.size > MAX_BYTES) {
      setError("Image size must be less than 5MB.");
      return;
    }
    setError(null);
    setSelectedFile(file);
    const objectUrl = URL.createObjectURL(file);
    setPreviewUrl(objectUrl);
  };

  const onFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  };

  const handleUpload = async () => {
    if (!selectedFile) return;
    setBusy(true);
    setError(null);
    try {
      const updated = await api.auth.uploadAvatar(selectedFile);
      setMe(updated);
      onClose();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async () => {
    setBusy(true);
    setError(null);
    try {
      const updated = await api.auth.deleteAvatar();
      setMe(updated);
      onClose();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const currentDisplayUrl = previewUrl || resolveAvatarUrl(me.avatar_url);

  return (
    <Modal
      title="Change profile photo"
      description="Upload a photo for your profile (PNG, JPEG, or WebP, up to 5MB)."
      onClose={onClose}
    >
      <div className="space-y-4 pt-1">
        <ErrorBanner message={error} />

        <div className="flex flex-col items-center justify-center gap-3 py-2">
          <div className="relative group">
            <div className="flex h-28 w-28 items-center justify-center rounded-2xl border-2 border-slate-200 bg-slate-100 text-3xl font-bold text-slate-700 shadow-sm overflow-hidden">
              {currentDisplayUrl ? (
                <img src={currentDisplayUrl} alt={me.name} className="h-full w-full object-cover" />
              ) : (
                initials(me.name)
              )}
            </div>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={busy}
              className="absolute -bottom-2 -right-2 flex h-9 w-9 items-center justify-center rounded-full bg-blue-600 text-white shadow-md hover:bg-blue-700 transition-transform active:scale-95 disabled:opacity-50 cursor-pointer"
              title="Select image"
              aria-label="Select image"
            >
              <Camera className="h-4 w-4" />
            </button>
          </div>

          <p className="text-[11px] text-slate-500 font-medium">
            {selectedFile ? selectedFile.name : me.avatar_url ? "Current profile photo" : "No photo uploaded yet"}
          </p>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="hidden"
          onChange={onFileInputChange}
        />

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3">
          <div>
            {me.avatar_url && !selectedFile && (
              <button type="button" onClick={handleDelete} disabled={busy} className={dangerButtonClass}>
                {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                Remove photo
              </button>
            )}
          </div>

          <div className="flex items-center gap-2 ml-auto">
            <button type="button" onClick={onClose} disabled={busy} className={secondaryButtonClass}>
              Cancel
            </button>
            {selectedFile ? (
              <button type="button" onClick={handleUpload} disabled={busy} className={primaryButtonClass}>
                {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                Save photo
              </button>
            ) : (
              <button type="button" onClick={() => fileInputRef.current?.click()} disabled={busy} className={primaryButtonClass}>
                <Camera className="w-3.5 h-3.5" />
                Choose photo
              </button>
            )}
          </div>
        </div>
      </div>
    </Modal>
  );
}
