const dns = require("node:dns");
const nodemailer = require("nodemailer");

function shouldFallbackToResend(error) {
  const message = String(error && error.message ? error.message : "").toLowerCase();
  return [
    "enetunreach",
    "econnrefused",
    "etimedout",
    "connection timeout",
    "network",
    "ehostunreach"
  ].some((pattern) => message.includes(pattern));
}

function traceLog(config, message, payload = {}) {
  if (!config || !config.reminderTrace) {
    return;
  }

  console.log("[Reminder Trace][Provider]", message, payload);
}

function formatServiceName(serviceCode) {
  return String(serviceCode || "session")
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatDateForReminder(isoValue, timezone) {
  const date = new Date(isoValue);

  if (Number.isNaN(date.getTime())) {
    return String(isoValue || "soon");
  }

  return new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(date);
}

function createMockReminderClient(label, reason = "") {
  return {
    provider: label,
    reason,
    async sendBookingReminder(payload) {
      console.log("[Reminder Mock]", {
        provider: label,
        reason,
        toEmail: payload.toEmail,
        bookingId: payload.booking.id
      });

      return {
        accepted: true,
        provider: label,
        reason
      };
    }
  };
}

function buildReminderMessage(payload, config) {
  const readableTime = formatDateForReminder(payload.booking.preferredDateTime, config.reminderTimezone);
  const serviceName = formatServiceName(payload.booking.serviceCode);
  const customerName = payload.customerName || "there";
  const isImmediate = config.reminderLeadMinutes === 0;
  const subject = isImmediate
    ? `Booking confirmed: your ${serviceName} session at CryoChamber`
    : `CryoChamber reminder: your ${serviceName} booking on ${readableTime}`;
  const intro = isImmediate
    ? `Your ${serviceName} session at CryoChamber has been confirmed for ${readableTime}.`
    : `This is a reminder for your upcoming ${serviceName} session at CryoChamber on ${readableTime}.`;
  const text = [
    `Hi ${customerName},`,
    "",
    intro,
    "",
    "If you need to reschedule, please reply to this email or contact our front desk.",
    "",
    "- CryoChamber"
  ].join("\n");

  const html = [
    `<p>Hi ${customerName},</p>`,
    `<p>${intro}</p>`,
    "<p>If you need to reschedule, please reply to this email or contact our front desk.</p>",
    "<p>- CryoChamber</p>"
  ].join("");

  return {
    subject,
    text,
    html
  };
}

function createGmailReminderClient(config) {
  if (!config.allowOutboundIntegrations || !config.gmailUser || !config.gmailAppPassword) {
    traceLog(config, "gmail.disabled_or_missing_credentials", {
      allowOutboundIntegrations: config.allowOutboundIntegrations,
      hasUser: Boolean(config.gmailUser),
      hasPassword: Boolean(config.gmailAppPassword)
    });
    return createMockReminderClient("gmail-fallback", "Missing GMAIL_USER/GMAIL_APP_PASSWORD or outbound disabled");
  }

  try {
    dns.setDefaultResultOrder("ipv4first");
    traceLog(config, "gmail.dns_ipv4first_enabled", {});
  } catch (_error) {
    // Keep running even if runtime does not support this DNS option.
    traceLog(config, "gmail.dns_ipv4first_unavailable", {});
  }

  const resendFallbackClient = config.reminderFallbackProvider === "resend"
    ? createResendReminderClient(config)
    : null;

  const transporter = nodemailer.createTransport({
    host: config.gmailHost,
    port: config.gmailPort,
    secure: config.gmailSecure,
    requireTLS: !config.gmailSecure,
    connectionTimeout: config.gmailConnectionTimeoutMs,
    greetingTimeout: config.gmailGreetingTimeoutMs,
    socketTimeout: config.gmailSocketTimeoutMs,
    family: 4,
    auth: {
      user: config.gmailUser,
      pass: config.gmailAppPassword
    }
  });

  traceLog(config, "gmail.transport_created", {
    host: config.gmailHost,
    port: config.gmailPort,
    secure: config.gmailSecure,
    family: 4,
    fallbackProvider: config.reminderFallbackProvider || "none"
  });

  return {
    provider: "gmail",
    reason: "",
    async sendBookingReminder(payload) {
      const message = buildReminderMessage(payload, config);
      traceLog(config, "gmail.send_attempt", {
        bookingId: payload.booking.id,
        toEmail: payload.toEmail,
        subject: message.subject
      });

      try {
        const result = await transporter.sendMail({
          from: `${config.reminderFromName} <${config.gmailUser}>`,
          to: payload.toEmail,
          subject: message.subject,
          text: message.text,
          html: message.html
        });

        return {
          accepted: true,
          provider: "gmail",
          reason: "",
          messageId: result.messageId || ""
        };
      } catch (error) {
        traceLog(config, "gmail.send_failed", {
          bookingId: payload.booking.id,
          toEmail: payload.toEmail,
          message: error.message
        });

        if (resendFallbackClient && shouldFallbackToResend(error)) {
          traceLog(config, "gmail.fallback_resend_attempt", {
            bookingId: payload.booking.id,
            toEmail: payload.toEmail
          });
          const fallbackResult = await resendFallbackClient.sendBookingReminder(payload);
          traceLog(config, "gmail.fallback_resend_success", {
            bookingId: payload.booking.id,
            toEmail: payload.toEmail,
            messageId: fallbackResult.messageId || ""
          });
          return {
            accepted: true,
            provider: "resend-fallback",
            reason: `gmail failed: ${error.message}`,
            messageId: fallbackResult.messageId || ""
          };
        }

        throw error;
      }
    }
  };
}

function createResendReminderClient(config) {
  if (!config.allowOutboundIntegrations || !config.resendApiKey || !config.reminderFromEmail) {
    traceLog(config, "resend.disabled_or_missing_credentials", {
      allowOutboundIntegrations: config.allowOutboundIntegrations,
      hasApiKey: Boolean(config.resendApiKey),
      hasFromEmail: Boolean(config.reminderFromEmail)
    });
    return createMockReminderClient("resend-fallback", "Missing RESEND_API_KEY/REMINDER_FROM_EMAIL or outbound disabled");
  }

  return {
    provider: "resend",
    reason: "",
    async sendBookingReminder(payload) {
      const message = buildReminderMessage(payload, config);
      traceLog(config, "resend.send_attempt", {
        bookingId: payload.booking.id,
        toEmail: payload.toEmail,
        subject: message.subject
      });

      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${config.resendApiKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          from: `${config.reminderFromName} <${config.reminderFromEmail}>`,
          to: [payload.toEmail],
          subject: message.subject,
          text: message.text,
          html: message.html
        })
      });

      if (!response.ok) {
        const message = await response.text();
        traceLog(config, "resend.send_failed", {
          bookingId: payload.booking.id,
          toEmail: payload.toEmail,
          status: response.status,
          message
        });
        throw new Error(`Resend reminder failed: ${message}`);
      }

      const data = await response.json();
      traceLog(config, "resend.send_success", {
        bookingId: payload.booking.id,
        toEmail: payload.toEmail,
        messageId: data.id || ""
      });
      return {
        accepted: true,
        provider: "resend",
        reason: "",
        messageId: data.id || ""
      };
    }
  };
}

function createReminderClient(provider, config) {
  if (provider === "gmail") {
    return createGmailReminderClient(config);
  }

  if (provider === "resend") {
    return createResendReminderClient(config);
  }

  if (provider === "none" || provider === "disabled") {
    return {
      provider: "none",
      reason: "Reminder delivery disabled",
      async sendBookingReminder() {
        return {
          accepted: false,
          provider: "none",
          reason: "Reminder delivery disabled"
        };
      }
    };
  }

  return createMockReminderClient("mock");
}

module.exports = {
  createReminderClient
};
