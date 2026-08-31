/**
 * Employment offer pipeline for teaching / non-teaching staff applications.
 *
 * Applied → Interviewed → Selected → Accepted → Registered
 *
 * Registration may begin only after the candidate has accepted the offer.
 */

const EMPLOYMENT_TYPES = new Set(['teaching-staff', 'non-teaching-staff']);

/** Ordered hiring stages (forward-only). */
const EMPLOYMENT_STAGES = Object.freeze([
  'applied',
  'interviewed',
  'selected',
  'accepted',
  'registered',
]);

/** Closed / exit statuses (not part of the happy path). */
const EMPLOYMENT_EXIT_STATUSES = Object.freeze(['rejected', 'declined', 'archived']);

const ALL_EMPLOYMENT_STATUSES = Object.freeze([...EMPLOYMENT_STAGES, ...EMPLOYMENT_EXIT_STATUSES]);

// Student admissions are deliberately kept separate from staff hiring.  `new`
// remains the stored value for backward compatibility, but is presented as
// "Registered" in the admissions timeline.
const STUDENT_STATUSES = Object.freeze([
  'new',
  'manager_approved',
  'headmaster_approved',
  'admission_letter_printed',
  'archived',
]);

const STATUS_LABELS = Object.freeze({
  applied: 'Applied',
  interviewed: 'Interviewed',
  selected: 'Selected',
  accepted: 'Accepted offer',
  registered: 'Registered',
  rejected: 'Rejected',
  declined: 'Declined offer',
  archived: 'Archived',
  new: 'Registered',
  manager_approved: 'Manager approved',
  headmaster_approved: 'Headmaster approved',
  admission_letter_printed: 'Admission letter printed',
});

/** Legacy staff statuses from the old new/reviewed/archived model. */
const LEGACY_STAFF_STATUS_MAP = Object.freeze({
  new: 'applied',
  reviewed: 'interviewed',
});

function isEmploymentApplication(type) {
  return EMPLOYMENT_TYPES.has(String(type || '').trim());
}

function statusLabel(status) {
  const key = String(status || '').trim();
  return STATUS_LABELS[key] || key || 'Unknown';
}

/**
 * Normalize a staff application status (including legacy values).
 * Student statuses are returned unchanged.
 */
function normalizeApplicationStatus(type, status) {
  const raw = String(status || '').trim() || (isEmploymentApplication(type) ? 'applied' : 'new');
  if (!isEmploymentApplication(type)) {
    // Old student records used `reviewed` as their only approval state.
    return raw === 'reviewed' ? 'manager_approved' : raw;
  }
  if (LEGACY_STAFF_STATUS_MAP[raw]) return LEGACY_STAFF_STATUS_MAP[raw];
  if (ALL_EMPLOYMENT_STATUSES.includes(raw)) return raw;
  return 'applied';
}

function stageIndex(status) {
  return EMPLOYMENT_STAGES.indexOf(status);
}

/**
 * Allowed next statuses from the current employment status.
 * Pipeline moves one step forward; exits are available until registered.
 */
function allowedEmploymentTransitions(fromStatus) {
  const from = normalizeApplicationStatus('teaching-staff', fromStatus);
  const allowed = new Set();

  if (EMPLOYMENT_EXIT_STATUSES.includes(from)) {
    // Re-open to applied, or stay archived/rejected/declined family
    if (from === 'archived') {
      allowed.add('applied');
    }
    return [...allowed];
  }

  const idx = stageIndex(from);
  if (idx >= 0 && idx < EMPLOYMENT_STAGES.length - 1) {
    allowed.add(EMPLOYMENT_STAGES[idx + 1]);
  }

  // Exit options before registration is complete
  if (from !== 'registered') {
    allowed.add('rejected');
    allowed.add('archived');
    if (from === 'selected' || from === 'accepted') {
      allowed.add('declined');
    }
  }

  return [...allowed];
}

function canTransitionEmployment(fromStatus, toStatus) {
  const to = String(toStatus || '').trim();
  if (!ALL_EMPLOYMENT_STATUSES.includes(to)) return false;
  return allowedEmploymentTransitions(fromStatus).includes(to);
}

/**
 * Primary forward action for the admin UI (one clear next step).
 * Returns null when the pipeline is finished or closed.
 */
