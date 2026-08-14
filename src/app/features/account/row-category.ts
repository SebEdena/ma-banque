/** What a row shows in its category column, system entries included. */
export interface RowCategory {
  name: string;
  color: string;
  icon: string;
}

export const SYSTEM_CATEGORY: RowCategory = {
  name: 'Solde initial',
  color: '#64748b',
  icon: 'lucideFlag',
};

export const UNCATEGORIZED: RowCategory = {
  name: '—',
  color: '#94a3b8',
  icon: 'lucideEllipsis',
};
