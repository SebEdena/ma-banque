import { $ } from '@wdio/globals';

describe('app shell', () => {
  it('shows the first-launch folder prompt on a fresh data folder', async () => {
    await expect($('body')).toHaveText('Choisissez où stocker vos données pour commencer.', {
      containing: true,
    });
  });

  it('choosing the default location proceeds to the routed shell', async () => {
    const useDefaultLocation = await $('button=Utiliser l’emplacement par défaut');
    await useDefaultLocation.click();

    await expect($('router-outlet')).toExist();
    await expect($('body')).toHaveText('Accueil', { containing: true });
  });
});
