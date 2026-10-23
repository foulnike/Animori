// Слой окошка человека, а не состояние компонента: открывают его описания и полки работ.
// Окошко одно: два спорили бы за Escape; историю переходов «человек → человек» ведёт оно само.

import { shallowRef } from 'vue'

import type { PersonTarget } from '@/api/anilist-person'

/** Кто показан прямо сейчас. `null` — окошка нет. */
export const shownPerson = shallowRef<PersonTarget | null>(null)

/** Открывает окошко даже при уже открытом: прежнего окошко само кладёт в свою историю. */
export function openPerson(target: PersonTarget): void {
  shownPerson.value = target
}

export function closePerson(): void {
  shownPerson.value = null
}
