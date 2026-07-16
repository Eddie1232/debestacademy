// Forms must be submitted before they can be printed.
var formsSubmitted = {
  all: false,
  byWhich: Object.create(null),
  bySet: Object.create(null),
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

const FORM_SETS = {
  student: {
    type: 'student',
    which: 'student-all',
    printOrder: ['student-application', 'health-records', 'parent-guardian'],
    label: 'student',
  },
  'teaching-staff': {
    type: 'teaching-staff',
    which: 'teaching-all',
    printOrder: ['teaching-application', 'teaching-qualifications', 'teaching-referees'],
    label: 'teaching staff',
  },
  'non-teaching-staff': {
    type: 'non-teaching-staff',
    which: 'non-teaching-all',
    printOrder: ['nonteach-application', 'nonteach-experience', 'nonteach-referees'],
    label: 'non-teaching staff',
  },
};

function hasSubmitted(which) {
  if (which === 'all-3' || which === 'all' || which === 'student-all') {
    return !!(formsSubmitted.all || formsSubmitted.bySet.student || formsSubmitted.byWhich['student-all']);
  }
  if (which === 'teaching-all') return !!formsSubmitted.bySet['teaching-staff'];
  if (which === 'non-teaching-all') return !!formsSubmitted.bySet['non-teaching-staff'];
  return !!(formsSubmitted.all || formsSubmitted.byWhich[which] || formsSubmitted.bySet[which]);
}

function markSubmitted(which, formSet) {
  if (which === 'all-3' || which === 'all' || which === 'student-all') {
    formsSubmitted.all = true;
    formsSubmitted.bySet.student = true;
  } else if (formSet) {
    formsSubmitted.bySet[formSet] = true;
  } else {
    formsSubmitted.byWhich[which] = true;
  }
}

function fieldValue(name) {
  const el = document.querySelector(`[name="${name}"]`);
  return el ? `${el.value || ''}`.trim() : '';
}

function collectStudentForms() {
  return {
    student: {
      fullName: fieldValue('student-full-name'),
      dateOfBirth: fieldValue('student-dob'),
      currentGrade: fieldValue('student-current-grade'),
      gender: fieldValue('student-gender'),
      nationality: fieldValue('student-nationality'),
      campus: fieldValue('student-campus'),
      homeAddress: fieldValue('student-home-address'),
    },
    health: {
      studentFullName: fieldValue('health-student-full-name'),
      bloodGroup: fieldValue('health-blood-group'),
      allergies: fieldValue('health-allergies'),
      chronicIllness: fieldValue('health-chronic-illness'),
      immunization: fieldValue('health-immunization'),
      doctorNotes: fieldValue('health-doctor-notes'),
    },
    parent: {
      fullName: fieldValue('parent-full-name'),
      relationship: fieldValue('parent-relationship'),
      phone: fieldValue('parent-phone'),
      email: fieldValue('parent-email'),
      address: fieldValue('parent-address'),
      consent: fieldValue('parent-consent'),
    },
  };
}

function collectTeachingForms() {
  return {
    teaching: {
      fullName: fieldValue('teach-full-name'),
      dateOfBirth: fieldValue('teach-dob'),
      gender: fieldValue('teach-gender'),
      nationality: fieldValue('teach-nationality'),
      phone: fieldValue('teach-phone'),
      email: fieldValue('teach-email'),
      position: fieldValue('teach-position'),
      campus: fieldValue('teach-campus'),
      subjects: fieldValue('teach-subjects'),
      availability: fieldValue('teach-availability'),
      address: fieldValue('teach-address'),
    },
    teachingQualifications: {
      highestQualification: fieldValue('teach-qualification'),
      institution: fieldValue('teach-institution'),
      yearCompleted: fieldValue('teach-qual-year'),
      licence: fieldValue('teach-licence'),
      yearsExperience: fieldValue('teach-years-experience'),
      employer: fieldValue('teach-employer'),
      experience: fieldValue('teach-experience'),
      motivation: fieldValue('teach-motivation'),
    },
    teachingReferees: {
      referee1Name: fieldValue('teach-ref1-name'),
      referee1Contact: fieldValue('teach-ref1-contact'),
      referee1Relation: fieldValue('teach-ref1-relation'),
      referee2Name: fieldValue('teach-ref2-name'),
      referee2Contact: fieldValue('teach-ref2-contact'),
      referee2Relation: fieldValue('teach-ref2-relation'),
      emergencyContact: fieldValue('teach-emergency'),
      declaration: fieldValue('teach-declaration'),
    },
  };
}

function collectNonTeachingForms() {
  return {
    nonTeaching: {
      fullName: fieldValue('nonteach-full-name'),
      dateOfBirth: fieldValue('nonteach-dob'),
      gender: fieldValue('nonteach-gender'),
      nationality: fieldValue('nonteach-nationality'),
      phone: fieldValue('nonteach-phone'),
      email: fieldValue('nonteach-email'),
      position: fieldValue('nonteach-position'),
      campus: fieldValue('nonteach-campus'),
      availability: fieldValue('nonteach-availability'),
      startDate: fieldValue('nonteach-start-date'),
      address: fieldValue('nonteach-address'),
    },
    nonTeachingExperience: {
      education: fieldValue('nonteach-education'),
      certificates: fieldValue('nonteach-certificates'),
      yearsExperience: fieldValue('nonteach-years-experience'),
      employer: fieldValue('nonteach-employer'),
      skills: fieldValue('nonteach-skills'),
      experience: fieldValue('nonteach-experience'),
      motivation: fieldValue('nonteach-motivation'),
    },
    nonTeachingReferees: {
      referee1Name: fieldValue('nonteach-ref1-name'),
      referee1Contact: fieldValue('nonteach-ref1-contact'),
      referee1Relation: fieldValue('nonteach-ref1-relation'),
      referee2Name: fieldValue('nonteach-ref2-name'),
      referee2Contact: fieldValue('nonteach-ref2-contact'),
      referee2Relation: fieldValue('nonteach-ref2-relation'),
      emergencyContact: fieldValue('nonteach-emergency'),
      declaration: fieldValue('nonteach-declaration'),
    },
  };
}

// Backward-compatible alias used by older call sites.
function collectApplicationForms() {
  return collectStudentForms();
}

function collectFormsForSet(formSet) {
  if (formSet === 'teaching-staff') return collectTeachingForms();
  if (formSet === 'non-teaching-staff') return collectNonTeachingForms();
  return collectStudentForms();
}

function validateFormsForSet(formSet, forms) {
  if (formSet === 'teaching-staff') {
    const name = forms.teaching?.fullName || '';
    if (!name) throw new Error('Please enter your full name on the teaching application form before submitting.');
    return;
  }
  if (formSet === 'non-teaching-staff') {
    const name = forms.nonTeaching?.fullName || '';
    if (!name) throw new Error('Please enter your full name on the non-teaching application form before submitting.');
    return;
  }
  const studentName = forms.student?.fullName || '';
  if (!studentName) {
    throw new Error('Please enter the student full name before submitting.');
  }
}

async function sendApplicationToSecretary(which, formSet) {
  const setKey = formSet || 'student';
  const meta = FORM_SETS[setKey] || FORM_SETS.student;
  const forms = collectFormsForSet(setKey);
  validateFormsForSet(setKey, forms);

  const res = await fetch(`${FORMS_API_BASE}/api/applications`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      which: which || meta.which,
      type: meta.type,
      forms,
    }),
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

  document.body.setAttribute('data-print-mode', which);
  window.print();

  setTimeout(() => {
    document.body.removeAttribute('data-print-mode');
  }, 250);

  return false;
}

