import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { App } from './app';
import { AccountsApi } from './core/accounts-api/accounts-api';
import { FolderPrompt } from './core/folder-prompt/folder-prompt';
import { SettingsApi } from './core/settings-api/settings-api';

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

async function createApp(settingsApi: Partial<SettingsApi>): Promise<ComponentFixture<App>> {
  await TestBed.configureTestingModule({
    imports: [App],
    providers: [
      provideRouter([]),
      { provide: SettingsApi, useValue: settingsApi },
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
        stubAccountsApi(),
      ],
    }).compileComponents();
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();

    expect(queryFolderPrompt(fixture)).toBe(null);
    expect(fixture.nativeElement.querySelector('router-outlet')).toBe(null);

    resolveFolder('/home/user/saves');
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
    fixture.detectChanges();

    expect(queryFolderPrompt(fixture)).toBe(null);
    expect(fixture.nativeElement.querySelector('router-outlet')).not.toBe(null);
  });
});
