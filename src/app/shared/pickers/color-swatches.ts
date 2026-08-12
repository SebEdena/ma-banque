export interface ColorSwatch {
  /** Hex value persisted on the entity and used to tint its card. */
  readonly value: string;
  /** French name, used as the swatch's accessible label. */
  readonly label: string;
}

/**
 * The fixed palette offered wherever the app asks a user to colour something
 * — accounts and categories today. A closed set rather than a free colour
 * input: it keeps cards and charts legible against both themes, and lets two
 * accounts be told apart at a glance.
 *
 * Fourteen entries, roughly ordered by hue: the twelve seeded categories
 * (`migrations/0005_create_categories.sql`) each need a distinct colour, and
 * the two spare ones leave room to add a category without immediately
 * repeating one. Every value is a Tailwind 500 shade, which is what keeps
 * them balanced against each other in both themes.
 */
export const COLOR_SWATCHES: readonly ColorSwatch[] = [
  { value: '#3b82f6', label: 'Bleu' },
  { value: '#6366f1', label: 'Indigo' },
  { value: '#06b6d4', label: 'Cyan' },
  { value: '#14b8a6', label: 'Turquoise' },
  { value: '#10b981', label: 'Vert' },
  { value: '#84cc16', label: 'Vert anis' },
  { value: '#eab308', label: 'Jaune' },
  { value: '#f59e0b', label: 'Ambre' },
  { value: '#f97316', label: 'Orange' },
  { value: '#ef4444', label: 'Rouge' },
  { value: '#ec4899', label: 'Rose' },
  { value: '#a855f7', label: 'Violet' },
  { value: '#78716c', label: 'Taupe' },
  { value: '#64748b', label: 'Gris' },
];

/** What a create form starts on before the user picks anything. */
export const DEFAULT_COLOR = COLOR_SWATCHES[0].value;
