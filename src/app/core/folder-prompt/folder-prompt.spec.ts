import { ComponentFixture, TestBed } from '@angular/core/testing';

import { SettingsApi } from '../settings-api/settings-api';
import { FolderPrompt } from './folder-prompt';

vi.mock('@spartan-ng/brain/sonner', () => ({
  toast: { error: vi.fn() },
}));

async function createFolderPrompt(
  settingsApi: Partial<SettingsApi>,
): Promise<ComponentFixture<FolderPrompt>> {
  await TestBed.configureTestingModule({
    imports: [FolderPrompt],
    providers: [{ provide: SettingsApi, useValue: settingsApi }],
  }).compileComponents();

  const fixture = TestBed.createComponent(FolderPrompt);
  fixture.detectChanges();
  return fixture;
}

async function clickButton(fixture: ComponentFixture<FolderPrompt>, text: string): Promise<void> {
  const buttons = Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('button'));
  const button = buttons.find((b) => b.textContent?.includes(text));
  if (!button) {
    throw new Error(`no button found with text "${text}"`);
  }
  button.click();
  await fixture.whenStable();
  fixture.detectChanges();
}

describe('FolderPrompt', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders the two choices', async () => {
    const fixture = await createFolderPrompt({});
    const compiled = fixture.nativeElement as HTMLElement;

    expect(compiled.textContent).toContain('Utiliser l’emplacement par défaut');
    expect(compiled.textContent).toContain('Choisir un dossier');
  });

  it('"use default location" calls SettingsApi.setDefaultDataFolder and emits resolved', async () => {
    const setDefaultDataFolder = vi.fn().mockResolvedValue('/default/saves');
    const fixture = await createFolderPrompt({ setDefaultDataFolder });

    let resolved = false;
    fixture.componentInstance.resolved.subscribe(() => (resolved = true));

    await clickButton(fixture, 'Utiliser l’emplacement par défaut');

    expect(setDefaultDataFolder).toHaveBeenCalled();
    expect(resolved).toBe(true);
  });

  it('"use default location" surfaces an error as a toast and does not emit resolved', async () => {
    const { toast } = await import('@spartan-ng/brain/sonner');
    const setDefaultDataFolder = vi.fn().mockRejectedValue({ kind: 'Io', message: 'disk full' });
    const fixture = await createFolderPrompt({ setDefaultDataFolder });

    let resolved = false;
    fixture.componentInstance.resolved.subscribe(() => (resolved = true));

    await clickButton(fixture, 'Utiliser l’emplacement par défaut');

    expect(toast.error).toHaveBeenCalledWith('disk full');
    expect(resolved).toBe(false);
  });

  it('"choose a folder" opens the OS picker and calls SettingsApi.openDataFolder', async () => {
    const pickFolder = vi.fn().mockResolvedValue('/chosen/path');
    const openDataFolder = vi.fn().mockResolvedValue('/chosen/path');
    const fixture = await createFolderPrompt({ pickFolder, openDataFolder });

    let resolved = false;
    fixture.componentInstance.resolved.subscribe(() => (resolved = true));

    await clickButton(fixture, 'Choisir un dossier');

    expect(pickFolder).toHaveBeenCalled();
    expect(openDataFolder).toHaveBeenCalledWith('/chosen/path');
    expect(resolved).toBe(true);
  });

  it('"choose a folder" does nothing when the picker is cancelled', async () => {
    const pickFolder = vi.fn().mockResolvedValue(null);
    const openDataFolder = vi.fn();
    const fixture = await createFolderPrompt({ pickFolder, openDataFolder });

    let resolved = false;
    fixture.componentInstance.resolved.subscribe(() => (resolved = true));

    await clickButton(fixture, 'Choisir un dossier');

    expect(openDataFolder).not.toHaveBeenCalled();
    expect(resolved).toBe(false);
  });

  it('"choose a folder" surfaces a rejected command error as a toast, in French', async () => {
    const { toast } = await import('@spartan-ng/brain/sonner');
    const pickFolder = vi.fn().mockResolvedValue('/bad/path');
    const openDataFolder = vi.fn().mockRejectedValue({ kind: 'InvalidExistingSave' });
    const fixture = await createFolderPrompt({ pickFolder, openDataFolder });

    await clickButton(fixture, 'Choisir un dossier');

    expect(toast.error).toHaveBeenCalledWith(
      'le dossier contient une sauvegarde invalide ou incompatible',
    );
  });
});
