const PROPOSAL_STATUSES = Object.freeze({
  DRAFT: 'draft',
  PENDING_MANAGER_REVIEW: 'pending_manager_review',
  AWAITING_HEADMASTER_APPROVAL: 'awaiting_headmaster_approval',
  APPROVED: 'approved',
  REJECTED: 'rejected',
  REVISIONS_REQUESTED: 'revisions_requested',
  FINAL_APPROVED: 'final_approved'
});

function getNextStatus(role, action, currentStatus) {
  if (role === 'Secretary') {
    if (action === 'submit' && currentStatus === PROPOSAL_STATUSES.DRAFT) {
      return PROPOSAL_STATUSES.PENDING_MANAGER_REVIEW;
    }
    if (action === 'save') return PROPOSAL_STATUSES.DRAFT;
    return currentStatus;
  }

  if (role === 'Manager') {
    if (action === 'approve' && currentStatus === PROPOSAL_STATUSES.PENDING_MANAGER_REVIEW) {
      return PROPOSAL_STATUSES.AWAITING_HEADMASTER_APPROVAL;
    }
    if (action === 'reject' && currentStatus === PROPOSAL_STATUSES.PENDING_MANAGER_REVIEW) {
      return PROPOSAL_STATUSES.REJECTED;
    }
    if (action === 'request-revisions' && currentStatus === PROPOSAL_STATUSES.PENDING_MANAGER_REVIEW) {
      return PROPOSAL_STATUSES.REVISIONS_REQUESTED;
    }
    return currentStatus;
  }

  if (role === 'Headmaster') {
    if (action === 'approve' && currentStatus === PROPOSAL_STATUSES.AWAITING_HEADMASTER_APPROVAL) {
      return PROPOSAL_STATUSES.FINAL_APPROVED;
    }
    if (action === 'reject' && currentStatus !== PROPOSAL_STATUSES.APPROVED) {
      return PROPOSAL_STATUSES.REJECTED;
    }
    if (action === 'request-revisions' && currentStatus === PROPOSAL_STATUSES.AWAITING_HEADMASTER_APPROVAL) {
      return PROPOSAL_STATUSES.REVISIONS_REQUESTED;
    }
    return currentStatus;
  }

  return currentStatus;
}

function applyProposalToEvents(events, proposal) {
  const nextEvents = { ...(events || {}) };
  if (!proposal || !proposal.event) return nextEvents;

  const date = proposal.event.date;
  const entry = {
    title: proposal.event.title,
    type: proposal.event.type || 'General',
    notes: proposal.event.notes || ''
  };

  const existing = nextEvents[date] || [];
  const idx = existing.findIndex((item) => item.title === entry.title && item.type === entry.type);
  if (idx >= 0) {
    existing[idx] = entry;
  } else {
    existing.push(entry);
  }

  nextEvents[date] = existing;
  return nextEvents;
}

function applyProposalToNews(items, proposal) {
  const nextItems = Array.isArray(items) ? [...items] : [];
  if (!proposal || !proposal.event) return nextItems;

  const item = {
    id: proposal.id,
    title: proposal.event.title || 'News announcement',
    body: proposal.event.notes || '',
    date: proposal.event.date || new Date().toISOString().slice(0, 10),
    category: proposal.event.type || 'Announcement',
    publishedBy: proposal.reviewedBy || proposal.createdBy || 'Secretary'
  };

  const existingIndex = nextItems.findIndex((entry) => entry.id === item.id);
  if (existingIndex >= 0) {
    nextItems[existingIndex] = item;
  } else {
    nextItems.unshift(item);
  }

  return nextItems;
}

module.exports = {
  PROPOSAL_STATUSES,
  getNextStatus,
  applyProposalToEvents,
  applyProposalToNews
};
