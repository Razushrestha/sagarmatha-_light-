"use client";

import { useRef, useState } from "react";
import { Camera, ImagePlus, SwitchCamera, X } from "lucide-react";
import { productAPI } from "@/lib/api";
import { getImageUrl } from "@/lib/utils";
import { cn } from "@/lib/utils";
import toast from "react-hot-toast";

interface ImageUploadProps {
  images: string[];
  onChange: (images: string[]) => void;
  maxImages?: number;
  compact?: boolean;
}

export default function ImageUpload({ images, onChange, maxImages = 4, compact }: ImageUploadProps) {
  const galleryRef = useRef<HTMLInputElement>(null);
  const cameraFileRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [uploading, setUploading] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [facingMode, setFacingMode] = useState<"environment" | "user">("environment");
  const sizeClass = compact ? "w-20 h-20" : "w-24 h-24";

  const stopCamera = () => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  };

  const closeCamera = () => {
    stopCamera();
    setCameraOpen(false);
  };

  const startCamera = async (mode: "environment" | "user" = facingMode) => {
    if (!navigator.mediaDevices?.getUserMedia) {
      cameraFileRef.current?.click();
      return;
    }
    stopCamera();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: mode }, width: { ideal: 1280 }, height: { ideal: 1280 } },
        audio: false,
      });
      streamRef.current = stream;
      setFacingMode(mode);
      setCameraOpen(true);
      requestAnimationFrame(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play().catch(() => {});
        }
      });
    } catch {
      cameraFileRef.current?.click();
    }
  };

  const switchCamera = () => {
    const next = facingMode === "environment" ? "user" : "environment";
    startCamera(next);
  };

  const handleFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    if (images.length >= maxImages) {
      toast.error(`Maximum ${maxImages} images allowed`);
      return;
    }

    setUploading(true);
    const uploaded: string[] = [];

    try {
      for (const file of Array.from(files)) {
        if (images.length + uploaded.length >= maxImages) break;
        if (!file.type.startsWith("image/")) {
          toast.error(`${file.name} is not an image`);
          continue;
        }
        if (file.size > 5 * 1024 * 1024) {
          toast.error(`${file.name} exceeds 5MB limit`);
          continue;
        }
        const res = await productAPI.uploadImage(file);
        uploaded.push(res.data.data.url);
      }
      if (uploaded.length) {
        onChange([...images, ...uploaded]);
        toast.success("Photo uploaded");
      }
    } catch (err: unknown) {
      const error = err as { response?: { data?: { message?: string } } };
      toast.error(error.response?.data?.message || "Image upload failed");
    } finally {
      setUploading(false);
      if (galleryRef.current) galleryRef.current.value = "";
      if (cameraFileRef.current) cameraFileRef.current.value = "";
    }
  };

  const capturePhoto = async () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || video.videoWidth === 0) {
      toast.error("Camera is not ready yet");
      return;
    }
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0);
    canvas.toBlob(async (blob) => {
      if (!blob) {
        toast.error("Could not capture photo");
        return;
      }
      const file = new File([blob], `product-${Date.now()}.jpg`, { type: "image/jpeg" });
      const transfer = new DataTransfer();
      transfer.items.add(file);
      closeCamera();
      await handleFiles(transfer.files);
    }, "image/jpeg", 0.9);
  };

  const removeImage = (index: number) => {
    onChange(images.filter((_, i) => i !== index));
  };

  const canAdd = images.length < maxImages;

  return (
    <div>
      <div className={cn("flex flex-wrap gap-2", compact && "gap-2")}>
        {images.map((img, i) => (
          <div key={`${img}-${i}`} className={cn("relative rounded-md border border-brand-200 overflow-hidden bg-brand-50", sizeClass)}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={getImageUrl(img)} alt={`Product ${i + 1}`} className="w-full h-full object-cover" />
            <button
              type="button"
              onClick={() => removeImage(i)}
              className="absolute top-0.5 right-0.5 p-0.5 rounded bg-white/95 border border-brand-200 text-brand-700 hover:bg-white"
            >
              <X className="w-3 h-3" strokeWidth={1.75} />
            </button>
          </div>
        ))}

        {canAdd && (
          <>
            <button
              type="button"
              onClick={() => startCamera("environment")}
              disabled={uploading}
              className={cn(
                "rounded-md border border-dashed border-brand-300 bg-brand-50 flex flex-col items-center justify-center gap-1 text-brand-500 hover:border-brand-400 hover:bg-white transition-colors disabled:opacity-50",
                sizeClass
              )}
            >
              <Camera className={cn(compact ? "w-5 h-5" : "w-6 h-6")} strokeWidth={1.75} />
              <span className="text-[10px] font-medium leading-tight text-center px-1">
                {uploading ? "..." : "Camera"}
              </span>
            </button>
            <button
              type="button"
              onClick={() => galleryRef.current?.click()}
              disabled={uploading}
              className={cn(
                "rounded-md border border-dashed border-brand-300 bg-brand-50 flex flex-col items-center justify-center gap-1 text-brand-500 hover:border-brand-400 hover:bg-white transition-colors disabled:opacity-50",
                sizeClass
              )}
            >
              <ImagePlus className={cn(compact ? "w-5 h-5" : "w-6 h-6")} strokeWidth={1.75} />
              <span className="text-[10px] font-medium leading-tight text-center px-1">
                {uploading ? "..." : "Gallery"}
              </span>
            </button>
          </>
        )}
      </div>

      <input
        ref={galleryRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => handleFiles(e.target.files)}
      />
      <input
        ref={cameraFileRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => handleFiles(e.target.files)}
      />
      <canvas ref={canvasRef} className="hidden" />

      {cameraOpen && (
        <div className="fixed inset-0 z-[60] bg-black/80 flex flex-col">
          <div className="flex items-center justify-between px-4 py-3 text-white pt-[max(0.75rem,env(safe-area-inset-top))]">
            <p className="text-sm font-medium">Take product photo</p>
            <button type="button" onClick={closeCamera} className="p-2 rounded-lg bg-white/10">
              <X className="w-5 h-5" />
            </button>
          </div>
          <div className="flex-1 flex items-center justify-center px-3 min-h-0">
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="max-h-full max-w-full rounded-xl bg-black object-cover"
            />
          </div>
          <div className="flex items-center justify-center gap-8 px-4 py-6 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
            <button
              type="button"
              onClick={switchCamera}
              className="w-12 h-12 rounded-full bg-white/15 text-white flex items-center justify-center"
              aria-label="Switch camera"
            >
              <SwitchCamera className="w-5 h-5" />
            </button>
            <button
              type="button"
              onClick={capturePhoto}
              className="w-16 h-16 rounded-full bg-white border-4 border-brand-200 shadow-lg"
              aria-label="Capture photo"
            />
            <button
              type="button"
              onClick={closeCamera}
              className="w-12 h-12 rounded-full bg-white/15 text-white text-xs font-medium"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {!compact && (
        <p className="text-[11px] text-brand-400 mt-1.5">Camera or gallery · JPG, PNG, WEBP · Max 5MB · Up to {maxImages}</p>
      )}
    </div>
  );
}
