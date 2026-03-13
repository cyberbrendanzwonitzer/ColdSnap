const { randomUUID } = require("crypto");
const config = require("../config");
const { withStore } = require("../storage");
const { createReminderClient } = require("../providers/reminder");

const reminderClient = createReminderClient(config.reminderProvider, config);

let workerTimer;
let isProcessing = false;

function traceLog(message, payload = {}) {
  if (!config.reminderTrace) {
    return;
  }

  console.log("[Reminder Trace]", message, payload);
}

function addEvent(store, type, payload) {
  store.events.push({
    id: randomUUID(),
    type,
    payload,
    createdAt: new Date().toISOString()
  });
}

// REMINDER_LEAD_MINUTES=0  → send immediately when booking is confirmed (based on createdAt)
// REMINDER_LEAD_MINUTES>0  → send X minutes before the appointment
function getSendAtMs(booking, nowMs) {
  if (config.reminderLeadMinutes === 0) {
    const createdMs = new Date(booking.createdAt).getTime();
    return Number.isFinite(createdMs) ? createdMs : nowMs;
  }

  const bookingMs = new Date(booking.preferredDateTime).getTime();
  if (!Number.isFinite(bookingMs)) {
    return nowMs;
  }

  return bookingMs - config.reminderLeadMinutes * 60 * 1000;
}

function getName(lead, client) {
  const first = lead ? lead.firstName : client ? client.firstName : "";
  const last = lead ? lead.lastName : client ? client.lastName : "";
  return `${first || ""} ${last || ""}`.trim();
}

function hasEvent(store, type, bookingId) {
  return store.events.some((event) => event.type === type && event.payload && event.payload.bookingId === bookingId);
}

function hasRecentFailure(store, bookingId, nowMs) {
  const retryWindowMs = Math.max(config.reminderRetryMinutes, 0) * 60 * 1000;

  for (let index = store.events.length - 1; index >= 0; index -= 1) {
    const event = store.events[index];
    if (event.type !== "reminder.failed" || !event.payload || event.payload.bookingId !== bookingId) {
      continue;
    }

    const failureMs = new Date(event.createdAt).getTime();
    if (!Number.isFinite(failureMs)) {
      return false;
    }

    return nowMs - failureMs < retryWindowMs;
  }

  return false;
}

