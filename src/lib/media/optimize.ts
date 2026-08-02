import sharp from "sharp";

export const MEDIA_LIMITS = {
  avatar: { maxBytes: 500_000, width: 512, height: 512 },
  logo: { maxBytes: 500_000, width: 1_024, height: 1_024 },
  banner: { maxBytes: 1_500_000, width: 1_920, height: 640 },
} as const;

export class MediaValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MediaValidationError";
  }
}

export async function optimizeImage(file: File, kind: keyof typeof MEDIA_LIMITS) {
  if (!(file.type === "image/png" || file.type === "image/jpeg" || file.type === "image/webp")) throw new MediaValidationError("Use a PNG, JPEG or WebP image.");
  if (file.size > 4_000_000) throw new MediaValidationError("The original image must be 4 MB or smaller.");
  const limit = MEDIA_LIMITS[kind];
  const source = Buffer.from(await file.arrayBuffer());
  const isPng = source.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  const isJpeg = source[0] === 0xff && source[1] === 0xd8 && source[2] === 0xff;
  const isWebp = source.subarray(0, 4).toString("ascii") === "RIFF" && source.subarray(8, 12).toString("ascii") === "WEBP";
  if ((file.type === "image/png" && !isPng) || (file.type === "image/jpeg" && !isJpeg) || (file.type === "image/webp" && !isWebp)) throw new MediaValidationError("El contenido de la imagen no coincide con su tipo.");
  let quality = 82;
  let output;
  try {
    const metadata = await sharp(source).metadata();
    if (!metadata.width || !metadata.height || metadata.width < 1 || metadata.height < 1 || metadata.width > 10_000 || metadata.height > 10_000) throw new MediaValidationError("Las dimensiones de la imagen no son válidas.");
    output = await sharp(source)
    .rotate()
    .resize({ width: limit.width, height: limit.height, fit: kind === "logo" ? "inside" : "cover", withoutEnlargement: true })
    .webp({ quality, effort: 4 })
    .toBuffer({ resolveWithObject: true });
  } catch (error) {
    if (error instanceof MediaValidationError) throw error;
    throw new MediaValidationError("La imagen está dañada o no se puede procesar.");
  }
  while (output.data.byteLength > limit.maxBytes && quality > 55) {
    quality -= 7;
    output = await sharp(source)
      .rotate()
      .resize({ width: limit.width, height: limit.height, fit: kind === "logo" ? "inside" : "cover", withoutEnlargement: true })
      .webp({ quality, effort: 4 })
      .toBuffer({ resolveWithObject: true });
  }
  if (output.data.byteLength > limit.maxBytes) throw new MediaValidationError("The optimized image is too large for this plan.");
  return { body: output.data, contentType: "image/webp", bytes: output.data.byteLength, width: output.info.width, height: output.info.height };
}
