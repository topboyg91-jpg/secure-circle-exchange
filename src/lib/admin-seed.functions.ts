import { createServerFn } from "@tanstack/react-start";

const ADMIN_EMAIL = "topboyg91@gmail.com";
const ADMIN_PASSWORD = "zuwep123";

/**
 * Idempotently ensure the admin user exists and has the 'admin' role.
 * Called once from the /auth page before sign-in so there is no SQL step.
 */
export const ensureAdminSeeded = createServerFn({ method: "POST" }).handler(async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  // Find existing user by email
  let userId: string | null = null;
  const { data: list, error: listErr } = await supabaseAdmin.auth.admin.listUsers({ perPage: 200 });
  if (listErr) throw new Error(listErr.message);
  const existing = list.users.find((u) => u.email?.toLowerCase() === ADMIN_EMAIL);
  if (existing) {
    userId = existing.id;
  } else {
    const { data: created, error: createErr } = await supabaseAdmin.auth.admin.createUser({
      email: ADMIN_EMAIL,
      password: ADMIN_PASSWORD,
      email_confirm: true,
    });
    if (createErr) throw new Error(createErr.message);
    userId = created.user?.id ?? null;
  }
  if (!userId) throw new Error("Failed to resolve admin user id");

  // Grant admin role if missing
  const { data: roles } = await supabaseAdmin.from("user_roles").select("role").eq("user_id", userId);
  if (!roles?.some((r) => r.role === "admin")) {
    const { error: roleErr } = await supabaseAdmin.from("user_roles").insert({ user_id: userId, role: "admin" });
    if (roleErr && !roleErr.message.includes("duplicate")) throw new Error(roleErr.message);
  }

  return { email: ADMIN_EMAIL, ok: true };
});