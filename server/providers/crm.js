const { randomUUID } = require("crypto");

function createMockCrmClient(label, reason = "") {
  return {
    provider: label,
    reason,
    async upsertLead() {
      return {
        externalId: `crm_${randomUUID()}`,
        provider: label,
        reason
      };
    },
    async trackEvent() {
      return {
        accepted: true,
        provider: label,
        reason
      };
    }
  };
}

function createHubSpotClient(config) {
  if (!config.allowOutboundIntegrations || !config.hubspotToken) {
    return createMockCrmClient("hubspot-fallback", "Missing token or outbound disabled");
  }

  return {
    provider: "hubspot",
    reason: "",
    async upsertLead(lead) {
      const response = await fetch("https://api.hubapi.com/crm/v3/objects/contacts", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${config.hubspotToken}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          properties: {
            email: lead.email,
            firstname: lead.firstName,
            lastname: lead.lastName,
            phone: lead.phone || ""
          }
        })
      });

      if (!response.ok) {
        const message = await response.text();
        throw new Error(`HubSpot upsert failed: ${message}`);
      }

      const data = await response.json();
      return {
        externalId: data.id,
        provider: "hubspot",
        reason: ""
      };
    },
    async trackEvent() {
      return {
        accepted: true,
        provider: "hubspot",
        reason: "HubSpot custom event API not wired in this starter"
      };
    }
  };
}

function createGoHighLevelClient(config) {
  if (!config.allowOutboundIntegrations || !config.goHighLevelApiKey) {
    return createMockCrmClient("gohighlevel-fallback", "Missing API key or outbound disabled");
  }

  return {
    provider: "gohighlevel",
    reason: "",
    async upsertLead(lead) {
      const response = await fetch("https://rest.gohighlevel.com/v1/contacts/", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${config.goHighLevelApiKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          locationId: config.goHighLevelLocationId || undefined,
          firstName: lead.firstName,
          lastName: lead.lastName,
          email: lead.email,
          phone: lead.phone || ""
        })
      });

      if (!response.ok) {
        const message = await response.text();
        throw new Error(`GoHighLevel upsert failed: ${message}`);
      }

      const data = await response.json();
      return {
        externalId: data.contact ? data.contact.id : randomUUID(),
        provider: "gohighlevel",
        reason: ""
      };
    },
    async trackEvent() {
      return {
        accepted: true,
        provider: "gohighlevel",
        reason: "Track events are stored locally in this starter"
      };
    }
  };
}

function createCrmClient(provider, config) {
  if (provider === "hubspot") {
    return createHubSpotClient(config);
  }

  if (provider === "gohighlevel") {
    return createGoHighLevelClient(config);
  }

  return createMockCrmClient("mock");
}

module.exports = {
  createCrmClient
};