async function processDueReminders() {
  traceLog("processDueReminders.start", {
    provider: reminderClient.provider,
    leadMinutes: config.reminderLeadMinutes
  });

  if (isProcessing) {
    traceLog("processDueReminders.skip_already_running", {});
    return {
      sent: 0,
      failed: 0,
      skipped: 0,
      reason: "already-running"
    };
  }

  isProcessing = true;

  try {
    return await withStore(async (store) => {
      const nowMs = Date.now();
      const leadsById = new Map(store.leads.map((lead) => [lead.id, lead]));
      const clientsById = new Map(store.clients.map((client) => [client.id, client]));

      let sent = 0;
      let failed = 0;
      let skipped = 0;

      for (const booking of store.bookings) {
        if (booking.status !== "confirmed") {
          continue;
        }

        traceLog("booking.evaluate", {
          bookingId: booking.id,
          status: booking.status,
          preferredDateTime: booking.preferredDateTime,
          createdAt: booking.createdAt
        });

        if (hasEvent(store, "reminder.sent", booking.id)) {
          traceLog("booking.skip_already_sent", { bookingId: booking.id });
          continue;
        }

        const sendAtMs = getSendAtMs(booking, nowMs);
        if (nowMs < sendAtMs) {
          traceLog("booking.skip_not_due", {
            bookingId: booking.id,
            now: new Date(nowMs).toISOString(),
            sendAt: new Date(sendAtMs).toISOString()
          });
          continue;
        }

        if (hasRecentFailure(store, booking.id, nowMs)) {
          traceLog("booking.skip_recent_failure", {
            bookingId: booking.id,
            retryMinutes: config.reminderRetryMinutes
          });
          skipped += 1;
          continue;
        }

        const lead = leadsById.get(booking.leadId);
        const client = clientsById.get(booking.clientId);
        const toEmail = String(lead ? lead.email : client ? client.email : "").trim().toLowerCase();
        const customerName = getName(lead, client);

        if (!toEmail) {
          traceLog("booking.skip_missing_email", {
            bookingId: booking.id,
            provider: reminderClient.provider
          });
          if (!hasEvent(store, "reminder.skipped_no_email", booking.id)) {
            addEvent(store, "reminder.skipped_no_email", {
              bookingId: booking.id,
              provider: reminderClient.provider,
              reason: "Missing customer email"
            });
          }
          skipped += 1;
          continue;
        }

        try {
          traceLog("booking.send_attempt", {
            bookingId: booking.id,
            toEmail,
            provider: reminderClient.provider
          });

          const result = await reminderClient.sendBookingReminder({
            booking,
            toEmail,
            customerName
          });

          addEvent(store, "reminder.sent", {
            bookingId: booking.id,
            toEmail,
            provider: result.provider || reminderClient.provider,
            reason: result.reason || "",
            messageId: result.messageId || "",
            leadMinutes: config.reminderLeadMinutes
          });
          traceLog("booking.send_success", {
            bookingId: booking.id,
            toEmail,
            provider: result.provider || reminderClient.provider,
            messageId: result.messageId || ""
          });
          sent += 1;
        } catch (error) {
          addEvent(store, "reminder.failed", {
            bookingId: booking.id,
            toEmail,
            provider: reminderClient.provider,
            message: error.message
          });
          traceLog("booking.send_failed", {
            bookingId: booking.id,
            toEmail,
            provider: reminderClient.provider,
            message: error.message
          });
          failed += 1;
        }
      }

      const summary = {
        sent,
        failed,
        skipped,
        provider: reminderClient.provider
      };

      traceLog("processDueReminders.summary", summary);
      return summary;
    });
  } finally {
    isProcessing = false;
    traceLog("processDueReminders.end", {});
  }
}

function triggerReminderCheck() {
  traceLog("triggerReminderCheck.called", {
    provider: reminderClient.provider
  });

  processDueReminders().catch((error) => {
    console.error("Reminder check failed", error.message);
    traceLog("triggerReminderCheck.error", {
      message: error.message
    });
  });
}

function startReminderWorker() {
  if (workerTimer) {
    traceLog("worker.skip_already_started", {});
    return;
  }

  if (config.reminderProvider === "none" || config.reminderProvider === "disabled") {
    console.log("Reminder worker disabled (REMINDER_PROVIDER=none)");
    traceLog("worker.disabled", { provider: config.reminderProvider });
    return;
  }

  const run = async () => {
    const summary = await processDueReminders();
    if (summary.sent || summary.failed) {
      console.log(`[Reminder Worker] provider=${summary.provider} sent=${summary.sent} failed=${summary.failed} skipped=${summary.skipped}`);
    }
  };

  setTimeout(() => {
    traceLog("worker.warmup_run.start", {});
    run().catch((error) => {
      console.error("Reminder warmup run failed", error.message);
      traceLog("worker.warmup_run.error", { message: error.message });
    });
  }, 3000);

  workerTimer = setInterval(() => {
    traceLog("worker.interval_run.start", {});
    run().catch((error) => {
      console.error("Reminder worker run failed", error.message);
      traceLog("worker.interval_run.error", { message: error.message });
    });
  }, Math.max(config.reminderPollMs, 5000));

  if (typeof workerTimer.unref === "function") {
    workerTimer.unref();
  }

  console.log(`Reminder worker started | provider=${reminderClient.provider} | leadMinutes=${config.reminderLeadMinutes}`);
  traceLog("worker.started", {
    provider: reminderClient.provider,
    leadMinutes: config.reminderLeadMinutes,
    pollMs: Math.max(config.reminderPollMs, 5000)
  });
}

module.exports = {
  processDueReminders,
  triggerReminderCheck,
  startReminderWorker
};
