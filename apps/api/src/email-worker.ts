import nodemailer from "nodemailer";
import type { EmailJobRow } from "@speccheck/database";
import { config } from "./config.js";
import { supabaseAdmin, throwIfSupabaseError } from "./supabase.js";

const MAX_ATTEMPTS = 5;
const POLL_MS = 5_000;

export function startEmailWorker(): () => void {
  if (!config.EMAIL_WORKER_ENABLED) {
    console.info("Email worker disabled. Set EMAIL_WORKER_ENABLED=true after configuring SMTP.");
    return () => undefined;
  }
  if (!config.SMTP_HOST) throw new Error("SMTP_HOST is required when the email worker is enabled.");

  const transport = nodemailer.createTransport({
    host: config.SMTP_HOST,
    port: config.SMTP_PORT,
    secure: config.SMTP_SECURE,
    ...(config.SMTP_USER
      ? { auth: { user: config.SMTP_USER, pass: config.SMTP_PASSWORD ?? "" } }
      : {}),
  });
  let running = false;

  const tick = async (): Promise<void> => {
    if (running) return;
    running = true;
    try {
      const { data, error } = await supabaseAdmin.rpc("claim_email_jobs", { p_limit: 10 });
      throwIfSupabaseError(error);
      const jobs = (data ?? []) as EmailJobRow[];
      await Promise.all(
        jobs.map(async (job) => {
          try {
            const info = await transport.sendMail({
              from: config.SMTP_FROM,
              to: job.recipient_email,
              subject: job.subject,
              text: job.text_body,
              html: job.html_body,
            });
            const { error: updateError } = await supabaseAdmin
              .from("email_jobs")
              .update({
                status: "sent",
                sent_at: new Date().toISOString(),
                smtp_message_id: info.messageId,
                lease_expires_at: null,
                last_error: null,
              })
              .eq("id", job.id);
            throwIfSupabaseError(updateError);
          } catch (error) {
            const failed = job.attempts >= MAX_ATTEMPTS;
            const delayMinutes = Math.min(60, 2 ** Math.max(1, job.attempts));
            await supabaseAdmin
              .from("email_jobs")
              .update({
                status: failed ? "failed" : "pending",
                available_at: new Date(Date.now() + delayMinutes * 60_000).toISOString(),
                lease_expires_at: null,
                last_error: error instanceof Error ? error.message.slice(0, 1_000) : "Unknown SMTP error",
              })
              .eq("id", job.id);
          }
        }),
      );
    } catch (error) {
      console.error("Email worker tick failed", error);
    } finally {
      running = false;
    }
  };

  const timer = setInterval(() => void tick(), POLL_MS);
  void tick();
  return () => clearInterval(timer);
}