function getNextEmploymentAction(status) {
  const current = normalizeApplicationStatus('teaching-staff', status);
  const idx = stageIndex(current);
  if (idx < 0 || idx >= EMPLOYMENT_STAGES.length - 1) return null;

  const next = EMPLOYMENT_STAGES[idx + 1];
  const actionLabels = {
    interviewed: 'Mark interviewed',
    selected: 'Mark selected',
    accepted: 'Record offer accepted',
    registered: 'Begin registration',
  };

  return {
    status: next,
    label: actionLabels[next] || `Move to ${statusLabel(next)}`,
    description: nextStepDescription(next),
  };
}

function nextStepDescription(nextStatus) {
  switch (nextStatus) {
    case 'interviewed':
      return 'Interview has been completed with the candidate.';
    case 'selected':
      return 'Candidate is selected and an employment offer may be extended.';
    case 'accepted':
      return 'Candidate has accepted the employment offer.';
    case 'registered':
      return 'Offer accepted — staff registration / onboarding may now begin.';
    default:
      return '';
  }
}

/** Registration is only unlocked after the offer is accepted. */
function canBeginRegistration(status) {
  return normalizeApplicationStatus('teaching-staff', status) === 'accepted';
}

function isRegistrationComplete(status) {
  return normalizeApplicationStatus('teaching-staff', status) === 'registered';
}

function isOpenEmploymentStatus(status) {
  const s = normalizeApplicationStatus('teaching-staff', status);
  return EMPLOYMENT_STAGES.includes(s) && s !== 'registered';
}

/**
 * Validate and apply a status change for any application type.
 * Returns { ok, status, error?, registrationStarted? }.
 */
function applyApplicationStatusChange(type, currentStatus, nextStatus) {
  const isStaff = isEmploymentApplication(type);
  const from = normalizeApplicationStatus(type, currentStatus);
  const to = String(nextStatus || '').trim();

  if (!to) {
    return { ok: false, status: from, error: 'Status is required' };
  }

  if (isStaff) {
    if (to === 'registered' && from !== 'accepted') {
      return {
        ok: false,
        status: from,
        error: 'Registration can only begin after the candidate accepts the offer',
      };
    }
    if (!canTransitionEmployment(from, to)) {
      return {
        ok: false,
        status: from,
        error: `Cannot move employment offer from "${statusLabel(from)}" to "${statusLabel(to)}"`,
      };
    }
    const registrationStarted = to === 'registered';
    return { ok: true, status: to, registrationStarted };
  }

  // Student admission: registered → manager approval → headmaster approval
  // → admission letter printed.  Archiving is allowed from any open stage.
  if (!STUDENT_STATUSES.includes(to)) {
    return { ok: false, status: from, error: `Invalid student application status: ${to}` };
  }
  const studentNext = {
    new: 'manager_approved',
    manager_approved: 'headmaster_approved',
    headmaster_approved: 'admission_letter_printed',
  };
  if (to !== 'archived' && studentNext[from] !== to) {
    return {
      ok: false,
      status: from,
      error: `Cannot move student admission from "${statusLabel(from)}" to "${statusLabel(to)}"`,
    };
  }
  return { ok: true, status: to };
}

function employmentPipelineSnapshot(status) {
  const current = normalizeApplicationStatus('teaching-staff', status);
  const currentIdx = stageIndex(current);
  const isExit = EMPLOYMENT_EXIT_STATUSES.includes(current);

  return EMPLOYMENT_STAGES.map((stage, index) => {
    let state = 'upcoming';
    if (isExit) {
      state = index === 0 ? 'done' : 'upcoming';
      // If they progressed before exit, mark completed stages from history-less heuristic:
      // without history we only know the exit status, so leave stages neutral except applied.
    } else if (currentIdx < 0) {
      state = 'upcoming';
    } else if (index < currentIdx) {
      state = 'done';
    } else if (index === currentIdx) {
      state = 'current';
    }
    return {
      status: stage,
      label: statusLabel(stage),
      state,
    };
  });
}

module.exports = {
  EMPLOYMENT_TYPES,
  EMPLOYMENT_STAGES,
  EMPLOYMENT_EXIT_STATUSES,
  ALL_EMPLOYMENT_STATUSES,
  STUDENT_STATUSES,
  STATUS_LABELS,
  isEmploymentApplication,
  statusLabel,
  normalizeApplicationStatus,
  allowedEmploymentTransitions,
  canTransitionEmployment,
  getNextEmploymentAction,
  canBeginRegistration,
  isRegistrationComplete,
  isOpenEmploymentStatus,
  applyApplicationStatusChange,
  employmentPipelineSnapshot,
  nextStepDescription,
};
