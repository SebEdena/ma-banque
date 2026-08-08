import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';

import { CurrencyFormatPipe } from '@core/display-settings/currency-format.pipe';
import { DateFormatPipe } from '@core/display-settings/date-format.pipe';
import { DisplaySettingsService } from '@core/display-settings/display-settings';

/**
 * TEMPORARY demo scaffolding, not the real home screen — `03-accounts.md`
 * owns that. The sample date/amount and the Settings link exist only so the
 * Affichage tab's presets can be seen taking effect outside Settings; delete
 * this component's body when the real home screen lands.
 */
@Component({
  selector: 'app-home',
  imports: [RouterLink, DateFormatPipe, CurrencyFormatPipe],
  templateUrl: './home.html',
  styleUrl: './home.css',
})
export class Home {
  protected readonly displaySettings = inject(DisplaySettingsService);

  protected readonly sampleDate = new Date(2026, 2, 5);
  protected readonly sampleAmount = 1234.56;
}
