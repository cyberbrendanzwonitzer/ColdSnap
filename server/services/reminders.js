const { randomUUID } = require("crypto");
const config = require("../config");
const { withStore } = require("../storage");
const { createReminderClient } = require("../providers/reminder");

const reminderClient = createReminderClient(config.reminderProvider, config);

let workerTimer;
let isProcessing = false;

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
  if (isProcessing) {
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

        if (hasEvent(store, "reminder.sent", booking.id)) {
          continue;
        }

        const sendAtMs = getSendAtMs(booking, nowMs);
        if (nowMs < sendAtMs) {
          continue;
        }

        if (hasRecentFailure(store, booking.id, nowMs)) {
          skipped += 1;
          continue;
        }

        const lead = leadsById.get(booking.leadId);
        const client = clientsById.get(booking.clientId);
        const toEmail = String(lead ? lead.email : client ? client.email : "").trim().toLowerCase();
        const customerName = getName(lead, client);

        if (!toEmail) {
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
          sent += 1;
        } catch (error) {
          addEvent(store, "reminder.failed", {
            bookingId: booking.id,
            toEmail,
            provider: reminderClient.provider,
            message: error.message
          });
          failed += 1;
        }
      }

      return {
        sent,
        failed,
        skipped,
        provider: reminderClient.provider
      };
    });
  } finally {
    isProcessing = false;
  }
}

function triggerReminderCheck() {
  processDueReminders().catch((error) => {
    console.error("Reminder check failed", error.message);
  });
}

function startReminderWorker() {
  if (workerTimer) {
    return;
  }

  if (config.reminderProvider === "none" || config.reminderProvider === "disabled") {
    console.log("Reminder worker disabled (REMINDER_PROVIDER=none)");
    return;
  }

  const run = async () => {
    const summary = await processDueReminders();
    if (summary.sent || summary.failed) {
      console.log(`[Reminder Worker] provider=${summary.provider} sent=${summary.sent} failed=${summary.failed} skipped=${summary.skipped}`);
    }
  };

  setTimeout(() => {
    run().catch((error) => {
      console.error("Reminder warmup run failed", error.message);
    });
  }, 3000);

  workerTimer = setInterval(() => {
    run().catch((error) => {
      console.error("Reminder worker run failed", error.message);
    });
  }, Math.max(config.reminderPollMs, 5000));

  if (typeof workerTimer.unref === "function") {
    workerTimer.unref();
  }

  console.log(`Reminder worker started | provider=${reminderClient.provider} | leadMinutes=${config.reminderLeadMinutes}`);
}

module.exports = {
  processDueReminders,
  triggerReminderCheck,
  startReminderWorker
};
