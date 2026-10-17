// Слой окошка человека, а не состояние компонента: открывают и описания, и полки работ.
// Два окошка спорили бы за Escape, а к одному экрану окошко не привязать.

import { shallowRef } from 'vue'

import type { PersonTarget } from '@/api/anilist-person'

/** Кто показан прямо сейчас. `null` — окошка нет. */
export const shownPerson = shallowRef<PersonTarget | null>(null)

/** Зовётся и при открытом окошке: ссылка из описания ведёт на другого человека. */
export function openPerson(target: PersonTarget): void {
  shownPerson.value = target
}

export function closePerson(): void {
  shownPerson.value = null
}
