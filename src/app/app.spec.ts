import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { toast } from '@spartan-ng/brain/sonner';

import { App } from './app';
import { AccountsApi } from './data/accounts/accounts-api';
import { RecurringRulesApi } from './data/recurring-rules/recurring-rules-api';
import { FolderPrompt } from './features/onboarding/folder-prompt/folder-prompt';
import { SettingsApi } from './core/settings-api/settings-api';

// Spied rather than mocked: this shell renders the toaster itself, so the
// module has to stay real.
beforeEach(() => {
  vi.spyOn(toast, 'error').mockReturnValue('');
});

/**
 * The routed shell renders the sidebar, whose account rail reads the account
 * lists — stubbed here so these tests stay about the data-folder gate.
 */
function stubAccountsApi() {
  return {
    provide: AccountsApi,
    useValue: {
      listActiveAccounts: vi.fn().mockResolvedValue([]),
      listArchivedAccounts: vi.fn().mockResolvedValue([]),
    },
  };
}

interface StubRecurringRulesApi {
  generateAllDue: ReturnType<typeof vi.fn>;
  openAccount: ReturnType<typeof vi.fn>;
}

function stubRecurringRulesApi(
  generateAllDue = vi.fn().mockResolvedValue(undefined),
): StubRecurringRulesApi {
  return { generateAllDue, openAccount: vi.fn().mockResolvedValue(0) };
}

function stubMatchMedia(): void {
  vi.stubGlobal(
    'matchMedia',
    vi.fn().mockReturnValue({
      matches: false,
      media: '(prefers-color-scheme: dark)',
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }),
  );
}

async function createApp(
  settingsApi: Partial<SettingsApi>,
  recurringRulesApi: StubRecurringRulesApi = stubRecurringRulesApi(),
): Promise<ComponentFixture<App>> {
  await TestBed.configureTestingModule({
    imports: [App],
    providers: [
      provideRouter([]),
      { provide: SettingsApi, useValue: settingsApi },
      { provide: RecurringRulesApi, useValue: recurringRulesApi },
      stubAccountsApi(),
    ],
  }).compileComponents();

  const fixture = TestBed.createComponent(App);
  await fixture.whenStable();
  fixture.detectChanges();
  return fixture;
}

function queryFolderPrompt(fixture: ComponentFixture<App>) {
  return fixture.debugElement.query((n) => n.componentInstance instanceof FolderPrompt);
}

describe('App', () => {
  beforeEach(() => {
    stubMatchMedia();
  });

  it('should create the app', async () => {
    const fixture = await createApp({
      getCurrentDataFolder: vi.fn().mockResolvedValue('/home/user/saves'),
    });

    expect(fixture.componentInstance).toBeTruthy();
  });

  it('renders a loading state while the data folder check is pending', async () => {
    let resolveFolder!: (folder: string | null) => void;
    const pending = new Promise<string | null>((resolve) => (resolveFolder = resolve));

    await TestBed.configureTestingModule({
      imports: [App],
      providers: [
        provideRouter([]),
        { provide: SettingsApi, useValue: { getCurrentDataFolder: () => pending } },
        { provide: RecurringRulesApi, useValue: stubRecurringRulesApi() },
        stubAccountsApi(),
      ],
    }).compileComponents();
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();

    expect(queryFolderPrompt(fixture)).toBe(null);
    expect(fixture.nativeElement.querySelector('router-outlet')).toBe(null);

    resolveFolder('/home/user/saves');
    // Twice: the shell waits on the recurring sweep after the folder check.
    await fixture.whenStable();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('router-outlet')).not.toBe(null);
  });

  it('renders the routed shell once a data folder is configured', async () => {
    const fixture = await createApp({
      getCurrentDataFolder: vi.fn().mockResolvedValue('/home/user/saves'),
    });

    expect(queryFolderPrompt(fixture)).toBe(null);
    expect(fixture.nativeElement.querySelector('router-outlet')).not.toBe(null);
  });

  it('renders the blocking folder prompt when no data folder is configured', async () => {
    const fixture = await createApp({
      getCurrentDataFolder: vi.fn().mockResolvedValue(null),
    });

    expect(queryFolderPrompt(fixture)).not.toBe(null);
  });

  it('renders the blocking folder prompt when get_current_data_folder rejects', async () => {
    const fixture = await createApp({
      getCurrentDataFolder: vi.fn().mockRejectedValue({ kind: 'Io', message: 'boom' }),
    });

    expect(queryFolderPrompt(fixture)).not.toBe(null);
  });

  it('proceeds to the routed shell once the folder prompt resolves', async () => {
    const fixture = await createApp({
      getCurrentDataFolder: vi.fn().mockResolvedValue(null),
    });

    const promptDebugElement = queryFolderPrompt(fixture);
    (promptDebugElement!.componentInstance as FolderPrompt).resolved.emit();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(queryFolderPrompt(fixture)).toBe(null);
    expect(fixture.nativeElement.querySelector('router-outlet')).not.toBe(null);
  });

  /**
   * The sweep has to finish first: `AccountsStore` loads in its own
   * constructor, so a shell rendered before it would show pre-generation
   * balances on the home screen's cards.
   */
  it('sweeps every account for due occurrences before the routed shell renders', async () => {
    let resolveSweep!: () => void;
    const sweep = new Promise<void>((resolve) => (resolveSweep = resolve));
    const recurringRulesApi = stubRecurringRulesApi(vi.fn().mockReturnValue(sweep));

    await TestBed.configureTestingModule({
      imports: [App],
      providers: [
        provideRouter([]),
        {
          provide: SettingsApi,
          useValue: { getCurrentDataFolder: vi.fn().mockResolvedValue('/home/user/saves') },
        },
        { provide: RecurringRulesApi, useValue: recurringRulesApi },
        stubAccountsApi(),
      ],
    }).compileComponents();
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    await Promise.resolve();
    fixture.detectChanges();

    expect(recurringRulesApi.generateAllDue).toHaveBeenCalled();
    expect(fixture.nativeElement.querySelector('router-outlet')).toBe(null);

    resolveSweep();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('router-outlet')).not.toBe(null);
  });

  it('does not sweep while the data folder is still unresolved', async () => {
    const recurringRulesApi = stubRecurringRulesApi();

    await createApp({ getCurrentDataFolder: vi.fn().mockResolvedValue(null) }, recurringRulesApi);

    expect(recurringRulesApi.generateAllDue).not.toHaveBeenCalled();
  });

  it('renders the routed shell anyway when the sweep rejects', async () => {
    const fixture = await createApp(
      { getCurrentDataFolder: vi.fn().mockResolvedValue('/home/user/saves') },
      stubRecurringRulesApi(vi.fn().mockRejectedValue({ kind: 'Io', message: 'disque plein' })),
    );

    expect(toast.error).toHaveBeenCalledWith('disque plein');
    expect(fixture.nativeElement.querySelector('router-outlet')).not.toBe(null);
  });
});
