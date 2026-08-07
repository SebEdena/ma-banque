import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { Settings } from './settings';

describe('Settings', () => {
  let component: Settings;
  let fixture: ComponentFixture<Settings>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Settings],
      providers: [provideRouter([])],
    }).compileComponents();

    fixture = TestBed.createComponent(Settings);
    component = fixture.componentInstance;
    await fixture.whenStable();
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('renders a left sub-nav with Postes / Affichage / Stockage entries', () => {
    const compiled = fixture.nativeElement as HTMLElement;

    expect(compiled.textContent).toContain('Postes');
    expect(compiled.textContent).toContain('Affichage');
    expect(compiled.textContent).toContain('Stockage');
  });

  it('links each sub-nav entry to its child route', () => {
    const links = Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll('a'),
    ) as HTMLAnchorElement[];
    const hrefs = links.map((link) => link.getAttribute('routerLink'));

    expect(hrefs).toContain('categories');
    expect(hrefs).toContain('affichage');
    expect(hrefs).toContain('stockage');
  });
});
