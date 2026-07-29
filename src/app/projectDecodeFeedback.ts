import type { ProjectDecodeResult } from '../persistence/projectCodec';

type Translate = (
  key: string,
  options?: Record<string, string | number>,
) => string;

/**
 * Turn a reasoned decode result into a user-visible diagnostic.
 *
 * Successful, lossless decodes intentionally return null.
 */
export function projectDecodeFeedback(
  result: ProjectDecodeResult,
  t: Translate,
): string | null {
  if (!result.ok) {
    return t('errors.projectDecodeFailed', {
      reason: t(`errors.projectDecodeReasons.${result.reason}`),
    });
  }
  if (result.discardedItemCount === 0) return null;
  const reasons = [...new Set(
    result.discardedItems.map((item) =>
      t(`errors.projectDecodeReasons.${item.reason}`),
    ),
  )];
  return t('errors.projectRecovered', {
    count: result.discardedItemCount,
    reasons: reasons.join(', '),
  });
}
