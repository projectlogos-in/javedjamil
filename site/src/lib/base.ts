// import.meta.env.BASE_URL is not guaranteed to carry a trailing slash
// (depends on how `base` is set in astro.config.mjs). Normalize once here
// so every internal href can safely do `${base}some-path/`.
export const base = import.meta.env.BASE_URL.replace(/\/?$/, "/");
