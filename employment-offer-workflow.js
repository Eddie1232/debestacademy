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

/** Roles that appear as the actor on employment audit entries. */
const AUDIT_STAFF_ROLES = Object.freeze(['Secretary', 'Manager', 'Headmaster', 'SuperAdmin']);

function newAuditId() {
  return `audit-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function isStaffActor(role, by) {
  const r = String(role || '').trim();
  if (AUDIT_STAFF_ROLES.includes(r)) return true;
  return AUDIT_STAFF_ROLES.includes(String(by || '').trim());
}

function inferAuditRole(entry) {
  const role = String(entry?.role || '').trim();
  if (role) return role;
  const by = String(entry?.by || '').trim();
  if (AUDIT_STAFF_ROLES.includes(by) || by === 'applicant' || by === 'system') return by;
  return by || 'system';
}

/**
 * Human-readable sentence for a hiring action.
 * Example: "Created application for John Doe"
 */
function describeEmploymentAction({
  status,
  applicantName,
  fromStatus,
  action,
  createdByStaff,
} = {}) {
  const name = String(applicantName || '').trim() || 'the applicant';
  const act = String(action || '').trim();

  if (act === 'notes_updated') {
    return `Updated notes for ${name}`;
  }

  if (act === 'created') {
    return createdByStaff
      ? `Created application for ${name}`
      : `Application submitted for ${name}`;
  }

  switch (String(status || '').trim()) {
    case 'interviewed':
      return `Marked ${name} as interviewed`;
    case 'selected':
      return `Selected ${name} for an employment offer`;
    case 'accepted':
      return `Recorded offer acceptance for ${name}`;
    case 'registered':
      return `Started registration for ${name}`;
    case 'rejected':
      return `Rejected application for ${name}`;
    case 'declined':
      return `Recorded offer declined for ${name}`;
    case 'archived':
      return `Archived application for ${name}`;
    case 'applied':
      if (fromStatus === 'archived') return `Reopened application for ${name}`;
      return createdByStaff
        ? `Created application for ${name}`
        : `Application submitted for ${name}`;
    default:
      return `Updated employment application for ${name}`;
  }
}

function describeStudentAction({ status, applicantName, action, createdByStaff } = {}) {
  const name = String(applicantName || '').trim() || 'the student';
  const act = String(action || '').trim();
  if (act === 'notes_updated') return `Updated notes for ${name}`;
  if (act === 'created' || status === 'new') {
    return createdByStaff ? `Created application for ${name}` : `Application submitted for ${name}`;
  }
  switch (String(status || '').trim()) {
    case 'manager_approved':
      return `Manager approved admission for ${name}`;
    case 'headmaster_approved':
      return `Headmaster approved admission for ${name}`;
    case 'admission_letter_printed':
      return `Marked admission letter printed for ${name}`;
    case 'archived':
      return `Archived application for ${name}`;
    default:
      return `Updated application for ${name}`;
  }
}

function describeApplicationAction(type, opts = {}) {
  return isEmploymentApplication(type)
    ? describeEmploymentAction(opts)
    : describeStudentAction(opts);
}

/** "15 Oct 2026" — pass timeZone in tests so the calendar day is stable. */
function formatEmploymentAuditDate(iso, timeZone) {
  const date = iso instanceof Date ? iso : new Date(iso);
  if (!Number.isFinite(date.getTime())) return 'Date unavailable';
  const opts = { day: 'numeric', month: 'short', year: 'numeric' };
  if (timeZone) opts.timeZone = timeZone;
  return date.toLocaleDateString('en-GB', opts);
}

function formatEmploymentAuditActor(entry) {
  const role = String(entry?.role || '').trim();
  const by = String(entry?.by || '').trim();
  if (AUDIT_STAFF_ROLES.includes(role)) return role;
  if (role === 'applicant' || by === 'applicant') return 'Applicant';
  if (role === 'system' || by === 'system') return 'System';
  if (AUDIT_STAFF_ROLES.includes(by)) return by;
  return by || role || 'Unknown';
}

/**
 * Display shape for one audit row:
 *   15 Oct 2026 — Secretary
 *   Created application for John Doe
 */
function presentEmploymentAuditEntry(entry, options = {}) {
  const date = formatEmploymentAuditDate(entry?.at, options.timeZone);
  const actor = formatEmploymentAuditActor(entry);
  const description = String(
    entry?.description ||
      describeEmploymentAction({
        status: entry?.status,
        applicantName: options.applicantName || entry?.applicantName,
        fromStatus: entry?.fromStatus,
        action: entry?.action,
        createdByStaff: isStaffActor(entry?.role, entry?.by),
      })
  ).trim();
  const headline = `${date} — ${actor}`;
  return {
    date,
    actor,
    description,
    headline,
    lines: [headline, description],
    text: `${headline}\n${description}`,
  };
}

function createEmploymentAuditEntry({
  status,
  fromStatus,
  action,
  applicantName,
  by,
  role,
  at,
  applicationId,
  createdByStaff,
  id,
  type,
} = {}) {
  const resolvedAction = action || (fromStatus ? 'status_changed' : 'created');
  const staff = createdByStaff ?? isStaffActor(role, by);
  const description = describeApplicationAction(type || 'teaching-staff', {
    status,
    applicantName,
    fromStatus,
    action: resolvedAction,
    createdByStaff: staff,
  });
  const entry = {
    id: id || newAuditId(),
    at: at || new Date().toISOString(),
    by: by || '',
    role: role || '',
    action: resolvedAction,
    status: status || '',
    description,
  };
  if (fromStatus) entry.fromStatus = fromStatus;
  if (applicationId) entry.applicationId = applicationId;
  return entry;
}

/** Append-only: never mutates previous entries. */
function appendEmploymentAuditEntry(history, entry) {
  const list = Array.isArray(history) ? history.map((item) => ({ ...item })) : [];
  list.push({
    ...entry,
    id: entry?.id || newAuditId(),
    at: entry?.at || new Date().toISOString(),
    by: entry?.by || '',
    role: entry?.role || '',
  });
  return list;
}

function hydrateEmploymentHistory(application, applicantName) {
  if (!application || typeof application !== 'object') return [];
  const type = application.type || 'student';
  const isStaff = isEmploymentApplication(type);
  const name =
    String(applicantName || '').trim() || (isStaff ? 'the applicant' : 'the student');
  const current = normalizeApplicationStatus(type, application.status);
  const raw = Array.isArray(application.statusHistory)
    ? application.statusHistory.filter((item) => item && typeof item === 'object' && !Array.isArray(item))
    : [];

  if (!raw.length) {
    const initialStatus = isStaff ? 'applied' : 'new';
    let list = [
      createEmploymentAuditEntry({
        type,
        status: initialStatus,
        action: 'created',
        applicantName: name,
        by: 'system',
        role: 'system',
        at: application.submittedAt || new Date().toISOString(),
        applicationId: application.id,
        createdByStaff: false,
      }),
    ];
    if (current !== initialStatus) {
      list = appendEmploymentAuditEntry(
        list,
        createEmploymentAuditEntry({
          type,
          status: current,
          fromStatus: initialStatus,
          action: 'status_changed',
          applicantName: name,
          by: application.reviewedBy || 'system',
          role: inferAuditRole({ by: application.reviewedBy, role: 'system' }),
          at: application.reviewedAt || application.submittedAt || new Date().toISOString(),
          applicationId: application.id,
        })
      );
    }
    return list;
  }

  return raw.map((entry, index) => {
    const next = { ...entry };
    if (!next.role) next.role = inferAuditRole(next);
    if (!next.action) {
      const initialStatus = isStaff ? 'applied' : 'new';
      const isOpening =
        index === 0 && !next.fromStatus && (next.status === initialStatus || !next.status);
      next.action = isOpening ? 'created' : 'status_changed';
    }
    if (!next.description) {
      next.description = describeApplicationAction(type, {
        status: next.status,
        applicantName: name,
        fromStatus: next.fromStatus,
        action: next.action,
        createdByStaff: isStaffActor(next.role, next.by),
      });
    }
    if (application.id && !next.applicationId) next.applicationId = application.id;
    return next;
  });
}

function collectEmploymentAuditLog(applications, getApplicantName, options = {}) {
  const entries = [];
  (applications || []).forEach((app) => {
    if (!isEmploymentApplication(app?.type)) return;
    const name =
      typeof getApplicantName === 'function' ? getApplicantName(app) : 'the applicant';
    const history = hydrateEmploymentHistory(app, name);
    history.forEach((entry) => {
      const presented = presentEmploymentAuditEntry(entry, {
        ...options,
        applicantName: name,
      });
      entries.push({
        ...entry,
        applicationId: app.id,
        applicantName: name,
        date: presented.date,
        actor: presented.actor,
        headline: presented.headline,
        description: presented.description,
        text: presented.text,
      });
    });
  });
  entries.sort((a, b) => new Date(b.at || 0) - new Date(a.at || 0));
  return entries;
}

module.exports = {
  EMPLOYMENT_TYPES,
  EMPLOYMENT_STAGES,
  EMPLOYMENT_EXIT_STATUSES,
  ALL_EMPLOYMENT_STATUSES,
  STUDENT_STATUSES,
  STATUS_LABELS,
  AUDIT_STAFF_ROLES,
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
  describeEmploymentAction,
  describeApplicationAction,
  formatEmploymentAuditDate,
  formatEmploymentAuditActor,
  presentEmploymentAuditEntry,
  createEmploymentAuditEntry,
  appendEmploymentAuditEntry,
  hydrateEmploymentHistory,
  collectEmploymentAuditLog,
  isStaffActor,
};
