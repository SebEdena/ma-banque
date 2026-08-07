import { ComponentFixture, TestBed } from '@angular/core/testing';

import { Home } from './home';

async function createHome(): Promise<ComponentFixture<Home>> {
  await TestBed.configureTestingModule({
    imports: [Home],
  }).compileComponents();

  const fixture = TestBed.createComponent(Home);
  fixture.detectChanges();
  return fixture;
}

describe('Home', () => {
  it('should create', async () => {
    const fixture = await createHome();

    expect(fixture.componentInstance).toBeTruthy();
  });

  it('renders its placeholder content', async () => {
    const fixture = await createHome();
    const compiled = fixture.nativeElement as HTMLElement;

    expect(compiled.textContent).toContain('Accueil');
  });
});
