// Отбор списка живёт вне показа экрана: возврат с карточки
// собирает экран заново и сбрасывал закладку, порядок и слово поиска.
import { ref } from 'vue'

export type SortName = 'updated' | 'score' | 'rating' | 'nameUp' | 'nameDown'

/** Вид показа: компактные строки и строки с миниатюрой; крупные постеры на телевизоре — шесть на экран.
 *  По умолчанию wide: по списку узнают глазами. */
export type ViewName = 'slim' | 'wide'

export const keptStatus = ref<string>('CURRENT')

export const keptSort = ref<SortName>('updated')

export const keptView = ref<ViewName>('wide')

export const keptWord = ref('')
