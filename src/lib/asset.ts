/** Resolves a file in /public so it also works when the site is served from a sub-path. */
export const asset = (path: string) => `${import.meta.env.BASE_URL}${path.replace(/^\//, '')}`
