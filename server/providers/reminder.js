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

function createResendReminderClient(config) {
  if (!config.allowOutboundIntegrations || !config.resendApiKey || !config.reminderFromEmail) {
    return createMockReminderClient("resend-fallback", "Missing RESEND_API_KEY/REMINDER_FROM_EMAIL or outbound disabled");
  }

  return {
    provider: "resend",
    reason: "",
    async sendBookingReminder(payload) {
      const readableTime = formatDateForReminder(payload.booking.preferredDateTime, config.reminderTimezone);
      const serviceName = formatServiceName(payload.booking.serviceCode);
      const customerName = payload.customerName || "there";
      const subject = `CryoChamber reminder: your ${serviceName} booking`;
      const text = [
        `Hi ${customerName},`,
        "",
        `This is your reminder for your ${serviceName} booking at CryoChamber on ${readableTime}.`,
        "",
        "If you need to reschedule, please reply to this email or contact our front desk.",
        "",
        "- CryoChamber"
      ].join("\n");

      const html = [
        `<p>Hi ${customerName},</p>`,
        `<p>This is your reminder for your <strong>${serviceName}</strong> booking at CryoChamber on <strong>${readableTime}</strong>.</p>`,
        "<p>If you need to reschedule, please reply to this email or contact our front desk.</p>",
        "<p>- CryoChamber</p>"
      ].join("");

      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${config.resendApiKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          from: `${config.reminderFromName} <${config.reminderFromEmail}>`,
          to: [payload.toEmail],
          subject,
          text,
          html
        })
      });

      if (!response.ok) {
        const message = await response.text();
        throw new Error(`Resend reminder failed: ${message}`);
      }

      const data = await response.json();
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
