"use client";

import { useRef, useState, useTransition } from "react";
import { Camera } from "lucide-react";
import { removeAvatar, updateAvatar } from "@/app/(app)/profil/avatar-actions";
import { Avatar } from "@/components/ui/Avatar";
import { useToast } from "@/components/ui/Toast";
import { AvatarCropper } from "./AvatarCropper";

/** Photo de profil : tap sur l'avatar, recadrage carré et réduction sur l'appareil, envoi. */
export function AvatarUploader({ name, avatarKey }: { name: string; avatarKey: string | null }) {
  const [key, setKey] = useState(avatarKey);
  const [cropping, setCropping] = useState<File | null>(null);
  const [pending, start] = useTransition();
  const input = useRef<HTMLInputElement>(null);
  const toast = useToast();

  async function onFile(file: File) {
    // Recadrage au doigt si l'appareil sait afficher l'image, sinon recadrage centré
    if (typeof createImageBitmap === "function") {
      setCropping(file);
      return;
    }
    await upload(file);
  }
  async function upload(source: Blob) {
    let blob: Blob = source;
    if (source instanceof File) {
      try {
        blob = await squareCrop(source, 512);
      } catch {
        /* navigateur sans canvas : le serveur recadrera */
      }
    }
    const fd = new FormData();
    fd.append("avatar", blob, "avatar.jpg");
    start(async () => {
      const r = await updateAvatar(fd);
      if (!r.ok) {
        toast(r.error);
        return;
      }
      setKey(r.avatar_key);
      toast("Photo de profil mise à jour");
    });
  }

  return (
    <div className="flex flex-col items-center gap-1">
      <button
        type="button"
        onClick={() => input.current?.click()}
        disabled={pending}
        aria-label={key ? "Changer la photo de profil" : "Ajouter une photo de profil"}
        className="pressable relative"
      >
        <Avatar name={name} avatarKey={key} size="lg" />
        <span className="absolute -bottom-1 -right-1 flex h-7 w-7 items-center justify-center rounded-full bg-bg-2 text-text-1 ring-2 ring-bg-1">
          <Camera size={14} strokeWidth={1.75} aria-hidden="true" />
        </span>
        {pending && <span className="absolute inset-0 rounded-full bg-black/50" aria-hidden="true" />}
      </button>
      {key && (
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            start(async () => {
              const r = await removeAvatar();
              if (!r.ok) toast(r.error);
              else setKey(null);
            })
          }
          className="text-[12px] text-text-3 hover:text-text-1"
        >
          Retirer
        </button>
      )}
      <AvatarCropper
        file={cropping}
        onCancel={() => setCropping(null)}
        onDone={(blob) => {
          setCropping(null);
          void upload(blob);
        }}
      />
      <input
        ref={input}
        type="file"
        accept="image/*"
        className="sr-only"
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (f) onFile(f);
        }}
      />
    </div>
  );
}

/** Recadrage carré centré + réduction, en JPEG, avant envoi. */
async function squareCrop(file: File, size: number): Promise<Blob> {
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" } as ImageBitmapOptions);
  const side = Math.min(bitmap.width, bitmap.height);
  const sx = (bitmap.width - side) / 2;
  const sy = (bitmap.height - side) / 2;
  const canvas = document.createElement("canvas");
  const out = Math.min(size, side);
  canvas.width = out;
  canvas.height = out;
  const ctx = canvas.getContext("2d", { alpha: false });
  if (!ctx) throw new Error("canvas");
  ctx.drawImage(bitmap, sx, sy, side, side, 0, 0, out, out);
  bitmap.close();
  const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", 0.88));
  if (!blob) throw new Error("toBlob");
  return blob;
}
