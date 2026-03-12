const API_BASE = window.location.protocol === "file:" ? "http://localhost:3000" : "";

const refreshButton = document.getElementById("refresh-btn");
const statusFilter = document.getElementById("status-filter");
const searchFilter = document.getElementById("search-filter");
const statusMessage = document.getElementById("status-message");
const tableCount = document.getElementById("table-count");
const bookingsBody = document.getElementById("bookings-body");

const statTotal = document.getElementById("stat-total");
const statConfirmed = document.getElementById("stat-confirmed");
const statPending = document.getElementById("stat-pending");
const statLeads = document.getElementById("stat-leads");

let allBookings = [];

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function setStatusMessage(message, isError = false) {
  statusMessage.textContent = message;
  statusMessage.classList.toggle("error", isError);
}

function formatDate(value) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value || "-";
  }

  return date.toLocaleString([], {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  });
}

function toTitleCase(value) {
  return String(value || "")
    .split("_")
    .join(" ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function renderRows(bookings) {
  if (!bookings.length) {
    bookingsBody.innerHTML = '<tr><td colspan="9" class="empty-row">No appointments match the selected filters.</td></tr>';
    return;
  }

  bookingsBody.innerHTML = bookings.map((booking) => {
    const statusClass = ["confirmed", "pending_waiver"].includes(booking.status) ? booking.status : "unknown";

    return `
      <tr>
        <td>${escapeHtml(formatDate(booking.preferredDateTime))}</td>
        <td>${escapeHtml(booking.customerName || "-")}</td>
        <td>${escapeHtml(booking.customerEmail || "-")}</td>
        <td>${escapeHtml(booking.customerPhone || "-")}</td>
        <td>${escapeHtml(toTitleCase(booking.serviceCode))}</td>
        <td><span class="badge badge-${statusClass}">${escapeHtml(toTitleCase(booking.status))}</span></td>
        <td>${escapeHtml(booking.provider || "-")}</td>
        <td>${escapeHtml(booking.providerReference || "-")}</td>
        <td>${escapeHtml(formatDate(booking.createdAt))}</td>
      </tr>
    `;
  }).join("");
}

function applyFilters() {
  const selectedStatus = statusFilter.value;
  const search = searchFilter.value.trim().toLowerCase();

  const filtered = allBookings.filter((booking) => {
    if (selectedStatus !== "all" && booking.status !== selectedStatus) {
      return false;
    }

    if (!search) {
      return true;
    }

    const haystack = [booking.customerName, booking.customerEmail, booking.serviceCode]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();

    return haystack.includes(search);
  });

  tableCount.textContent = `${filtered.length} appointment(s)`;
  renderRows(filtered);
}

async function getJson(url) {
  const response = await fetch(`${API_BASE}${url}`);
  const body = await response.json().catch(() => ({ ok: false, error: "Invalid server response" }));

  if (!response.ok || !body.ok) {
    throw new Error(body.error || "Request failed");
  }

  return body;
}

async function loadDashboard() {
  setStatusMessage("Loading appointments...");

  try {
    const [snapshotResponse, bookingsResponse] = await Promise.all([
      getJson("/api/admin/snapshot"),
      getJson("/api/admin/bookings")
    ]);

    const snapshot = snapshotResponse.snapshot;
    allBookings = bookingsResponse.bookings;

    statTotal.textContent = String(snapshot.bookingCount);
    statConfirmed.textContent = String(snapshot.bookingsConfirmed);
    statPending.textContent = String(snapshot.bookingsPendingWaiver);
    statLeads.textContent = String(snapshot.leadCount);

    applyFilters();
    setStatusMessage(`Updated ${new Date().toLocaleTimeString()}`);
  } catch (error) {
    setStatusMessage(`Failed to load appointments: ${error.message}`, true);
  }
}

refreshButton.addEventListener("click", () => {
  loadDashboard();
});

statusFilter.addEventListener("change", applyFilters);
searchFilter.addEventListener("input", applyFilters);

loadDashboard();
setInterval(loadDashboard, 30000);
