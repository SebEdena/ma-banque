import { $ } from '@wdio/globals';

describe('app shell', () => {
  it('renders the routing skeleton', async () => {
    await expect($('router-outlet')).toExist();
  });

  it('renders the home route by default', async () => {
    await expect($('body')).toHaveText('Accueil', { containing: true });
  });
});
