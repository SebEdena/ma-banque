import { ComponentFixture, TestBed } from '@angular/core/testing';

import { Categories } from './categories';

describe('Categories', () => {
  let component: Categories;
  let fixture: ComponentFixture<Categories>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Categories],
    }).compileComponents();

    fixture = TestBed.createComponent(Categories);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('renders its placeholder content', () => {
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.textContent).toContain('Catégories');
  });
});
