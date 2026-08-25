"use client";

import { useRef, useState } from "react";
import { ImagePlus, X } from "lucide-react";
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
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const sizeClass = compact ? "w-20 h-20" : "w-24 h-24";

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
      if (uploaded.length) onChange([...images, ...uploaded]);
    } catch (err: unknown) {
      const error = err as { response?: { data?: { message?: string } } };
      toast.error(error.response?.data?.message || "Image upload failed");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const removeImage = (index: number) => {
    onChange(images.filter((_, i) => i !== index));
  };

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

        {images.length < maxImages && (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={uploading}
            className={cn(
              "rounded-md border border-dashed border-brand-300 bg-brand-50 flex flex-col items-center justify-center gap-1 text-brand-500 hover:border-brand-400 hover:bg-white transition-colors disabled:opacity-50",
              sizeClass
            )}
          >
            <ImagePlus className={cn(compact ? "w-5 h-5" : "w-6 h-6")} strokeWidth={1.75} />
            <span className="text-[10px] font-medium leading-tight text-center px-1">
              {uploading ? "..." : "Add"}
            </span>
          </button>
        )}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        multiple
        className="hidden"
        onChange={(e) => handleFiles(e.target.files)}
      />

      {!compact && (
        <p className="text-[11px] text-brand-400 mt-1.5">JPG, PNG, WEBP or GIF · Max 5MB · Up to {maxImages}</p>
      )}
    </div>
  );
}
