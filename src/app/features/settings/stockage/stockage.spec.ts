import { ComponentFixture, TestBed } from '@angular/core/testing';

import { Stockage } from './stockage';

describe('Stockage', () => {
  let fixture: ComponentFixture<Stockage>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [Stockage] }).compileComponents();
    fixture = TestBed.createComponent(Stockage);
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(fixture.componentInstance).toBeTruthy();
  });

  it('renders its placeholder content', () => {
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.textContent).toContain('Stockage');
  });
});
