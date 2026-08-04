import stylistic from '@stylistic/eslint-plugin'
import js from '@eslint/js'
import globals from 'globals'
import tseslint from 'typescript-eslint'
import vue from 'eslint-plugin-vue'

// The stylistic rules describe the style the codebase already uses. They are
// not a reformat: the goal is to stop new files from drifting.
const style = {
  '@stylistic/semi': ['error', 'never'],
  '@stylistic/quotes': ['error', 'single', { avoidEscape: true }],
  // `offsetTernaryExpressions` keeps the deeper indent the codebase already
  // uses for object literals inside a ternary branch.
  '@stylistic/indent': ['error', 2, { offsetTernaryExpressions: true }],
  '@stylistic/comma-dangle': ['error', 'always-multiline'],
  '@stylistic/object-curly-spacing': ['error', 'always'],
  '@stylistic/eol-last': ['error', 'always'],
  '@stylistic/no-trailing-spaces': 'error',
  '@stylistic/max-len': ['warn', { code: 80, ignoreUrls: true }],
}

export default tseslint.config(
  {
    ignores: [
      'out/**', 'release/**', 'build/**', 'node_modules/**',
      // Código de terceiro mantido byte a byte igual ao upstream, para que
      // atualizar seja um diff. Ver src/plugins/lineTools/README.md.
      'src/plugins/lineTools/**',
    ],
  },

  js.configs.recommended,
  ...tseslint.configs.recommended,
  ...vue.configs['flat/recommended'],
  stylistic.configs.customize({
    semi: false,
    quotes: 'single',
    indent: 2,
    braceStyle: '1tbs',
    arrowParens: true,
  }),

  {
    files: ['**/*.{ts,vue}'],
    languageOptions: {
      globals: { ...globals.browser, ...globals.node },
      parserOptions: {
        parser: tseslint.parser,
        ecmaVersion: 'latest',
        sourceType: 'module',
      },
    },
    rules: {
      ...style,
      // Emit/props declarations legitimately mix quoted keys (`update:model`)
      // with bare ones, and icon registries mix `'1INCH'` with `AAVE`.
      '@stylistic/quote-props': 'off',
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      'vue/multi-word-component-names': 'off',
      'vue/attributes-order': 'warn',
      'vue/max-attributes-per-line': 'off',
      'vue/singleline-html-element-content-newline': 'off',
    },
  },

  // ARCHITECTURE: the desktop processes may only depend on `@shared`. Reaching
  // into `@/` would couple the utility and main processes to the renderer.
  {
    files: ['electron/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@/*', '**/src/*'],
              message:
                'electron/ não pode importar do renderer. Use @shared/.',
            },
          ],
        },
      ],
    },
  },

  // ARCHITECTURE: the indicator library runs in a Worker and nowhere else.
  // Importing it on the renderer thread would put an O(n) recalculation on the
  // same thread that draws candles and commits the order book (ADR-0003) — the
  // one property the whole indicator design exists to protect.
  {
    files: ['src/**/*.{ts,vue}'],
    ignores: ['src/workers/**'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: 'lightweight-charts-indicators',
              message:
                'O cálculo de indicadores vive em src/workers/. '
                + 'Fale com ele pelo protocolo em domain/indicatorProtocol.ts.',
            },
          ],
        },
      ],
    },
  },

  // ARCHITECTURE: `shared/` is the contract between processes. It must stay
  // free of both renderer and Electron dependencies.
  {
    files: ['shared/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@/*', 'electron', 'vue'],
              message:
                'shared/ é neutro: sem dependência de renderer ou Electron.',
            },
          ],
        },
      ],
    },
  },
)
