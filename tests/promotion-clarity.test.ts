import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { isCurrentPromotion, promotionProgress, type PromotionRequest } from '../src/lib/promotions.ts';
const request = (status: PromotionRequest['status'], expires_at: string | null = null) => ({ status, expires_at } as PromotionRequest);

test('promotion labels distinguish unpaid, review, visibility and closed requests', () => {
  assert.equal(promotionProgress(request('awaiting_payment')).label,'Payment needed');
  assert.match(promotionProgress(request('pending')).help,/Do not pay again/);
  assert.equal(promotionProgress(request('active'),false).label,'Promotion active · not currently showing');
  assert.equal(promotionProgress(request('active','2000-01-01T00:00:00Z')).label,'Promotion ended');
  assert.match(promotionProgress(request('rejected')).help,/contact support before/);
  assert.match(promotionProgress(request('cancelled')).help,/refund/);
  for (const status of ['awaiting_payment','pending','active'] as const) assert.equal(isCurrentPromotion(request(status)),true);
  for (const status of ['rejected','cancelled','expired'] as const) assert.equal(isCurrentPromotion(request(status)),false);
  assert.equal(isCurrentPromotion(request('active','2000-01-01T00:00:00Z')),false);
});
test('payment instructions stay outside collapsed history, duplicate requests reuse their card', () => {
  const page=readFileSync('src/pages/PromotionsPage.tsx','utf8');
  assert.match(page,/current\.map\(card\)/); assert.match(page,/previous\.map\(card\)/);
  assert.match(page,/if \(existing\) \{ setFocusRequest\(existing\.id\); return;/);
  assert.match(page,/scrollIntoView/); assert.match(page,/prefers-reduced-motion/);
  const card=readFileSync('src/components/PromotionRequestCard.tsx','utf8');
  assert.match(card,/disabled=\{busy \|\| !accepted \|\| reference.trim\(\).length < 3\}/);
  assert.match(card,/ConfirmDialog/); assert.match(card,/r\.payment_instructions/); assert.match(card,/r\.terms/);
});

test('an unsubmitted draft can be cancelled without creating a request', () => {
  const actions = readFileSync('src/components/PromotionDraftActions.tsx', 'utf8');
  assert.match(actions, /type="button" disabled=\{busy\} onClick=\{onCancel\}/);
  assert.match(actions, /type="button" disabled=\{busy\} onClick=\{onContinue\}/);
  assert.match(actions, /existing \? 'Back to dashboard' : 'Cancel'/);
  assert.doesNotMatch(actions, /supabase|\.rpc\(|fetch\(/);
  const page = readFileSync('src/pages/PromotionsPage.tsx', 'utf8');
  assert.match(page, /onCancel=\{\(\) => navigate\(profile\?\.role === 'owner' \? '\/dashboard\?tab=vehicles' : '\/dashboard'\)\}/);
});

test('only unpaid requests offer cancellation and it requires confirmation', () => {
  const card = readFileSync('src/components/PromotionRequestCard.tsx', 'utf8');
  assert.match(card, /r\.status === 'awaiting_payment' && <button type="button" disabled=\{busy\}[^\n]+setCancel\(true\)[^\n]+Cancel promotion/);
  assert.ok(card.indexOf('Cancel promotion') < card.indexOf('1. Pay'));
  assert.match(card, /confirmLabel="Cancel unpaid promotion" cancelLabel="Keep promotion" onConfirm=\{\(\) => act\(true\)\}/);
  assert.match(card, /if \(lock\.current\) return/);
  assert.match(card, /cancelling \? null : reference\.trim\(\)/);
  const page = readFileSync('src/pages/PromotionsPage.tsx', 'utf8');
  assert.match(page, /reference === null \? await supabase\.rpc\('cancel_unpaid_promotion'/);
});
