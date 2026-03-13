const { randomUUID } = require("crypto");
const config = require("../config");
const { withStore, getStoreSnapshot } = require("../storage");
const { createCrmClient } = require("../providers/crm");
const { createBookingClient } = require("../providers/booking");
const { triggerReminderCheck } = require("./reminders");

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.name = "HttpError";
    this.status = status;
  }
}

const crmClient = createCrmClient(config.crmProvider, config);
const bookingClient = createBookingClient(config.bookingProvider, config);

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function requireText(value, fieldName) {
  const parsed = String(value || "").trim();
  if (!parsed) {
    throw new HttpError(400, `${fieldName} is required`);
  }
  return parsed;
}

function ensureEmail(email) {
  const normalized = normalizeEmail(email);
  if (!normalized || !normalized.includes("@")) {
    throw new HttpError(400, "A valid email is required");
  }
  return normalized;
}

function addEvent(store, type, payload) {
  store.events.push({
    id: randomUUID(),
    type,
    payload,
    createdAt: new Date().toISOString()
  });
}

function upsertLead(store, payload, source) {
  const email = ensureEmail(payload.email);
  const now = new Date().toISOString();
  let lead = store.leads.find((item) => item.email === email);

  if (!lead) {
    lead = {
      id: randomUUID(),
      firstName: requireText(payload.firstName || "Guest", "firstName"),
      lastName: requireText(payload.lastName || "User", "lastName"),
      email,
      phone: String(payload.phone || "").trim(),
      source,
      status: "new",
      crmExternalId: "",
      createdAt: now,
      updatedAt: now
    };
    store.leads.push(lead);
    addEvent(store, "lead.created", { leadId: lead.id, source });
    return lead;
  }

  const incomingFirstName = String(payload.firstName || "").trim();
  const incomingLastName = String(payload.lastName || "").trim();

  if (incomingFirstName) {
    lead.firstName = incomingFirstName;
  }

  if (incomingLastName) {
    lead.lastName = incomingLastName;
  }

  lead.phone = String(payload.phone || lead.phone).trim();
  lead.source = source;
  lead.updatedAt = now;
  addEvent(store, "lead.updated", { leadId: lead.id, source });
  return lead;
}

function upsertClient(store, lead) {
  const now = new Date().toISOString();
  let client = store.clients.find((item) => item.email === lead.email);

  if (!client) {
    client = {
      id: randomUUID(),
      leadId: lead.id,
      firstName: lead.firstName,
      lastName: lead.lastName,
      email: lead.email,
      phone: lead.phone,
      createdAt: now,
      updatedAt: now
    };
    store.clients.push(client);
    addEvent(store, "client.created", { clientId: client.id, leadId: lead.id });
    return client;
  }

  client.leadId = lead.id;
  client.firstName = lead.firstName;
  client.lastName = lead.lastName;
  client.phone = lead.phone;
  client.updatedAt = now;
  addEvent(store, "client.updated", { clientId: client.id, leadId: lead.id });
  return client;
}

function getLatestSignedWaiver(store, clientId) {
  return store.waivers
    .filter((waiver) => waiver.clientId === clientId && waiver.status === "signed")
    .sort((a, b) => (a.signedAt < b.signedAt ? 1 : -1))[0];
}

async function syncLeadToCrm(store, lead) {
  try {
    const crmResult = await crmClient.upsertLead(lead);
    lead.crmExternalId = crmResult.externalId || lead.crmExternalId;
    addEvent(store, "crm.lead_synced", {
      leadId: lead.id,
      provider: crmResult.provider,
      reason: crmResult.reason || ""
    });

    return crmResult;
  } catch (error) {
    addEvent(store, "crm.lead_sync_failed", {
      leadId: lead.id,
      provider: config.crmProvider,
      message: error.message
    });
    return {
      externalId: "",
      provider: config.crmProvider,
      reason: error.message
    };
  }
}

async function captureNewsletterLead(payload) {
  return withStore(async (store) => {
    const lead = upsertLead(store, payload, "newsletter");
    const crmResult = await syncLeadToCrm(store, lead);

    await crmClient.trackEvent("lead.created", {
      leadId: lead.id,
      source: "newsletter"
    });

    return {
      leadId: lead.id,
      crmProvider: crmResult.provider,
      crmMode: crmResult.reason ? "fallback" : "live"
    };
  });
}

