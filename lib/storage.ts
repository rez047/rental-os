import { createServiceClient } from "./supabase-server";

export async function uploadPrivateFile(
  userId: string,
  folder: string,
  file: File
): Promise<{ path: string; signedUrl: string }> {
  const supabase = createServiceClient();
  const ext = file.name.split(".").pop() || "bin";
  const path = `${userId}/${folder}/${crypto.randomUUID()}.${ext}`;

  const { error } = await supabase.storage
    .from("private-files")
    .upload(path, file, { contentType: file.type, upsert: false });

  if (error) throw error;

  const { data } = await supabase.storage
    .from("private-files")
    .createSignedUrl(path, 60 * 60 * 24 * 365); // 1 year

  return { path, signedUrl: data!.signedUrl };
}

export async function getSignedUrl(path: string): Promise<string> {
  const supabase = createServiceClient();
  const { data } = await supabase.storage
    .from("private-files")
    .createSignedUrl(path, 60 * 60); // 1 hour
  return data!.signedUrl;
}