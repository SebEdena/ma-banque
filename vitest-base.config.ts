import { defineConfig } from 'vitest/config';

/**
 * Merged into the Angular CLI's generated Vitest config (`runnerConfig: true`
 * in `angular.json`'s `test` builder — see `@angular/build`'s
 * `findVitestBaseConfig`). The only thing this repo needs from it: working
 * around a packaging bug in `@unovis/angular@1.6.7` (`docs/spec/09-statistics.md`).
 * Its ESM build (`dist/lib/esm2015/**`) re-exports submodules without file
 * extensions (e.g. `export * from './containers'`, where both a
 * `containers.js` file and a same-named `containers/` folder exist). Vitest
 * externalizes node_modules packages and loads them through Node's native
 * ESM resolver by default, which enforces exact extensions and refuses that
 * as an ambiguous directory import. Vite's own resolver is lenient about
 * this (the same way webpack/rollup are, which is what this Angular Package
 * Format build actually targets) — `server.deps.inline` routes the package
 * through Vite's transform pipeline instead of Node's, sidestepping the bug
 * without patching node_modules or pinning a different version.
 */
export default defineConfig({
  test: {
    server: {
      deps: {
        inline: ['@unovis/angular'],
      },
    },
  },
});
