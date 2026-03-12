const { randomUUID } = require("crypto");

function createMockBookingClient(label, reason = "") {
  return {
    provider: label,
    reason,
    async createBookingIntent() {
      return {
        reference: `booking_${randomUUID()}`,
        provider: label,
        reason
      };
    },
    async confirmBooking(reference) {
      return {
        reference,
        status: "confirmed",
        provider: label,
        reason
      };
    }
  };
}

function createGenericApiBookingClient(providerName, config) {
  if (!config.allowOutboundIntegrations || !config.bookingApiKey || !config.bookingBaseUrl) {
    return createMockBookingClient(`${providerName}-fallback`, "Missing API config or outbound disabled");
  }

  const baseUrl = config.bookingBaseUrl.replace(/\/$/, "");

  return {
    provider: providerName,
    reason: "",
    async createBookingIntent(payload) {
      const response = await fetch(`${baseUrl}/bookings/intents`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${config.bookingApiKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        const message = await response.text();
        throw new Error(`${providerName} booking intent failed: ${message}`);
      }

      const data = await response.json();
      return {
        reference: data.reference || `booking_${randomUUID()}`,
        provider: providerName,
        reason: ""
      };
    },
    async confirmBooking(reference) {
      const response = await fetch(`${baseUrl}/bookings/${reference}/confirm`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${config.bookingApiKey}`,
          "Content-Type": "application/json"
        }
      });

      if (!response.ok) {
        const message = await response.text();
        throw new Error(`${providerName} booking confirm failed: ${message}`);
      }

      return {
        reference,
        status: "confirmed",
        provider: providerName,
        reason: ""
      };
    }
  };
}

function createBookingClient(provider, config) {
  if (provider === "mindbody") {
    return createGenericApiBookingClient("mindbody", config);
  }

  if (provider === "boulevard") {
    return createGenericApiBookingClient("boulevard", config);
  }

  return createMockBookingClient("mock");
}

module.exports = {
  createBookingClient
};
