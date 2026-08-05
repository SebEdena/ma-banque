import { ComponentFixture, TestBed } from '@angular/core/testing';

import { Stats } from './stats';

describe('Stats', () => {
  let component: Stats;
  let fixture: ComponentFixture<Stats>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Stats],
    }).compileComponents();

    fixture = TestBed.createComponent(Stats);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('renders its placeholder content', () => {
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.textContent).toContain('Statistiques');
  });
});
