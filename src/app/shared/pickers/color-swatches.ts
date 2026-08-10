export interface ColorSwatch {
  /** Hex value persisted on the entity and used to tint its card. */
  readonly value: string;
  /** French name, used as the swatch's accessible label. */
  readonly label: string;
}

/**
 * The fixed palette offered wherever the app asks a user to colour something
 * — accounts today, categories next. A closed set rather than a free colour
 * input: it keeps cards and charts legible against both themes, and lets two
 * accounts be told apart at a glance.
 */
export const COLOR_SWATCHES: readonly ColorSwatch[] = [
  { value: '#3b82f6', label: 'Bleu' },
  { value: '#06b6d4', label: 'Cyan' },
  { value: '#10b981', label: 'Vert' },
  { value: '#84cc16', label: 'Vert anis' },
  { value: '#eab308', label: 'Jaune' },
  { value: '#f97316', label: 'Orange' },
  { value: '#ef4444', label: 'Rouge' },
  { value: '#ec4899', label: 'Rose' },
  { value: '#a855f7', label: 'Violet' },
  { value: '#64748b', label: 'Gris' },
];

/** What a create form starts on before the user picks anything. */
export const DEFAULT_COLOR = COLOR_SWATCHES[0].value;
