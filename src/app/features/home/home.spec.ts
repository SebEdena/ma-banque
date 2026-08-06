import { ComponentFixture, TestBed } from '@angular/core/testing';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}));

import { invoke } from '@tauri-apps/api/core';

import { Home } from './home';

async function createHome(): Promise<ComponentFixture<Home>> {
  await TestBed.configureTestingModule({
    imports: [Home],
  }).compileComponents();

  const fixture = TestBed.createComponent(Home);
  await fixture.whenStable();
  return fixture;
}

describe('Home', () => {
  afterEach(() => {
    vi.mocked(invoke).mockReset();
  });

  it('should create', async () => {
    vi.mocked(invoke).mockResolvedValue(null);

    const fixture = await createHome();

    expect(fixture.componentInstance).toBeTruthy();
  });

  it('renders its placeholder content', async () => {
    vi.mocked(invoke).mockResolvedValue(null);

    const fixture = await createHome();
    const compiled = fixture.nativeElement as HTMLElement;

    expect(compiled.textContent).toContain('Accueil');
  });

  it('displays the data folder returned by the get-current-folder command', async () => {
    vi.mocked(invoke).mockResolvedValue('/home/user/saves');

    const fixture = await createHome();
    const compiled = fixture.nativeElement as HTMLElement;

    expect(invoke).toHaveBeenCalledWith('get_current_data_folder');
    expect(compiled.textContent).toContain('/home/user/saves');
  });

  it('displays a "no folder set" state when the command returns null', async () => {
    vi.mocked(invoke).mockResolvedValue(null);

    const fixture = await createHome();
    const compiled = fixture.nativeElement as HTMLElement;

    expect(compiled.textContent).toContain('Aucun dossier configuré');
  });

  it('logs and does not throw when the command rejects', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const error = new Error('backend failure');
    vi.mocked(invoke).mockRejectedValue(error);

    const fixture = await createHome();
    const compiled = fixture.nativeElement as HTMLElement;

    expect(consoleError).toHaveBeenCalledWith('failed to get the current data folder', error);
    expect(compiled.textContent).toContain('Aucun dossier configuré');
    consoleError.mockRestore();
  });
});
