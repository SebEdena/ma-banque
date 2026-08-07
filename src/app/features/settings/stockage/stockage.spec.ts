import { ComponentFixture, TestBed } from '@angular/core/testing';

import { SettingsApi } from '../../../core/settings-api/settings-api';
import { Stockage } from './stockage';

vi.mock('@tauri-apps/plugin-dialog', () => ({
  open: vi.fn(),
}));

vi.mock('@spartan-ng/brain/sonner', () => ({
  toast: { error: vi.fn() },
}));

async function createStockage(
  settingsApi: Partial<SettingsApi>,
): Promise<ComponentFixture<Stockage>> {
  await TestBed.configureTestingModule({
    imports: [Stockage],
    providers: [{ provide: SettingsApi, useValue: settingsApi }],
  }).compileComponents();

  const fixture = TestBed.createComponent(Stockage);
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
  return fixture;
}

async function clickButton(fixture: ComponentFixture<Stockage>, text: string): Promise<void> {
  const buttons = Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('button'));
  const button = buttons.find((b) => b.textContent?.includes(text));
  if (!button) {
    throw new Error(`no button found containing "${text}"`);
  }
  button.click();
  await fixture.whenStable();
  fixture.detectChanges();
}

describe('Stockage', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('displays the current data folder path', async () => {
    const fixture = await createStockage({
      getCurrentDataFolder: vi.fn().mockResolvedValue('/home/user/saves'),
    });

    expect((fixture.nativeElement as HTMLElement).textContent).toContain('/home/user/saves');
  });

  it('"move data folder" opens a folder picker and calls move_data_folder', async () => {
    const { open } = await import('@tauri-apps/plugin-dialog');
    vi.mocked(open).mockResolvedValue('/new/home');
    const moveDataFolder = vi.fn().mockResolvedValue('/new/home');
    const fixture = await createStockage({
      getCurrentDataFolder: vi.fn().mockResolvedValue('/home/user/saves'),
      moveDataFolder,
    });

    await clickButton(fixture, 'Déplacer le dossier de données');

    expect(open).toHaveBeenCalledWith(expect.objectContaining({ directory: true }));
    expect(moveDataFolder).toHaveBeenCalledWith('/new/home');
  });

  it('"open a different folder" opens a folder picker and calls open_data_folder', async () => {
    const { open } = await import('@tauri-apps/plugin-dialog');
    vi.mocked(open).mockResolvedValue('/other/folder');
    const openDataFolder = vi.fn().mockResolvedValue('/other/folder');
    const fixture = await createStockage({
      getCurrentDataFolder: vi.fn().mockResolvedValue('/home/user/saves'),
      openDataFolder,
    });

    await clickButton(fixture, 'Ouvrir un autre dossier');

    expect(open).toHaveBeenCalledWith(expect.objectContaining({ directory: true }));
    expect(openDataFolder).toHaveBeenCalledWith('/other/folder');
  });

  it('does nothing when the picker is cancelled', async () => {
    const { open } = await import('@tauri-apps/plugin-dialog');
    vi.mocked(open).mockResolvedValue(null);
    const moveDataFolder = vi.fn();
    const fixture = await createStockage({
      getCurrentDataFolder: vi.fn().mockResolvedValue('/home/user/saves'),
      moveDataFolder,
    });

    await clickButton(fixture, 'Déplacer le dossier de données');

    expect(moveDataFolder).not.toHaveBeenCalled();
  });

  it('surfaces the destination-occupied move error as a toast, verbatim', async () => {
    const { open } = await import('@tauri-apps/plugin-dialog');
    const { toast } = await import('@spartan-ng/brain/sonner');
    vi.mocked(open).mockResolvedValue('/occupied');
    const moveDataFolder = vi.fn().mockRejectedValue({ kind: 'DestinationOccupied' });
    const fixture = await createStockage({
      getCurrentDataFolder: vi.fn().mockResolvedValue('/home/user/saves'),
      moveDataFolder,
    });

    await clickButton(fixture, 'Déplacer le dossier de données');

    expect(toast.error).toHaveBeenCalledWith('the destination folder already contains a save');
  });

  it('surfaces the invalid-database open error as a toast, verbatim', async () => {
    const { open } = await import('@tauri-apps/plugin-dialog');
    const { toast } = await import('@spartan-ng/brain/sonner');
    vi.mocked(open).mockResolvedValue('/bad/save');
    const openDataFolder = vi.fn().mockRejectedValue({ kind: 'InvalidExistingSave' });
    const fixture = await createStockage({
      getCurrentDataFolder: vi.fn().mockResolvedValue('/home/user/saves'),
      openDataFolder,
    });

    await clickButton(fixture, 'Ouvrir un autre dossier');

    expect(toast.error).toHaveBeenCalledWith('the folder contains an invalid or incompatible save');
  });
});
