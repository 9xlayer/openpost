package engagement

import (
	"context"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"strings"

	"github.com/google/uuid"
	"github.com/openpost/backend/internal/jobregistry"
	"github.com/openpost/backend/internal/models"
	"github.com/openpost/backend/internal/services/organizationguard"
	"github.com/openpost/backend/internal/services/workspaceaccess"
	"github.com/uptrace/bun"
)

var ErrOperationConflict = errors.New("client operation ID was already used for another comment action")

func (s *Service) QueueEngagementActionReceipt(ctx context.Context, actor Actor, itemID, action, message, operationID string) (string, error) {
	var item models.EngagementItem
	if err := s.db.NewSelect().Model(&item).Where("id=?", itemID).Scan(ctx); errors.Is(err, sql.ErrNoRows) {
		return "", ErrNotFound
	} else if err != nil {
		return "", err
	}
	if err := s.authorize(ctx, item.WorkspaceID, actor, workspaceaccess.LevelEdit); err != nil {
		return "", err
	}
	if !s.isEngagementEnabled(ctx, item.SocialAccountID) {
		return "", fmt.Errorf("engagement is disabled for this account")
	}
	operationID = strings.TrimSpace(operationID)
	if len(operationID) > 128 {
		return "", fmt.Errorf("client operation ID is too long")
	}
	message = strings.TrimSpace(message)
	encoded, _ := json.Marshal([]string{action, message})
	digest := sha256.Sum256(encoded)
	bodyHash := hex.EncodeToString(digest[:])
	jobID := ""
	err := s.db.RunInTx(ctx, &sql.TxOptions{}, func(txCtx context.Context, tx bun.Tx) error {
		if err := organizationguard.LockWorkspace(txCtx, tx, item.WorkspaceID); err != nil {
			return err
		}
		decision, err := workspaceaccess.NewAuthorizer(tx).Authorize(txCtx, item.WorkspaceID, actor, workspaceaccess.LevelEdit)
		if err != nil {
			return err
		}
		if !decision.Allowed {
			return ErrAccessDenied
		}
		if operationID != "" {
			var stored struct {
				BodyHash string
				JobID    string
			}
			err = tx.NewRaw(`SELECT body_hash,job_id FROM engagement_operations WHERE workspace_id=? AND user_id=? AND item_id=? AND operation_id=?`, item.WorkspaceID, actor.UserID, item.ID, operationID).Scan(txCtx, &stored)
			if err == nil {
				if stored.BodyHash != bodyHash {
					return ErrOperationConflict
				}
				jobID = stored.JobID
				return nil
			}
			if !errors.Is(err, sql.ErrNoRows) {
				return err
			}
		}
		if err = tx.NewSelect().Model(&item).WherePK().Scan(txCtx); err != nil {
			return err
		}
		if scoped, ok := s.featureGate.(interface {
			IsEffectiveEnabledWithDB(context.Context, bun.IDB, string, string) (bool, error)
		}); ok {
			enabled, err := scoped.IsEffectiveEnabledWithDB(txCtx, tx, item.SocialAccountID, "engagement")
			if err != nil {
				return err
			}
			if !enabled {
				return fmt.Errorf("engagement is disabled for this account")
			}
		}
		if _, err = validateEngagementAction(item, action, message); err != nil {
			return err
		}
		// A new intentional action gets its own durable payload identity. Only the
		// actor-scoped client receipt identifies a replay, never its text content.
		payload, _ := json.Marshal(engagementActionJob{ItemID: item.ID, Action: action, Message: message, UserID: actor.UserID, ClientOperationID: firstActionID(operationID)})
		job, err := jobregistry.NewJob(JobTypeEngagementAct, string(payload), s.now())
		if err != nil {
			return err
		}
		job.ScopeID = item.WorkspaceID
		if _, err = tx.NewInsert().Model(job).Exec(txCtx); err != nil {
			return err
		}
		jobID = job.ID
		if operationID != "" {
			_, err = tx.NewRaw(`INSERT INTO engagement_operations(workspace_id,user_id,item_id,operation_id,body_hash,job_id) VALUES(?,?,?,?,?,?)`, item.WorkspaceID, actor.UserID, item.ID, operationID, bodyHash, job.ID).Exec(txCtx)
		}
		return err
	})
	return jobID, err
}
func firstActionID(operationID string) string {
	if operationID != "" {
		return operationID
	}
	return uuid.NewString()
}
