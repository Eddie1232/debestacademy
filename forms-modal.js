// Forms must be submitted before they can be printed.
var formsSubmitted = {
  all: false,
  byWhich: Object.create(null),
};

const FORMS_API_BASE = (() => {
  try {
    const o = localStorage.getItem('debest_admin_api_base');
    if (o && (o.startsWith('http://') || o.startsWith('https://'))) return o;
  } catch (e) { /* ignore */ }
  // Same-origin when served by the site server; fallback for local file / other hosts.
  if (typeof location !== 'undefined' && location.protocol.startsWith('http') && location.host) {
    return location.origin;
  }
  return 'http://127.0.0.1:5500';
})();

function hasSubmitted(which) {
  if (which === 'all-3' || which === 'all') return !!formsSubmitted.all;
  return !!(formsSubmitted.all || formsSubmitted.byWhich[which]);
}

function markSubmitted(which) {
  if (which === 'all-3' || which === 'all') {
    formsSubmitted.all = true;
  } else {
    formsSubmitted.byWhich[which] = true;
  }
}

function fieldValue(name) {
  const el = document.querySelector(`[name="${name}"]`);
  return el ? `${el.value || ''}`.trim() : '';
}

function collectApplicationForms() {
  return {
    student: {
      fullName: fieldValue('student-full-name'),
      dateOfBirth: fieldValue('student-dob'),
      currentGrade: fieldValue('student-current-grade'),
      gender: fieldValue('student-gender'),
      nationality: fieldValue('student-nationality'),
      homeAddress: fieldValue('student-home-address')
    },
    health: {
      studentFullName: fieldValue('health-student-full-name'),
      bloodGroup: fieldValue('health-blood-group'),
      allergies: fieldValue('health-allergies'),
      chronicIllness: fieldValue('health-chronic-illness'),
      immunization: fieldValue('health-immunization'),
      doctorNotes: fieldValue('health-doctor-notes')
    },
    parent: {
      fullName: fieldValue('parent-full-name'),
      relationship: fieldValue('parent-relationship'),
      phone: fieldValue('parent-phone'),
      email: fieldValue('parent-email'),
      address: fieldValue('parent-address'),
      consent: fieldValue('parent-consent')
    }
  };
}

async function sendApplicationToSecretary(which) {
  const forms = collectApplicationForms();
  if (!forms.student.fullName) {
    throw new Error('Please enter the student full name before submitting.');
  }

  const res = await fetch(`${FORMS_API_BASE}/api/applications`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ which: which || 'all-3', forms })
  });

  const rawText = await res.text().catch(() => '');
  let data = {};
  try {
    data = rawText ? JSON.parse(rawText) : {};
  } catch (_) {
    data = {};
  }

  if (!res.ok) {
    throw new Error(data.error || rawText || `Submit failed (HTTP ${res.status})`);
  }

  return data;
}

function printForm(which) {
  if (!hasSubmitted(which)) {
    alert('Please submit the form first before printing.');
    return false;
  }

  // Tag the page so print CSS can hide everything except the selected form card.
  document.body.setAttribute('data-print-mode', which);
  window.print();

  setTimeout(() => {
    document.body.removeAttribute('data-print-mode');
  }, 250);

  return false;
}

async function submitForm(which) {
  try {
    await sendApplicationToSecretary(which);
    markSubmitted(which);
    document.dispatchEvent(
      new CustomEvent('forms:submitted', { detail: { which, at: Date.now() } })
    );
    alert('Submitted. The secretary has received the form. You can now print.');
  } catch (err) {
    const msg = err && err.message ? err.message : 'Submit failed';
    const friendly =
      msg.includes('fetch') || msg.includes('Failed to fetch')
        ? 'Unable to reach the school server. Please make sure the site server is running, then try again.'
        : msg;
    alert(friendly);
  }
  return false;
}

function printAll() {
  if (!hasSubmitted('all-3')) {
    alert('Please submit the forms first before printing.');
    return false;
  }

  // Print 3 separate times so print CSS can show only one card per print.
  const order = ['student-application', 'health-records', 'parent-guardian'];

  const runNext = (idx) => {
    if (idx >= order.length) {
      document.body.removeAttribute('data-print-mode');
      return;
    }

    document.body.setAttribute('data-print-mode', order[idx]);
    window.print();

    // After print dialog closes, move to next.
    setTimeout(() => runNext(idx + 1), 250);
  };

  runNext(0);
  return false;
}

async function submitAll() {
  try {
    await sendApplicationToSecretary('all-3');
    markSubmitted('all-3');
    document.dispatchEvent(
      new CustomEvent('forms:submitted', { detail: { which: 'all-3', at: Date.now() } })
    );
    alert('Submitted. The secretary has received the forms. You can now print.');
  } catch (err) {
    const msg = err && err.message ? err.message : 'Submit failed';
    const friendly =
      msg.includes('fetch') || msg.includes('Failed to fetch')
        ? 'Unable to reach the school server. Please make sure the site server is running, then try again.'
        : msg;
    alert(friendly);
  }
  return false;
}

// Backward compatibility (if any template still calls the old combined helpers).
async function printAndSubmit(which) {
  await submitForm(which);
  return printForm(which);
}

async function printAndSubmitAll() {
  await submitAll();
  return printAll();
}

function printFilledForm(which) {
  return printForm(which);
}