async function createBookingIntent(payload) {
  const firstName = requireText(payload.firstName, "firstName");
  const lastName = requireText(payload.lastName, "lastName");
  const email = ensureEmail(payload.email);
  const serviceCode = requireText(payload.serviceCode, "serviceCode");
  const preferredDateTime = requireText(payload.preferredDateTime, "preferredDateTime");

  if (payload.waiverAccepted !== true) {
    throw new HttpError(400, "Waiver acknowledgement is required");
  }

  const result = await withStore(async (store) => {
    const lead = upsertLead(store, {
      firstName,
      lastName,
      email,
      phone: payload.phone
    }, "first-freeze-special");

    const client = upsertClient(store, lead);
    const latestWaiver = getLatestSignedWaiver(store, client.id);

    const providerIntent = await bookingClient.createBookingIntent({
      clientId: client.id,
      serviceCode,
      preferredDateTime,
      leadSource: lead.source
    });

    const now = new Date().toISOString();
    const booking = {
      id: randomUUID(),
      leadId: lead.id,
      clientId: client.id,
      serviceCode,
      preferredDateTime,
      provider: providerIntent.provider,
      providerReference: providerIntent.reference,
      status: latestWaiver ? "confirmed" : "pending_waiver",
      createdAt: now,
      updatedAt: now
    };

    store.bookings.push(booking);
    addEvent(store, "booking.intent_created", {
      bookingId: booking.id,
      status: booking.status,
      provider: booking.provider
    });

    const crmResult = await syncLeadToCrm(store, lead);
    await crmClient.trackEvent("booking.intent_created", {
      leadId: lead.id,
      clientId: client.id,
      bookingId: booking.id,
      serviceCode
    });

    return {
      bookingId: booking.id,
      status: booking.status,
      needsWaiver: booking.status === "pending_waiver",
      providerReference: booking.providerReference,
      crmProvider: crmResult.provider
    };
  });

  if (result.status === "confirmed") {
    triggerReminderCheck();
  }

  return result;
}

async function signWaiver(payload) {
  const email = ensureEmail(payload.email);
  const signatureName = requireText(payload.signatureName, "signatureName");
  const waiverVersion = String(payload.waiverVersion || "v1").trim() || "v1";

  const result = await withStore(async (store) => {
    const lead = upsertLead(store, {
      firstName: payload.firstName,
      lastName: payload.lastName,
      email,
      phone: payload.phone
    }, "waiver-signature");

    const client = upsertClient(store, lead);
    const signedAt = new Date().toISOString();
    const waiver = {
      id: randomUUID(),
      clientId: client.id,
      waiverVersion,
      signatureName,
      status: "signed",
      signedAt,
      createdAt: signedAt
    };

    store.waivers.push(waiver);
    addEvent(store, "waiver.signed", {
      waiverId: waiver.id,
      clientId: client.id,
      waiverVersion
    });

    const pendingBookings = store.bookings.filter((booking) => {
      return booking.clientId === client.id && booking.status === "pending_waiver";
    });

    for (const booking of pendingBookings) {
      booking.status = "confirmed";
      booking.updatedAt = new Date().toISOString();
      await bookingClient.confirmBooking(booking.providerReference);
      addEvent(store, "booking.confirmed", {
        bookingId: booking.id,
        providerReference: booking.providerReference
      });
    }

    const crmResult = await syncLeadToCrm(store, lead);
    await crmClient.trackEvent("waiver.signed", {
      leadId: lead.id,
      clientId: client.id,
      waiverId: waiver.id,
      confirmedBookings: pendingBookings.length
    });

    return {
      waiverId: waiver.id,
      confirmedBookings: pendingBookings.length,
      crmProvider: crmResult.provider
    };
  });

  if (result.confirmedBookings > 0) {
    triggerReminderCheck();
  }

  return result;
}

async function getAdminSnapshot() {
  const store = await getStoreSnapshot();

  return {
    leadCount: store.leads.length,
    clientCount: store.clients.length,
    waiverCount: store.waivers.length,
    bookingCount: store.bookings.length,
    bookingsPendingWaiver: store.bookings.filter((item) => item.status === "pending_waiver").length,
    bookingsConfirmed: store.bookings.filter((item) => item.status === "confirmed").length,
    recentEvents: store.events.slice(-20).reverse(),
    recentBookings: store.bookings.slice(-10).reverse()
  };
}

function resolveEmailStatus(store, bookingId) {
  let status = "pending";
  for (const event of store.events) {
    if (!event.payload || event.payload.bookingId !== bookingId) continue;
    if (event.type === "reminder.sent") status = "sent";
    else if (event.type === "reminder.failed" && status !== "sent") status = "failed";
    else if (event.type === "reminder.skipped_no_email" && status === "pending") status = "no_email";
  }
  return status;
}

async function getAdminBookings() {
  const store = await getStoreSnapshot();
  const leadsById = new Map(store.leads.map((lead) => [lead.id, lead]));
  const clientsById = new Map(store.clients.map((client) => [client.id, client]));

  const bookings = [...store.bookings]
    .map((booking) => {
      const lead = leadsById.get(booking.leadId);
      const client = clientsById.get(booking.clientId);
      const firstName = lead ? lead.firstName : client ? client.firstName : "";
      const lastName = lead ? lead.lastName : client ? client.lastName : "";
      const customerName = `${firstName} ${lastName}`.trim() || "Unknown";

      return {
        ...booking,
        customerName,
        customerEmail: lead ? lead.email : client ? client.email : "",
        customerPhone: client ? client.phone : lead ? lead.phone : "",
        emailStatus: resolveEmailStatus(store, booking.id)
      };
    })
    .sort((a, b) => {
      const aTime = new Date(a.preferredDateTime).getTime();
      const bTime = new Date(b.preferredDateTime).getTime();
      return aTime - bTime;
    });

  return {
    count: bookings.length,
    bookings
  };
}

module.exports = {
  HttpError,
  captureNewsletterLead,
  createBookingIntent,
  signWaiver,
  getAdminSnapshot,
  getAdminBookings
};
