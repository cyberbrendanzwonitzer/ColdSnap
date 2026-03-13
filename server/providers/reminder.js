const dns = require("node:dns");
const { google } = require("googleapis");
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

function cleanHeader(value) {
  return String(value || "").replace(/[\r\n]+/g, " ").trim();
}

function toBase64Url(value) {
  return Buffer.from(value)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function buildGmailApiRawMessage({ from, to, subject, text, html }) {
  const boundary = `boundary_${Date.now()}`;
  const lines = [
    `From: ${cleanHeader(from)}`,
    `To: ${cleanHeader(to)}`,
    `Subject: ${cleanHeader(subject)}`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/alternative; boundary=\"${boundary}\"`,
    "",
    `--${boundary}`,
    "Content-Type: text/plain; charset=\"UTF-8\"",
    "",
    text || "",
    "",
    `--${boundary}`,
    "Content-Type: text/html; charset=\"UTF-8\"",
    "",
    html || "",
    "",
    `--${boundary}--`
  ];

  return toBase64Url(lines.join("\r\n"));
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

  const alternateTransporter = (config.gmailPort === 587 && config.gmailSecure === false)
    ? null
    : nodemailer.createTransport({
      host: config.gmailHost,
      port: 587,
      secure: false,
      requireTLS: true,
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
    fallbackProvider: config.reminderFallbackProvider || "none",
    hasAlternate587: Boolean(alternateTransporter)
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

        if (alternateTransporter && shouldFallbackToResend(error)) {
          traceLog(config, "gmail.alternate_587_attempt", {
            bookingId: payload.booking.id,
            toEmail: payload.toEmail
          });

          try {
            const altResult = await alternateTransporter.sendMail({
              from: `${config.reminderFromName} <${config.gmailUser}>`,
              to: payload.toEmail,
              subject: message.subject,
              text: message.text,
              html: message.html
            });

            traceLog(config, "gmail.alternate_587_success", {
              bookingId: payload.booking.id,
              toEmail: payload.toEmail,
              messageId: altResult.messageId || ""
            });

            return {
              accepted: true,
              provider: "gmail-587-fallback",
              reason: `gmail primary failed: ${error.message}`,
              messageId: altResult.messageId || ""
            };
          } catch (altError) {
            traceLog(config, "gmail.alternate_587_failed", {
              bookingId: payload.booking.id,
              toEmail: payload.toEmail,
              message: altError.message
            });
          }
        }

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

function createGmailApiReminderClient(config) {
  if (
    !config.allowOutboundIntegrations ||
    !config.gmailApiClientId ||
    !config.gmailApiClientSecret ||
    !config.gmailApiRefreshToken ||
    !config.gmailUser
  ) {
    traceLog(config, "gmail_api.disabled_or_missing_credentials", {
      allowOutboundIntegrations: config.allowOutboundIntegrations,
      hasClientId: Boolean(config.gmailApiClientId),
      hasClientSecret: Boolean(config.gmailApiClientSecret),
      hasRefreshToken: Boolean(config.gmailApiRefreshToken),
      hasGmailUser: Boolean(config.gmailUser)
    });

    return createMockReminderClient("gmail-api-fallback", "Missing Gmail API OAuth config or outbound disabled");
  }

  const resendFallbackClient = config.reminderFallbackProvider === "resend"
    ? createResendReminderClient(config)
    : null;

  const oauth2Client = new google.auth.OAuth2(
    config.gmailApiClientId,
    config.gmailApiClientSecret,
    config.gmailApiRedirectUri
  );

  oauth2Client.setCredentials({
    refresh_token: config.gmailApiRefreshToken
  });

  const gmail = google.gmail({ version: "v1", auth: oauth2Client });

  traceLog(config, "gmail_api.client_created", {
    gmailUser: config.gmailUser,
    redirectUri: config.gmailApiRedirectUri,
    fallbackProvider: config.reminderFallbackProvider || "none"
  });

  return {
    provider: "gmail_api",
    reason: "",
    async sendBookingReminder(payload) {
      const message = buildReminderMessage(payload, config);
      const fromEmail = config.reminderFromEmail || config.gmailUser;
      const raw = buildGmailApiRawMessage({
        from: `${config.reminderFromName} <${fromEmail}>`,
        to: payload.toEmail,
        subject: message.subject,
        text: message.text,
        html: message.html
      });

      traceLog(config, "gmail_api.send_attempt", {
        bookingId: payload.booking.id,
        toEmail: payload.toEmail,
        subject: message.subject,
        fromEmail
      });

      try {
        const response = await gmail.users.messages.send({
          userId: "me",
          requestBody: {
            raw
          }
        });

        const messageId = response && response.data && response.data.id ? response.data.id : "";
        traceLog(config, "gmail_api.send_success", {
          bookingId: payload.booking.id,
          toEmail: payload.toEmail,
          messageId
        });

        return {
          accepted: true,
          provider: "gmail_api",
          reason: "",
          messageId
        };
      } catch (error) {
        traceLog(config, "gmail_api.send_failed", {
          bookingId: payload.booking.id,
          toEmail: payload.toEmail,
          message: error.message
        });

        if (resendFallbackClient) {
          traceLog(config, "gmail_api.fallback_resend_attempt", {
            bookingId: payload.booking.id,
            toEmail: payload.toEmail
          });
          const fallbackResult = await resendFallbackClient.sendBookingReminder(payload);
          traceLog(config, "gmail_api.fallback_resend_success", {
            bookingId: payload.booking.id,
            toEmail: payload.toEmail,
            messageId: fallbackResult.messageId || ""
          });
          return {
            accepted: true,
            provider: "resend-fallback",
            reason: `gmail_api failed: ${error.message}`,
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

  if (provider === "gmail_api") {
    return createGmailApiReminderClient(config);
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
