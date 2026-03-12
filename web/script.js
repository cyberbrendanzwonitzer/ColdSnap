const hotspots = document.querySelectorAll('.hotspot');
const panels = document.querySelectorAll('.hotspot-details article');
const API_BASE = window.location.protocol === 'file:' ? 'http://localhost:3000' : '';

function showPanel(panelKey) {
  panels.forEach((panel) => {
    panel.classList.toggle('active', panel.dataset.panel === panelKey);
  });
}

hotspots.forEach((hotspot) => {
  hotspot.addEventListener('mouseenter', () => showPanel(hotspot.dataset.target));
  hotspot.addEventListener('focus', () => showPanel(hotspot.dataset.target));
  hotspot.addEventListener('click', () => showPanel(hotspot.dataset.target));
});

async function postJson(url, payload) {
  let response;

  try {
    response = await fetch(`${API_BASE}${url}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });
  } catch (error) {
    throw new Error('Cannot reach the booking API. Start the server and open http://localhost:3000.');
  }

  const json = await response.json().catch(() => ({ ok: false, error: 'Invalid server response' }));

  if (!response.ok || !json.ok) {
    throw new Error(json.error || 'Request failed');
  }

  return json;
}

const newsletterForm = document.getElementById('newsletter-form');
const formMessage = document.getElementById('form-message');

newsletterForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  formMessage.classList.remove('error');
  formMessage.textContent = 'Submitting...';

  try {
    const formData = new FormData(newsletterForm);
    await postJson('/api/leads/newsletter', {
      email: formData.get('email')
    });
    formMessage.textContent = 'Thanks. You are on the ColdSnap Alerts list.';
    newsletterForm.reset();
  } catch (error) {
    formMessage.classList.add('error');
    formMessage.textContent = error.message;
  }
});

const bookingForm = document.getElementById('booking-form');
const bookingMessage = document.getElementById('booking-message');

bookingForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  bookingMessage.classList.remove('error');
  bookingMessage.textContent = 'Creating booking intent...';

  try {
    const formData = new FormData(bookingForm);
    const result = await postJson('/api/bookings/intent', {
      firstName: formData.get('firstName'),
      lastName: formData.get('lastName'),
      email: formData.get('email'),
      phone: formData.get('phone'),
      serviceCode: formData.get('serviceCode'),
      preferredDateTime: formData.get('preferredDateTime'),
      waiverAccepted: formData.get('waiverAccepted') === 'on'
    });

    if (result.needsWaiver) {
      bookingMessage.textContent = 'Booking captured. Next step: sign the digital waiver below to confirm.';
    } else {
      bookingMessage.textContent = 'Booking confirmed. We will send your session details shortly.';
    }
    bookingForm.reset();
  } catch (error) {
    bookingMessage.classList.add('error');
    bookingMessage.textContent = error.message;
  }
});

const waiverForm = document.getElementById('waiver-form');
const waiverMessage = document.getElementById('waiver-message');

waiverForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  waiverMessage.classList.remove('error');
  waiverMessage.textContent = 'Signing waiver...';

  try {
    const formData = new FormData(waiverForm);
    const result = await postJson('/api/waivers/sign', {
      email: formData.get('email'),
      signatureName: formData.get('signatureName'),
      waiverVersion: formData.get('waiverVersion')
    });

    waiverMessage.textContent = `Waiver signed. ${result.confirmedBookings} booking(s) confirmed.`;
    waiverForm.reset();
  } catch (error) {
    waiverMessage.classList.add('error');
    waiverMessage.textContent = error.message;
  }
});
