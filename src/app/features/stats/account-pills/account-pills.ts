import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

import { Account } from '@data/accounts/accounts-api';

/**
 * The statistics screen's account switcher (business requirements §4.5,
 * `docs/spec/09-statistics.md`, user stories 4–5): one pill per active
 * account, each carrying that account's own colour, the currently-charted
 * one visually selected.
 *
 * Presentational: `Stats` owns which account is selected and what happens
 * when a different one is chosen (a route navigation, per the spec's
 * "account scope is switched from within the screen" decision).
 */
@Component({
  selector: 'app-account-pills',
  templateUrl: './account-pills.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AccountPills {
  readonly accounts = input.required<Account[]>();
  readonly selectedAccountId = input.required<number>();

  readonly accountSelected = output<Account>();
}
