import { $ } from '@wdio/globals';

/**
 * Gets past the first-launch folder prompt if it's still showing, then
 * confirms the routed shell is up. Idempotent — call it from every spec
 * file's `before` hook regardless of whether an earlier file in the same
 * grouped session already cleared the prompt.
 */
export async function ensureRoutedShell(): Promise<void> {
  const useDefaultLocation = $('button=Utiliser l’emplacement par défaut');
  if (await useDefaultLocation.isExisting()) {
    await useDefaultLocation.click();
  }
  await expect($('router-outlet')).toExist();
}