async function submitForm(which) {
  try {
    await sendApplicationToSecretary(which, 'student');
    markSubmitted(which, 'student');
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
  return printFormSet('student');
}

function printFormSet(formSet) {
  const meta = FORM_SETS[formSet];
  if (!meta) {
    alert('Unknown form set.');
    return false;
  }

  if (!hasSubmitted(meta.which) && !formsSubmitted.bySet[formSet]) {
    alert('Please submit the forms first before printing.');
    return false;
  }

  const order = meta.printOrder.slice();

  const runNext = (idx) => {
    if (idx >= order.length) {
      document.body.removeAttribute('data-print-mode');
      return;
    }

    document.body.setAttribute('data-print-mode', order[idx]);
    window.print();
    setTimeout(() => runNext(idx + 1), 250);
  };

  runNext(0);
  return false;
}

async function submitAll() {
  return submitFormSet('student');
}

async function submitFormSet(formSet) {
  const meta = FORM_SETS[formSet] || FORM_SETS.student;
  try {
    await sendApplicationToSecretary(meta.which, formSet);
    markSubmitted(meta.which, formSet);
    document.dispatchEvent(
      new CustomEvent('forms:submitted', {
        detail: { which: meta.which, formSet, at: Date.now() },
      })
    );
    alert(
      `Submitted. The secretary has received the ${meta.label} forms. You can now print.`
    );
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

function switchFormSet(formSet) {
  const tabs = document.querySelectorAll('.form-tab');
  const panels = document.querySelectorAll('.form-set-panel');

  tabs.forEach((tab) => {
    const active = tab.getAttribute('data-form-set') === formSet;
    tab.classList.toggle('is-active', active);
    tab.setAttribute('aria-selected', active ? 'true' : 'false');
  });

  panels.forEach((panel) => {
    const active = panel.getAttribute('data-form-set') === formSet;
    panel.classList.toggle('is-active', active);
    if (active) {
      panel.removeAttribute('hidden');
    } else {
      panel.setAttribute('hidden', '');
    }
  });

  // Deep-link friendly hash without jumping the page awkwardly.
  try {
    if (formSet && formSet !== 'student') {
      history.replaceState(null, '', `#${formSet}`);
    } else {
      history.replaceState(null, '', location.pathname + location.search);
    }
  } catch (_) { /* ignore */ }
}

function initFormTabs() {
  document.querySelectorAll('.form-tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      const set = tab.getAttribute('data-form-set');
      if (set) switchFormSet(set);
    });
  });

  document.querySelectorAll('[data-action="submit"]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      const set = btn.getAttribute('data-form-set') || 'student';
      return submitFormSet(set);
    });
  });

  document.querySelectorAll('[data-action="print"]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      const set = btn.getAttribute('data-form-set') || 'student';
      return printFormSet(set);
    });
  });

  // Open the right tab if the URL hash points to a staff set.
  const hash = (location.hash || '').replace(/^#/, '');
  if (hash === 'teaching-staff' || hash === 'non-teaching-staff' || hash === 'student') {
    switchFormSet(hash);
  } else if (hash === 'teaching') {
    switchFormSet('teaching-staff');
  } else if (hash === 'non-teaching' || hash === 'staff') {
    switchFormSet('non-teaching-staff');
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initFormTabs, { once: true });
} else {
  initFormTabs();
}
