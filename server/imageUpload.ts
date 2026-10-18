import { storagePut } from "./storage";

const allowedTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
const extensions: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

export async function uploadItemImage(input: { dataUrl: string; userId: number }) {
  const match = input.dataUrl.match(/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/);
  if (!match) throw new Error("اختر صورة بصيغة JPG أو PNG أو WEBP");
  const contentType = match[1];
  if (!allowedTypes.has(contentType)) throw new Error("نوع الصورة غير مدعوم");
  const data = Buffer.from(match[2], "base64");
  if (data.byteLength === 0 || data.byteLength > 5 * 1024 * 1024) {
    throw new Error("يجب ألا يزيد حجم الصورة على 5 ميغابايت");
  }
  return storagePut(`inventory-images/${input.userId}/${Date.now()}.${extensions[contentType]}`, data, contentType);
}

export async function uploadCompanyLogo(input: { dataUrl: string; userId: number }) {
  const match = input.dataUrl.match(/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/);
  if (!match) throw new Error("اختر شعاراً بصيغة JPG أو PNG أو WEBP");
  const contentType = match[1];
  if (!allowedTypes.has(contentType)) throw new Error("نوع الشعار غير مدعوم");
  const data = Buffer.from(match[2], "base64");
  if (data.byteLength === 0 || data.byteLength > 2 * 1024 * 1024) {
    throw new Error("يجب ألا يزيد حجم الشعار على 2 ميغابايت");
  }
  return storagePut(`company-branding/${input.userId}/${Date.now()}.${extensions[contentType]}`, data, contentType);
}

export async function uploadAccountingAttachment(input: { dataUrl: string; userId: number }) {
  const match = input.dataUrl.match(/^data:(application\/pdf|image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/);
  if (!match) throw new Error("اختر مرفقاً بصيغة PDF أو JPG أو PNG أو WEBP");
  const contentType = match[1];
  const extension = contentType === "application/pdf" ? "pdf" : extensions[contentType];
  const data = Buffer.from(match[2], "base64");
  if (data.byteLength === 0 || data.byteLength > 8 * 1024 * 1024)
    throw new Error("يجب ألا يزيد حجم المرفق على 8 ميغابايت");
  return storagePut(`accounting-attachments/${input.userId}/${Date.now()}.${extension}`, data, contentType);
}
