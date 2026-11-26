<script setup lang="ts">
defineProps<{ frame: string }>()
</script>

<template>
  <figure class="am-intro-player" aria-label="Пример работы плеера">
    <div class="am-intro-player__screen">
      <img :src="frame" alt="" draggable="false" />
      <span class="am-intro-player__play" aria-hidden="true"></span>
      <span class="am-intro-player__progress" aria-hidden="true"></span>
    </div>
    <figcaption>
      <div class="am-intro-player__info">
        <div>
          <strong>Серия 1</strong>
          <span class="am-intro-player__voice">Озвучка AniStar</span>
        </div>
        <span class="am-intro-player__time">09:47 / 28:28</span>
      </div>
      <div class="am-intro-player__episodes">
        <span>Серии</span>
        <ol aria-label="Серии">
          <li
            v-for="episode in 5"
            :key="episode"
            :aria-current="episode === 1 ? 'true' : undefined"
          >
            {{ episode }}
          </li>
        </ol>
      </div>
    </figcaption>
  </figure>
</template>

<style scoped>
.am-intro-player {
  min-width: 0;
  margin: 0;
  overflow: hidden;
  background: var(--am-fill-1);
  border: 1px solid var(--am-line);
  border-radius: var(--am-r-l);
}

.am-intro-player__screen {
  position: relative;
  display: grid;
  place-items: center;
  max-height: clamp(106px, 31vh, 260px);
  aspect-ratio: 16 / 9;
  background: #101927;
}

.am-intro-player__screen img {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.am-intro-player__play {
  position: relative;
  display: grid;
  place-items: center;
  width: 44px;
  height: 44px;
  background: rgb(5 13 25 / 0.76);
  border-radius: 50%;
}

.am-intro-player__play::after {
  width: 0;
  height: 0;
  margin-inline-start: 3px;
  border-block: 6px solid transparent;
  border-inline-start: 10px solid white;
  content: '';
}

.am-intro-player__progress {
  position: absolute;
  inset: auto 12px 12px;
  height: 3px;
  background: linear-gradient(90deg, #8ac3ff 34.4%, rgb(219 232 251 / 0.48) 34.4%);
  border-radius: 3px;
  box-shadow: 0 0 2px rgb(0 0 0 / 0.8);
}

.am-intro-player__info {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 4px 12px;
  padding: 12px 13px;
  border-bottom: 1px solid var(--am-line-soft);
}

.am-intro-player__info strong {
  display: block;
  font-size: 14px;
}

.am-intro-player__voice,
.am-intro-player__time,
.am-intro-player__episodes > span {
  color: var(--am-dim);
  font-size: 12px;
}

.am-intro-player__time {
  font-variant-numeric: tabular-nums;
}

.am-intro-player__episodes {
  display: grid;
  gap: 8px;
  padding: 10px 13px 13px;
}

.am-intro-player__episodes ol {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 4px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.am-intro-player__episodes li {
  padding: 6px 0;
  font-size: 13px;
  text-align: center;
  border-radius: var(--am-r-s);
}

.am-intro-player__episodes [aria-current='true'] {
  color: var(--am-accent);
  background: rgb(var(--am-accent-rgb) / 0.12);
}

@media (max-height: 690px) {
  .am-intro-player__screen {
    max-height: clamp(88px, 21vh, 150px);
  }

  .am-intro-player__info {
    padding-block: 7px;
  }

  .am-intro-player__episodes {
    gap: 4px;
    padding-block: 6px 8px;
  }

  .am-intro-player__episodes li {
    padding-block: 4px;
  }
}

@media (max-width: 350px) and (max-height: 610px) {
  .am-intro-player__episodes {
    padding-block: 4px 7px;
  }

  .am-intro-player__episodes > span {
    display: none;
  }
}

@media (min-width: 540px) and (orientation: landscape) and (max-height: 510px) {
  .am-intro-player figcaption {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    align-items: center;
  }

  .am-intro-player__info {
    border-bottom: 0;
    border-inline-end: 1px solid var(--am-line-soft);
  }
}
</style>
