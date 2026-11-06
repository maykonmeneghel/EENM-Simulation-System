import type { Tag } from '../../application/anatomy3d';
import { tr } from '../../i18n/locale';

/** Where a drawn value comes from (docs/design/3d-view.md §1). */
export const TAG_LABEL: Record<Tag, () => string> = {
  model: () => tr({ 'pt-BR': 'modelo', en: 'model' }),
  atlas: () => tr({ 'pt-BR': 'atlas', en: 'atlas' }),
  illustrative: () => tr({ 'pt-BR': 'ilustrativo', en: 'illustrative' }),
};

