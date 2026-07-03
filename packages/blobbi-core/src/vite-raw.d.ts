// Ambient declaration for Vite's `?raw` import suffix, used in unit tests to
// load a module's source text as a string. Vite/Vitest handle this at runtime;
// this declaration keeps `tsc --noEmit` happy in the standalone repo.
declare module '*?raw' {
  const content: string;
  export default content;
}
