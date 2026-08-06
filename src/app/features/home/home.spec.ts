import { ComponentFixture, TestBed } from '@angular/core/testing';

import { Home } from './home';

function stubTauriInvoke(invoke: ReturnType<typeof vi.fn>): void {
  vi.stubGlobal('__TAURI_INTERNALS__', { invoke });
}

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
    vi.unstubAllGlobals();
  });

  it('should create', async () => {
    stubTauriInvoke(vi.fn().mockResolvedValue(null));

    const fixture = await createHome();

    expect(fixture.componentInstance).toBeTruthy();
  });

  it('renders its placeholder content', async () => {
    stubTauriInvoke(vi.fn().mockResolvedValue(null));

    const fixture = await createHome();
    const compiled = fixture.nativeElement as HTMLElement;

    expect(compiled.textContent).toContain('Accueil');
  });

  it('displays the data folder returned by the get-current-folder command', async () => {
    const invoke = vi.fn().mockResolvedValue('/home/user/saves');
    stubTauriInvoke(invoke);

    const fixture = await createHome();
    const compiled = fixture.nativeElement as HTMLElement;

    expect(invoke).toHaveBeenCalledWith('get_current_data_folder', {}, undefined);
    expect(compiled.textContent).toContain('/home/user/saves');
  });

  it('displays a "no folder set" state when the command returns null', async () => {
    stubTauriInvoke(vi.fn().mockResolvedValue(null));

    const fixture = await createHome();
    const compiled = fixture.nativeElement as HTMLElement;

    expect(compiled.textContent).toContain('Aucun dossier configuré');
  });

  it('logs and does not throw when the command rejects', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const error = new Error('backend failure');
    stubTauriInvoke(vi.fn().mockRejectedValue(error));

    const fixture = await createHome();
    const compiled = fixture.nativeElement as HTMLElement;

    expect(consoleError).toHaveBeenCalledWith('failed to get the current data folder', error);
    expect(compiled.textContent).toContain('Aucun dossier configuré');
    consoleError.mockRestore();
  });
});
