import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_ANON_KEY!
);

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { token, phone } = req.body;

  if (!token || !phone) {
    return res.status(400).json({ error: "token and phone required" });
  }

  // 1️⃣ cek token yang belum dipakai
  const { data, error } = await supabase
    .from("tokens")
    .select("id")
    .eq("token", token)
    .eq("phone", phone)
    .eq("used", false)
    .single();

  if (error || !data) {
    return res.status(401).json({ error: "invalid or used token" });
  }

  // 2️⃣ tandai token sebagai used
  await supabase
    .from("tokens")
    .update({
      used: true,
      used_at: new Date().toISOString(),
    })
    .eq("id", data.id);

  return res.status(200).json({ ok: true });
}
