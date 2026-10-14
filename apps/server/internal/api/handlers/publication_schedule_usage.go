package handlers

import (
	"context"
	"time"

	"github.com/openpost/backend/internal/models"
	"github.com/openpost/backend/internal/services/entitlements"
	"github.com/openpost/backend/internal/services/providerreadiness"
	"github.com/openpost/backend/internal/services/publicationauth"
	"github.com/openpost/backend/internal/services/usage"
	"github.com/uptrace/bun"
)

// Read plan configuration before opening the write transaction. The counter
// reservation itself commits with the publication, job and idempotency receipt.
type scheduledUsageReservation struct {
	workspaceID string
	at          time.Time
	metered     bool
	decision    entitlements.Decision
}

func (h *PublicationHandler) prepareScheduledUsage(ctx context.Context, workspaceID string, at time.Time) (scheduledUsageReservation, error) {
	metered, err := h.checkScheduledPublicationQuota(ctx, workspaceID, at)
	if err != nil {
		return scheduledUsageReservation{}, err
	}
	decision, err := h.entitlement.Check(ctx, entitlements.Request{WorkspaceID: workspaceID, Limit: entitlements.LimitScheduledPostsMonthly, Amount: 1})
	if err != nil {
		return scheduledUsageReservation{}, err
	}
	if !decision.Allowed {
		return scheduledUsageReservation{}, scheduledPublicationQuotaError(decision)
	}
	return scheduledUsageReservation{workspaceID: workspaceID, at: at, metered: metered, decision: decision}, nil
}

func (h *PublicationHandler) queueScheduledPublicationTx(ctx context.Context, tx bun.Tx, publicationID string, expectedRevision int, intent providerreadiness.ExecutionIntent, reservation scheduledUsageReservation) (publicationEnqueueResult, error) {
	if reservation.metered {
		value, err := usage.IncrementMonthlyInTransaction(ctx, tx, reservation.workspaceID, entitlements.LimitScheduledPostsMonthly, 1, reservation.at)
		if err != nil {
			return publicationEnqueueResult{}, err
		}
		if !reservation.decision.Unlimited && value > reservation.decision.Limit {
			return publicationEnqueueResult{}, scheduledPublicationQuotaError(reservation.decision)
		}
	}
	return h.queuePublicationWithRunAtTx(ctx, tx, publicationID, expectedRevision, publicationauth.PolicyScheduled, intent, func(current *models.Publication, now time.Time) (time.Time, error) {
		if current.ScheduledAt.IsZero() {
			return time.Time{}, errPublicationScheduleRequired
		}
		if err := validateFuturePublicationSchedule(current.ScheduledAt, now); err != nil {
			return time.Time{}, err
		}
		return current.ScheduledAt, nil
	})
}
