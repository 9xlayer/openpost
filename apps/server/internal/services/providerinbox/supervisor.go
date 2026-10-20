package providerinbox

import (
	"context"
	"errors"
	"math/rand/v2"
	"time"

	"github.com/google/uuid"
	"github.com/uptrace/bun"
)

type transportLease struct {
	bun.BaseModel `bun:"table:provider_inbox_transport_leases"`
	AccountID     string `bun:",pk"`
	Owner         string
	ExpiresAt     int64
}

// RunLeasedStream supervises one account transport. The worker scheduler calls
// it for eligible accounts; competing workers share a database lease. eligible
// must recheck feature opt-in, active account and authorization. connect should
// resolve current tokens and call MessageStreamAdapter.StreamMessageEvents;
// its connected callback repairs REST gaps before applying buffered live events.
// Cancellation or failed renewal cancels the stream before the lease expires.
func (s *Service) RunLeasedStream(ctx context.Context, accountID string, eligible func(context.Context) (bool, error), connect func(context.Context) error) error {
	if eligible == nil || connect == nil || accountID == "" {
		return errors.New("provider stream callbacks unavailable")
	}
	owner := uuid.NewString()
	delay := time.Second
	for ctx.Err() == nil {
		allowed, err := eligible(ctx)
		if err != nil {
			return err
		}
		if !allowed {
			return nil
		}
		acquired, err := s.acquireTransportLease(ctx, accountID, owner)
		if err != nil {
			return err
		}
		if !acquired {
			return nil
		}
		started := s.now()
		if err = s.runTransportLease(ctx, accountID, owner, eligible, connect); err != nil {
			return err
		}
		if s.now().Sub(started) > time.Minute {
			delay = time.Second
		}
		timer := time.NewTimer(delay + time.Duration(rand.Int64N(int64(delay/2+1))))
		select {
		case <-ctx.Done():
			timer.Stop()
			return ctx.Err()
		case <-timer.C:
		}
		delay = min(delay*2, time.Minute)
	}
	return ctx.Err()
}

func (s *Service) acquireTransportLease(ctx context.Context, accountID, owner string) (bool, error) {
	now := s.now()
	lease := transportLease{AccountID: accountID, Owner: owner, ExpiresAt: now.Add(time.Minute).UnixMilli()}
	result, err := s.db.NewInsert().Model(&lease).On("CONFLICT (account_id) DO UPDATE").Set("owner = EXCLUDED.owner").Set("expires_at = EXCLUDED.expires_at").Where("transport_lease.expires_at <= ?", now.UnixMilli()).Exec(ctx)
	if err != nil {
		return false, err
	}
	count, err := result.RowsAffected()
	return count > 0, err
}

func (s *Service) renewTransportLease(ctx context.Context, accountID, owner string) error {
	now := s.now()
	result, err := s.db.NewUpdate().Model((*transportLease)(nil)).Set("expires_at = ?", now.Add(time.Minute).UnixMilli()).Where("account_id = ? AND owner = ? AND expires_at > ?", accountID, owner, now.UnixMilli()).Exec(ctx)
	if err != nil {
		return err
	}
	count, err := result.RowsAffected()
	if err != nil {
		return err
	}
	if count == 0 {
		return errors.New("provider stream lease lost")
	}
	return nil
}

func (s *Service) runTransportLease(ctx context.Context, accountID, owner string, eligible func(context.Context) (bool, error), connect func(context.Context) error) error {
	streamCtx, cancel := context.WithCancel(ctx)
	defer cancel()
	done := make(chan error, 1)
	go func() { done <- connect(streamCtx) }()
	finished, err := s.monitorTransportLease(streamCtx, accountID, owner, eligible, done)
	cancel()
	if !finished {
		select {
		case <-done:
		case <-time.After(5 * time.Second):
			return errors.New("provider stream did not stop after cancellation")
		}
	}
	cleanupCtx, cleanupCancel := context.WithTimeout(context.WithoutCancel(ctx), 5*time.Second)
	defer cleanupCancel()
	_, releaseErr := s.db.NewDelete().Model((*transportLease)(nil)).Where("account_id = ? AND owner = ?", accountID, owner).Exec(cleanupCtx)
	if releaseErr != nil {
		return releaseErr
	}
	return err
}

func (s *Service) monitorTransportLease(ctx context.Context, accountID, owner string, eligible func(context.Context) (bool, error), done <-chan error) (bool, error) {
	ticker := time.NewTicker(20 * time.Second)
	defer ticker.Stop()
	for {
		select {
		case <-done:
			// Provider disconnects are retried with jitter by the outer supervisor.
			// The connect callback may record a safe provider failure for account health.
			return true, nil
		case <-ctx.Done():
			return false, ctx.Err()
		case <-ticker.C:
			allowed, err := eligible(ctx)
			if err != nil {
				return false, err
			}
			if !allowed {
				return false, nil
			}
			if err = s.renewTransportLease(ctx, accountID, owner); err != nil {
				return false, err
			}
		}
	}
}
